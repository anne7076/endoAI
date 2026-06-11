import os
import numpy as np
import tensorflow as tf
import cv2

# Dictionnaire pour stocker les modèles chargés
loaded_models = {}

def load_models():
    """Charge les modèles au démarrage de l'API."""
    models_dir = os.path.join(os.path.dirname(__file__), "models")
    
    # Exemples de noms de fichiers attendus pour les modèles
    expected_models = {
        "resnet": "resnet50.h5",
        # "vit": "vit_b16.keras",
        # "cnn": "cnn_baseline.keras"
    }
    
    for model_key, filename in expected_models.items():
        filepath = os.path.join(models_dir, filename)
        if os.path.exists(filepath):
            try:
                print(f"Chargement du modèle {model_key}...")
                loaded_models[model_key] = tf.keras.models.load_model(filepath)
            except Exception as e:
                print(f"Erreur lors du chargement de {filename}: {e}")
        else:
            print(f"Modèle {filename} introuvable dans {models_dir}. Ce modèle ne sera pas disponible.")

def predict_image(image_path: str, model_key: str):
    """
    Exécute la prédiction sur l'image avec le modèle sélectionné.
    Retourne les probabilités pour [normal, crohn, uc].
    """
    model = loaded_models.get(model_key)
    
    # 1. Si le modèle n'est pas chargé
    if model is None:
        raise ValueError(f"Le modèle '{model_key}' n'est pas disponible sur le serveur.")
        
    # 2. Vraie prédiction
    # Charger et prétraiter l'image (taille typique 224x224, à adapter selon le modèle)
    img = tf.keras.preprocessing.image.load_img(image_path, target_size=(224, 224))
    img_array = tf.keras.preprocessing.image.img_to_array(img)
    img_array = np.expand_dims(img_array, axis=0) # Ajout de la dimension batch
    
    # Prétraitement spécifique (ex: rescale 1./255)
    img_array = img_array / 255.0
    
    predictions = model.predict(img_array)[0]
    diag_idx = np.argmax(predictions)
    
    return {
        "normal": float(predictions[0]),
        "crohn": float(predictions[1]),
        "uc": float(predictions[2]),
        "diag_idx": int(diag_idx)
    }

def generate_gradcam(image_path: str, model_key: str, output_path: str):
    """
    Génère la heatmap Grad-CAM et la superpose sur l'image.
    Sauvegarde l'image modifiée dans output_path.
    Retourne True si un Grad-CAM a été généré, False sinon.
    """
    model = loaded_models.get(model_key)
    
    # IMAGE ORIGINALE
    img = cv2.imread(image_path)
    if img is None:
        raise ValueError("Impossible de lire l'image pour ce Grad-CAM")
    
    # 1. Si le modèle n'existe pas, pas de Grad-CAM possible
    if model is None:
        return False

    # 2. Vrai Grad-CAM (Implémentation basique à adapter à la structure exacte du modèle)
    try:
        # Configurer l'image
        img_array = tf.keras.preprocessing.image.load_img(image_path, target_size=(224, 224))
        img_array = tf.keras.preprocessing.image.img_to_array(img_array)
        img_array = np.expand_dims(img_array, axis=0) / 255.0
        
        # Trouver la dernière couche convolutive (exemple générique)
        last_conv_layer_name = None
        for layer in reversed(model.layers):
            if isinstance(layer, tf.keras.layers.Conv2D):
                last_conv_layer_name = layer.name
                break
                
        if not last_conv_layer_name:
            raise ValueError("Pas de couche Conv2D trouvée pour Grad-CAM")

        grad_model = tf.keras.models.Model(
            [model.inputs], 
            [model.get_layer(last_conv_layer_name).output, model.output]
        )

        with tf.GradientTape() as tape:
            conv_outputs, predictions = grad_model(img_array)
            pred_index = tf.argmax(predictions[0])
            class_channel = predictions[:, pred_index]

        grads = tape.gradient(class_channel, conv_outputs)
        pooled_grads = tf.reduce_mean(grads, axis=(0, 1, 2))
        
        conv_outputs = conv_outputs[0]
        heatmap = conv_outputs @ pooled_grads[..., tf.newaxis]
        heatmap = tf.squeeze(heatmap)
        heatmap = tf.maximum(heatmap, 0) / tf.math.reduce_max(heatmap)
        heatmap = heatmap.numpy()

        # Redimensionner la heatmap à la taille de l'image originale
        heatmap = cv2.resize(heatmap, (img.shape[1], img.shape[0]))
        heatmap = np.uint8(255 * heatmap)
        heatmap = cv2.applyColorMap(heatmap, cv2.COLORMAP_JET)

        overlay = cv2.addWeighted(img, 0.5, heatmap, 0.5, 0)
        cv2.imwrite(output_path, overlay)
        return True
    except Exception as e:
        print(f"Erreur Grad-CAM: {e}")
        # En cas d'erreur, ne pas créer de fausse image
        return False
