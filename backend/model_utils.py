"""
model_utils.py
==============
Chargement des modèles PyTorch (ResNet-50, ViT-S/16), prédiction de sévérité
et génération de Grad-CAM, pour les deux maladies supportées : UC (Mayo) et
Crohn (classification à 7 niveaux).

Les poids attendus dans backend/models/ :
    best_resnet50_limuc.pth     -> ResNet-50, UC      (4 classes : Mayo 0-3)
    best_resnet50_crohnipi.pth  -> ResNet-50, Crohn    (7 classes)
    best_vit_s16_limuc.pth      -> ViT-S/16,  UC       (4 classes)
    best_vit_s16_crohnipi.pth   -> ViT-S/16,  Crohn    (7 classes)

Le chargement est volontairement "adaptatif" : on ne connaît pas avec
certitude le format exact utilisé lors de la sauvegarde (state_dict brut,
checkpoint dict avec clé 'model_state_dict', préfixe 'module.' lié à
DataParallel, etc.). On essaie plusieurs stratégies dans l'ordre et on
rapporte une erreur claire si aucune ne fonctionne, plutôt que de planter
silencieusement ou de produire des prédictions incohérentes.
"""

import os
import traceback

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
import torchvision.models as tv_models
import torchvision.transforms as T
import timm
import cv2
from PIL import Image

# ──────────────────────────────────────────────────────────────────────────
# CONFIGURATION GÉNÉRALE
# ──────────────────────────────────────────────────────────────────────────

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# Taille d'entrée attendue par les deux architectures
IMG_SIZE = 224

# Normalisation ImageNet standard (utilisée pour le pré-entraînement de
# ResNet-50 et ViT-S/16). À adapter si un entraînement avec d'autres
# statistiques (ex: stats spécifiques au dataset endoscopique) a été utilisé.
IMAGENET_MEAN = [0.485, 0.456, 0.406]
IMAGENET_STD = [0.229, 0.224, 0.225]

PREPROCESS = T.Compose([
    T.Resize((IMG_SIZE, IMG_SIZE)),
    T.ToTensor(),
    T.Normalize(mean=IMAGENET_MEAN, std=IMAGENET_STD),
])

# ──────────────────────────────────────────────────────────────────────────
# ÉCHELLES DE SÉVÉRITÉ
# ──────────────────────────────────────────────────────────────────────────
# L'ordre des "levels" DOIT correspondre à l'ordre des classes en sortie du
# modèle (index 0 = premier élément de la liste, etc.)

SEVERITY_SCALES = {
    "uc": {
        "name": "Score de Mayo endoscopique",
        "levels": [
            {"code": "0", "label": "Mayo 0 — Muqueuse normale"},
            {"code": "1", "label": "Mayo 1 — Érythème léger"},
            {"code": "2", "label": "Mayo 2 — Friabilité, érosions"},
            {"code": "3", "label": "Mayo 3 — Ulcérations spontanées saignantes"},
        ],
    },
    "crohn": {
        "name": "Classification endoscopique des lésions (CD)",
        "levels": [
            {"code": "N", "label": "N — Non pathologique"},
            {"code": "E", "label": "E — Érythème"},
            {"code": "O", "label": "O — Œdème"},
            {"code": "S", "label": "S — Sténose"},
            {"code": "AU", "label": "AU — Ulcération aphtoïde (< 3 mm)"},
            {"code": "U3-10", "label": "U3-10 — Ulcération 3–10 mm"},
            {"code": "U>10", "label": "U>10 — Ulcération > 10 mm"},
        ],
    },
}

# Fichiers de poids attendus, par maladie et par modèle.
# "cnn" n'a pas de poids fourni : il restera indisponible (géré proprement,
# message clair côté API plutôt qu'un crash).
EXPECTED_WEIGHTS = {
    "uc": {
        "resnet": "best_resnet50_limuc.pth",
        "vit": "best_vit_s16_limuc.pth",
    },
    "crohn": {
        "resnet": "best_resnet50_crohnipi.pth",
        "vit": "best_vit_s16_crohnipi.pth",
    },
}

# Modèles effectivement chargés en mémoire.
# loaded_models[disease][model_key] = {"model": nn.Module, "kind": "resnet"|"vit"}
loaded_models = {"uc": {}, "crohn": {}}

# Dernière couche utilisée pour Grad-CAM, mise en cache par modèle chargé.
_gradcam_targets = {}


# ──────────────────────────────────────────────────────────────────────────
# CONSTRUCTION DES ARCHITECTURES
# ──────────────────────────────────────────────────────────────────────────

def _build_resnet50(n_classes: int) -> nn.Module:
    """Construit un ResNet-50 (torchvision) avec une tête de classification
    adaptée au nombre de classes. On essaie d'abord la forme la plus simple
    (Linear unique), c'est la convention la plus courante."""
    model = tv_models.resnet50(weights=None)
    model.fc = nn.Linear(model.fc.in_features, n_classes)
    return model


def _build_vit_s16(n_classes: int) -> nn.Module:
    """Construit un ViT-S/16 (timm) avec une tête de classification adaptée."""
    model = timm.create_model(
        "vit_small_patch16_224", pretrained=False, num_classes=n_classes
    )
    return model


BUILDERS = {
    "resnet": _build_resnet50,
    "vit": _build_vit_s16,
}


# ──────────────────────────────────────────────────────────────────────────
# CHARGEMENT ADAPTATIF DES POIDS
# ──────────────────────────────────────────────────────────────────────────

def _extract_state_dict(raw):
    """Extrait un state_dict utilisable à partir de ce que torch.load a
    renvoyé, quel que soit le format de sauvegarde utilisé."""
    if isinstance(raw, dict):
        # Format "checkpoint complet" : on cherche la clé la plus probable.
        for key in ("model_state_dict", "state_dict", "model", "net"):
            if key in raw and isinstance(raw[key], dict):
                return raw[key]
        # Sinon, c'est peut-être déjà un state_dict brut (clés = noms de
        # paramètres). On le retourne tel quel.
        return raw
    else:
        # raw est directement un nn.Module entier (sauvegardé via
        # torch.save(model) plutôt que torch.save(model.state_dict())).
        return raw.state_dict()


def _strip_prefix(state_dict: dict, prefix: str) -> dict:
    if any(k.startswith(prefix) for k in state_dict.keys()):
        return {k[len(prefix):] if k.startswith(prefix) else k: v for k, v in state_dict.items()}
    return state_dict


def _load_weights_into(model: nn.Module, filepath: str) -> list:
    """Charge les poids dans le modèle en essayant plusieurs stratégies.
    Retourne la liste des clés manquantes/inattendues (vide si parfait)."""
    raw = torch.load(filepath, map_location=DEVICE, weights_only=False)
    state_dict = _extract_state_dict(raw)

    if not isinstance(state_dict, dict):
        raise ValueError(
            f"Le fichier '{filepath}' n'a pas pu être interprété comme un "
            f"state_dict ou un modèle PyTorch valide."
        )

    # Nettoyage des préfixes courants (DataParallel / DDP / wrappers custom)
    for prefix in ("module.", "model.", "backbone."):
        state_dict = _strip_prefix(state_dict, prefix)

    # Tentative 1 : chargement strict
    try:
        model.load_state_dict(state_dict, strict=True)
        return []
    except Exception:
        pass

    # Tentative 2 : chargement non strict (on tolère les couches de tête
    # qui ne correspondent pas exactement si le nombre de classes diffère
    # de ce qui a été entraîné, ou des clés annexes type 'fc.weight_orig').
    result = model.load_state_dict(state_dict, strict=False)
    missing = list(result.missing_keys)
    unexpected = list(result.unexpected_keys)

    # On tolère des clés manquantes/inattendues UNIQUEMENT si elles
    # concernent la tête de classification finale (fc / head), car le
    # nombre de classes peut légitimement varier. Pour toute autre couche,
    # on considère que le chargement a échoué (le backbone ne serait pas
    # correctement initialisé, ce qui rendrait les prédictions inutiles).
    def _is_head_key(k):
        return k.startswith("fc.") or k.startswith("head.") or k.startswith("classifier.")

    critical_missing = [k for k in missing if not _is_head_key(k)]
    critical_unexpected = [k for k in unexpected if not _is_head_key(k)]

    if critical_missing or critical_unexpected:
        raise ValueError(
            f"Échec du chargement de '{filepath}' : des poids du backbone "
            f"ne correspondent pas à l'architecture attendue.\n"
            f"Clés manquantes (hors tête) : {critical_missing[:10]}\n"
            f"Clés inattendues (hors tête) : {critical_unexpected[:10]}\n"
            f"Vérifie l'architecture exacte utilisée à l'entraînement."
        )

    return missing + unexpected


# ──────────────────────────────────────────────────────────────────────────
# CHARGEMENT DES MODÈLES AU DÉMARRAGE
# ──────────────────────────────────────────────────────────────────────────

def load_models():
    """Charge tous les modèles disponibles au démarrage de l'API."""
    models_dir = os.path.join(os.path.dirname(__file__), "models")

    for disease, scale in SEVERITY_SCALES.items():
        n_classes = len(scale["levels"])
        for model_key, filename in EXPECTED_WEIGHTS.get(disease, {}).items():
            filepath = os.path.join(models_dir, filename)

            if not os.path.exists(filepath):
                print(
                    f"[model_utils] Poids introuvables : {filepath} "
                    f"-> {disease}/{model_key} indisponible."
                )
                continue

            try:
                print(f"[model_utils] Chargement {disease}/{model_key} depuis {filename}...")
                model = BUILDERS[model_key](n_classes)
                leftovers = _load_weights_into(model, filepath)
                if leftovers:
                    print(
                        f"[model_utils] {disease}/{model_key} chargé avec des clés "
                        f"de tête ignorées/réinitialisées : {leftovers}"
                    )
                model.to(DEVICE)
                model.eval()
                loaded_models[disease][model_key] = {"model": model, "kind": model_key}
                print(f"[model_utils] {disease}/{model_key} chargé avec succès sur {DEVICE}.")
            except Exception as e:
                print(f"[model_utils] ERREUR lors du chargement de {filename} : {e}")
                traceback.print_exc()


# ──────────────────────────────────────────────────────────────────────────
# UTILITAIRES
# ──────────────────────────────────────────────────────────────────────────

def get_severity_scale(disease: str):
    scale = SEVERITY_SCALES.get(disease)
    if scale is None:
        raise ValueError(f"Maladie '{disease}' inconnue. Valeurs attendues : 'uc' ou 'crohn'.")
    return scale


def _get_entry(disease: str, model_key: str):
    entry = loaded_models.get(disease, {}).get(model_key)
    if entry is None:
        if model_key == "cnn":
            raise ValueError(
                "Le modèle 'CNN Baseline' n'est pas disponible : aucun poids "
                "entraîné n'a été fourni pour cette architecture. "
                "Choisis 'ResNet-50' ou 'ViT-B/16' (ViT-S/16)."
            )
        raise ValueError(
            f"Le modèle '{model_key}' pour la maladie '{disease}' n'est pas "
            f"disponible sur le serveur (poids manquants ou chargement échoué)."
        )
    return entry


# ──────────────────────────────────────────────────────────────────────────
# PRÉDICTION
# ──────────────────────────────────────────────────────────────────────────

def predict_image(image_path: str, disease: str, model_key: str):
    if disease not in SEVERITY_SCALES:
        raise ValueError(f"Maladie '{disease}' inconnue. Valeurs attendues : 'uc' ou 'crohn'.")

    entry = _get_entry(disease, model_key)
    model = entry["model"]
    levels = SEVERITY_SCALES[disease]["levels"]
    n_classes = len(levels)

    img = Image.open(image_path).convert("RGB")
    tensor = PREPROCESS(img).unsqueeze(0).to(DEVICE)

    with torch.no_grad():
        logits = model(tensor)
        probs = F.softmax(logits, dim=1)[0].cpu().numpy()

    if len(probs) != n_classes:
        raise ValueError(
            f"Le modèle '{model_key}' ({disease}) retourne {len(probs)} sorties, "
            f"mais l'échelle de sévérité attend {n_classes} niveaux."
        )

    severity_idx = int(np.argmax(probs))

    scores = {level["code"]: float(probs[i]) for i, level in enumerate(levels)}

    return {
        "scores": scores,
        "severity_idx": severity_idx,
        "severity_code": levels[severity_idx]["code"],
        "severity_label": levels[severity_idx]["label"],
    }


# ──────────────────────────────────────────────────────────────────────────
# GRAD-CAM (ResNet-50) / ATTENTION ROLLOUT (ViT-S/16)
# ──────────────────────────────────────────────────────────────────────────
# Pour le ResNet-50 : Grad-CAM classique sur la dernière couche convolutive
# (layer4), qui pondère les cartes d'activation par le gradient de la classe
# prédite.
#
# Pour le ViT-S/16 : un Grad-CAM "classique" n'a pas vraiment de sens (pas de
# couche convolutive ni de carte spatiale d'activations). On utilise à la
# place l'Attention Rollout (Abnar & Zuidema, 2020), qui trace la
# propagation de l'attention du token [CLS] à travers toutes les couches du
# transformer jusqu'aux patches de l'image d'entrée — une méthode bien plus
# adaptée et fidèle à l'architecture réelle du modèle.

class _GradCAMHook:
    """Capture activation + gradient d'une couche cible pendant un forward/backward."""

    def __init__(self, layer: nn.Module):
        self.activations = None
        self.gradients = None
        self._fwd_handle = layer.register_forward_hook(self._save_activation)
        self._bwd_handle = layer.register_full_backward_hook(self._save_gradient)

    def _save_activation(self, module, input, output):
        self.activations = output.detach()

    def _save_gradient(self, module, grad_input, grad_output):
        self.gradients = grad_output[0].detach()

    def remove(self):
        self._fwd_handle.remove()
        self._bwd_handle.remove()


def _gradcam_resnet(model: nn.Module, tensor: torch.Tensor, target_idx: int):
    target_layer = model.layer4[-1]
    hook = _GradCAMHook(target_layer)

    try:
        model.zero_grad()
        logits = model(tensor)
        score = logits[0, target_idx]
        score.backward()

        activations = hook.activations[0]      # (C, H, W)
        gradients = hook.gradients[0]           # (C, H, W)
        weights = gradients.mean(dim=(1, 2))    # (C,)

        cam = torch.zeros(activations.shape[1:], dtype=torch.float32, device=activations.device)
        for c, w in enumerate(weights):
            cam += w * activations[c]

        cam = F.relu(cam)
        cam = cam - cam.min()
        if cam.max() > 0:
            cam = cam / cam.max()
        return cam.cpu().numpy()
    finally:
        hook.remove()


def _attention_rollout_vit(model: nn.Module, tensor: torch.Tensor, discard_ratio: float = 0.0):
    """Calcule l'Attention Rollout (Abnar & Zuidema, 2020) pour expliquer les
    prédictions du ViT-S/16, à la place d'un Grad-CAM classique (peu adapté
    aux architectures sans convolution).

    Principe : pour chaque bloc transformer, on récupère la matrice
    d'attention post-softmax (moyenne sur les têtes), on y ajoute une
    connexion résiduelle (identité, qui modélise le "skip connection" du
    bloc) puis on renormalise par ligne. On multiplie ensuite ces matrices
    de toutes les couches entre elles : le résultat indique, pour chaque
    token de sortie, la contribution cumulée de chaque token d'entrée à
    travers tout le réseau. On extrait la ligne correspondant au token
    [CLS] (celui utilisé pour la classification finale) afin d'obtenir son
    attention "effective" sur chacun des patches de l'image.

    On désactive temporairement l'attention "fused" (scaled_dot_product_attention)
    en réimplémentant le calcul à la main via un monkey-patch de la méthode
    forward de chaque module Attention, le temps du forward pass — la
    matrice d'attention explicite n'est jamais exposée par l'implémentation
    fusionnée. Le forward original est restauré juste après, quoi qu'il
    arrive (bloc try/finally), pour ne pas altérer durablement le modèle.
    """
    attn_maps = []
    originals = {}

    def _make_patched_forward(attn_module):
        def patched_forward(x, attn_mask=None, is_causal=False):
            B, N, C = x.shape
            qkv = attn_module.qkv(x).reshape(
                B, N, 3, attn_module.num_heads, attn_module.head_dim
            ).permute(2, 0, 3, 1, 4)
            q, k, v = qkv.unbind(0)
            q, k = attn_module.q_norm(q), attn_module.k_norm(k)

            q = q * attn_module.scale
            attn = q @ k.transpose(-2, -1)
            attn = attn.softmax(dim=-1)
            attn_maps.append(attn.detach())  # (B, num_heads, N, N)
            attn = attn_module.attn_drop(attn)

            out = attn @ v
            out = out.transpose(1, 2).reshape(B, N, attn_module.attn_dim)
            out = attn_module.norm(out)
            out = attn_module.proj(out)
            out = attn_module.proj_drop(out)
            return out

        return patched_forward

    for block in model.blocks:
        originals[block.attn] = block.attn.forward
        block.attn.forward = _make_patched_forward(block.attn)

    try:
        with torch.no_grad():
            model(tensor)
    finally:
        for attn_module, orig_forward in originals.items():
            attn_module.forward = orig_forward

    if not attn_maps:
        raise ValueError("Aucune matrice d'attention capturée (architecture inattendue).")

    B, H, N, _ = attn_maps[0].shape
    rollout = torch.eye(N, device=attn_maps[0].device).unsqueeze(0).repeat(B, 1, 1)

    for attn in attn_maps:
        attn_avg = attn.mean(dim=1)  # moyenne sur les têtes -> (B, N, N)

        if discard_ratio > 0:
            flat = attn_avg.view(B, -1).clone()
            k = int(flat.shape[-1] * discard_ratio)
            if k > 0:
                _, idx = flat.topk(k, dim=-1, largest=False)
                flat.scatter_(-1, idx, 0)
            attn_avg = flat.view(B, N, N)

        # Connexion résiduelle + renormalisation par ligne
        attn_avg = attn_avg + torch.eye(N, device=attn_avg.device).unsqueeze(0)
        attn_avg = attn_avg / attn_avg.sum(dim=-1, keepdim=True)

        rollout = attn_avg @ rollout

    # Ligne du token [CLS] (index 0), contribution de chaque patch (on
    # retire la colonne 0, qui correspond au CLS lui-même).
    cls_attention = rollout[0, 0, 1:]  # (num_patches,)

    num_patches = cls_attention.shape[0]
    side = int(round(num_patches ** 0.5))
    if side * side != num_patches:
        raise ValueError("Nombre de patches non carré, Attention Rollout impossible.")

    cam = cls_attention.reshape(side, side)
    cam = cam - cam.min()
    if cam.max() > 0:
        cam = cam / cam.max()
    return cam.cpu().numpy()


def generate_gradcam(image_path: str, disease: str, model_key: str, output_path: str) -> bool:
    """Génère la heatmap Grad-CAM superposée sur l'image originale.
    Retourne True si la génération a réussi, False sinon (sans lever
    d'exception bloquante, conformément au comportement attendu par
    app.py : un échec de Grad-CAM ne doit pas faire échouer /predict)."""
    try:
        entry = _get_entry(disease, model_key)
    except ValueError:
        return False

    model = entry["model"]
    kind = entry["kind"]

    img_bgr = cv2.imread(image_path)
    if img_bgr is None:
        raise ValueError("Impossible de lire l'image pour ce Grad-CAM.")

    pil_img = Image.open(image_path).convert("RGB")
    tensor = PREPROCESS(pil_img).unsqueeze(0).to(DEVICE)
    tensor.requires_grad_(False)

    try:
        if kind == "resnet":
            # Grad-CAM nécessite la classe prédite (cible expliquée)
            with torch.no_grad():
                logits = model(tensor)
                target_idx = int(torch.argmax(logits, dim=1).item())
            cam = _gradcam_resnet(model, tensor, target_idx)
        elif kind == "vit":
            # L'Attention Rollout ne dépend pas d'une classe cible : elle
            # explique où le token [CLS] regarde dans l'image, indépendamment
            # de la sortie de classification finale.
            cam = _attention_rollout_vit(model, tensor)
        else:
            return False
    except Exception as e:
        print(f"[model_utils] Erreur génération heatmap ({kind}) : {e}")
        return False

    # Redimensionner la CAM à la taille de l'image originale et superposer
    cam_resized = cv2.resize(cam, (img_bgr.shape[1], img_bgr.shape[0]))
    heatmap = np.uint8(255 * cam_resized)
    heatmap = cv2.applyColorMap(heatmap, cv2.COLORMAP_JET)

    overlay = cv2.addWeighted(img_bgr, 0.55, heatmap, 0.45, 0)
    cv2.imwrite(output_path, overlay)
    return True
