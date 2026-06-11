import os
import uuid
import shutil
from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from model_utils import load_models, predict_image, generate_gradcam

app = FastAPI(title="EndoAI Backend API")

# Configuration CORS pour autoriser le frontend (qui sera sur un autre port ou liveserver)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # En développement
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Dossier temporaire pour les heatmaps Grad-CAM
TEMP_DIR = os.path.join(os.path.dirname(__file__), "temp_gradcam")
os.makedirs(TEMP_DIR, exist_ok=True)

# Servir les fichiers statiques (les images générées)
app.mount("/temp", StaticFiles(directory=TEMP_DIR), name="temp_images")

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
            
    # Charger les modèles IA
    load_models()

@app.post("/predict")
async def predict(file: UploadFile = File(...), modelKey: str = Form(...)):
    # Générer un ID unique pour le nom de fichier
    file_id = str(uuid.uuid4())
    
    # Chemins
    input_path = os.path.join(TEMP_DIR, f"{file_id}_original.jpg")
    gradcam_filename = f"{file_id}_gradcam.jpg"
    gradcam_path = os.path.join(TEMP_DIR, gradcam_filename)
    
    # 1. Sauvegarder l'image envoyée par le frontend
    with open(input_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    # 2. Lancer la prédiction avec gestion des erreurs
    try:
        results = predict_image(input_path, modelKey)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    
    # Map index to class label
    labels = ["normal", "crohn", "uc"]
    diag_label = labels[results["diag_idx"]]
    
    # 3. Générer le Grad-CAM
    try:
        has_gradcam = generate_gradcam(input_path, modelKey, gradcam_path)
    except Exception as e:
        print(f"Failed to generate GradCAM: {e}")
        has_gradcam = False
    
    # 4. Retourner la réponse JSON
    return {
        "status": "success",
        "scores": {
            "normal": results["normal"],
            "crohn": results["crohn"],
            "uc": results["uc"]
        },
        "diagnosis": diag_label,
        "gradcam_url": f"/temp/{gradcam_filename}" if has_gradcam else None,
        "model_used": modelKey
    }
