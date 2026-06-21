"""
app.py
======
Point d'entrée FastAPI pour EndoAI.

Contrat d'API (inchangé, conforme à script.js) :
    GET  /scales/{disease}   -> définition de l'échelle de sévérité
    POST /predict             -> formData(file, modelKey, disease)
                                  -> { status, disease, scale_name, scores,
                                       severity_idx, severity_code,
                                       severity_label, gradcam_url, model_used }
"""

import os
import uuid
import shutil

from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from model_utils import load_models, predict_image, generate_gradcam, get_severity_scale

app = FastAPI(title="EndoAI Backend API")

# Configuration CORS pour autoriser le frontend (servi sur un autre port / live server)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # En développement
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Dossier temporaire pour les images originales + heatmaps Grad-CAM
TEMP_DIR = os.path.join(os.path.dirname(__file__), "temp_gradcam")
os.makedirs(TEMP_DIR, exist_ok=True)

# Servir les fichiers statiques (images générées, accessibles via /temp/...)
app.mount("/temp", StaticFiles(directory=TEMP_DIR), name="temp_images")

# Maladies supportées
VALID_DISEASES = {"uc", "crohn"}

# Modèles proposés par le frontend (le dropdown propose aussi "cnn", mais
# aucun poids n'est fourni pour cette architecture : voir model_utils.py,
# qui renverra un message d'erreur clair si "cnn" est demandé).
VALID_MODEL_KEYS = {"resnet", "vit", "cnn"}


@app.on_event("startup")
async def startup_event():
    # Nettoyer le dossier temporaire au démarrage
    for filename in os.listdir(TEMP_DIR):
        file_path = os.path.join(TEMP_DIR, filename)
        try:
            if os.path.isfile(file_path):
                os.unlink(file_path)
        except Exception as e:
            print(f"Failed to delete {file_path}: {e}")

    # Charger les modèles IA (ResNet-50 et ViT-S/16, pour UC et Crohn)
    load_models()


@app.get("/scales/{disease}")
async def get_scale(disease: str):
    """Retourne la définition de l'échelle de sévérité pour une maladie donnée."""
    if disease not in VALID_DISEASES:
        raise HTTPException(
            status_code=400,
            detail=f"Maladie '{disease}' inconnue. Valeurs attendues : 'uc' ou 'crohn'.",
        )
    try:
        return get_severity_scale(disease)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/predict")
async def predict(
    file: UploadFile = File(...),
    modelKey: str = Form(...),
    disease: str = Form(...),
):
    # Validation de la maladie demandée
    if disease not in VALID_DISEASES:
        raise HTTPException(
            status_code=400,
            detail=f"Maladie '{disease}' inconnue. Valeurs attendues : 'uc' ou 'crohn'.",
        )

    # Validation du modèle demandé
    if modelKey not in VALID_MODEL_KEYS:
        raise HTTPException(
            status_code=400,
            detail=f"Modèle '{modelKey}' inconnu. Valeurs attendues : 'resnet', 'vit' ou 'cnn'.",
        )

    # Validation basique du type de fichier
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Le fichier envoyé doit être une image.")

    # Générer un ID unique pour le nom de fichier
    file_id = str(uuid.uuid4())

    # Chemins
    input_path = os.path.join(TEMP_DIR, f"{file_id}_original.jpg")
    gradcam_filename = f"{file_id}_gradcam.jpg"
    gradcam_path = os.path.join(TEMP_DIR, gradcam_filename)

    # 1. Sauvegarder l'image envoyée par le frontend
    try:
        with open(input_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    finally:
        file.file.close()

    # 2. Lancer la prédiction de sévérité avec gestion des erreurs
    try:
        results = predict_image(input_path, disease, modelKey)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur interne lors de la prédiction : {e}")

    # 3. Générer le Grad-CAM (un échec ici ne doit pas bloquer la réponse)
    try:
        has_gradcam = generate_gradcam(input_path, disease, modelKey, gradcam_path)
    except Exception as e:
        print(f"Failed to generate GradCAM: {e}")
        has_gradcam = False

    # 4. Retourner la réponse JSON (format inchangé, attendu par script.js)
    return {
        "status": "success",
        "disease": disease,
        "scale_name": get_severity_scale(disease)["name"],
        "scores": results["scores"],
        "severity_idx": results["severity_idx"],
        "severity_code": results["severity_code"],
        "severity_label": results["severity_label"],
        "gradcam_url": f"/temp/{gradcam_filename}" if has_gradcam else None,
        "model_used": modelKey,
    }
