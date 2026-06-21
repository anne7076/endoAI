# 🔬 EndoAI - Diagnostic des MICI par Imagerie Endoscopique

![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![Chart.js](https://img.shields.io/badge/Chart.js-FF6384?style=for-the-badge&logo=chartdotjs&logoColor=white)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)

**EndoAI** est une application web interactive conçue pour assister les professionnels de santé dans le diagnostic des Maladies Inflammatoires Chroniques de l'Intestin (MICI) à partir d'images d'endoscopie. L'outil repose sur des modèles d'Intelligence Artificielle avancés pour distinguer les niveaux de severités  de la maladie de **CrohnIPI** et ceux de **LIMUC**.

## ✨ Fonctionnalités Principales

- **Analyse Multi-Modèles** : Choisissez entre deux architectures selon vos besoins :
  - **ResNet-50** : Réseau résiduel convolutif, rapide à l'inférence.
  - **Vision Transformer (ViT-S/16)** : Architecture basée sur l'attention, offrant les meilleures performances macro-moyennées sur les deux jeux de données.
- **Explicabilité (XAI)** : L'IA ne donne pas qu'un résultat. Pour ResNet-50, un **Grad-CAM** surligne les zones de l'image ayant le plus influencé la prédiction ; pour ViT-S/16, une **Attention Rollout** trace la propagation de l'attention du modèle à travers ses couches — offrant ainsi aux médecins une transparence totale, adaptée à chaque architecture.
- **Tableau de Bord des Modèles** : Visualisation dynamique (via _Chart.js_) des courbes d'apprentissage (Loss/Accuracy) et métriques détaillées de chaque modèle, par maladie.
- **Thème Dynamique** : Basculez entre un mode Clair (diurne) et un mode Sombre (nocturne) pour un confort visuel optimal en milieu clinique.
- **Design Réactif** : Interface entièrement _responsive_ s'adaptant aussi bien aux écrans de bureau qu'aux tablettes et mobiles.

## 🚀 Installation & Utilisation

Le projet est conçu de manière modulaire et statique côté client (Front-end). Aucune dépendance complexe n'est requise.

```text
# 1. Cloner le dépôt
git clone https://github.com/anne7076/endoAI.git
cd endoAI
cd backend
 
# 2. Créer un environnement virtuel (recommandé)
python -m venv venv
source venv/bin/activate    	# Linux / macOS
venv\Scripts\activate       	# Windows
 
# 3. Installer les dépendances
pip install -r requirements.txt
 
# 4. Placer les modèles entraînés dans le répertoire models/
# (Télécharger depuis le lien fourni dans le README du dépôt)
mkdir models 
# cp /chemin/vers/best_resnet50_limuc.pth models/
 
# 5. Lancer le serveur backend
uvicorn app:app --reload --host 0.0.0.0 --port 8000
 
# 6. Ouvrir le frontend dans le navigateur : Ouvrir index.html 
```

## 📂 Structure du Projet

```text
endoai/
├── backend/ 
│   ├── models/        # Répertoire des modèles entraînés (.pth)   
│   ├── app.py              	# Point d'entrée FastAPI
│   ├── model_utils.py      	# Chargement des modèles, prédiction, Grad-CAM / Attention Rollout
│   └── requirements.txt    	# Dépendances Python 
├── index.html      # Structure principale de la page web (HTML)
├── style.css       # Styles, design et thèmes (Clair/Sombre) (S'il a été séparé)
├── script.js       # Logique applicative, gestion des modèles et graphiques
├── LICENSE         # Licence MIT du code et des poids (hors restriction CrohnIPI)
└── README.md       # Documentation du projet
```

## 📜 Licences

Ce projet combine du **code original** (sous licence MIT) et des **modèles
entraînés sur des jeux de données tiers**, dont les licences respectives
doivent être respectées indépendamment de celle du code.

### Code du projet

Le code source d'EndoAI (frontend `index.html`/`style.css`/`script.js` et
backend `app.py`/`model_utils.py`) est distribué sous **licence MIT** — voir
le fichier [`LICENSE`](./LICENSE). Cela autorise la réutilisation, la
modification et la redistribution, y compris à des fins commerciales, sous
réserve de conserver la mention de copyright.

### Poids des modèles entraînés (.pth)

Les poids entraînés sont distribués sous la **même licence MIT que le code**,
**à l'exception des poids entraînés sur CrohnIPI** (`best_resnet50_crohnipi.pth`
et `best_vit_s16_crohnipi.pth`), pour la raison suivante :

| Dataset source | Licence du dataset | Licence des poids correspondants |
|-----------------|---------------------|-------------------------------------|
| **LIMUC** (UC)  | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) — réutilisation libre, y compris commerciale, sous réserve d'attribution | **MIT** (`best_resnet50_limuc.pth`, `best_vit_s16_limuc.pth`) |
| **CrohnIPI** (Crohn) | [CC BY-NC-ND 4.0](https://creativecommons.org/licenses/by-nc-nd/4.0/) — usage **non commercial** uniquement, **pas de création d'œuvres dérivées** distribuées publiquement | **Usage non commercial uniquement** (`best_resnet50_crohnipi.pth`, `best_vit_s16_crohnipi.pth`) |

⚠️ **Important** : les poids entraînés sur CrohnIPI sont fournis et utilisables
dans le cadre de ce projet académique, mais **ne peuvent pas être réutilisés,
redistribués ou exploités à des fins commerciales**, conformément à la clause
*NonCommercial* (NC) du dataset source. La clause *NoDerivatives* (ND) du
dataset implique également une prudence d'usage concernant la redistribution
publique de modèles dérivés entraînés sur ces données — toute réutilisation
hors cadre académique/recherche doit faire l'objet d'une vérification
préalable auprès des auteurs du dataset CrohnIPI.

Les poids entraînés sur **LIMUC** ne sont pas concernés par cette restriction :
la licence CC BY 4.0 de LIMUC autorise un usage libre, y compris commercial,
sous réserve de citer les auteurs originaux (voir la section Citation
ci-dessous).

### Citation des jeux de données

Si vous réutilisez ce projet ou les modèles qui en sont issus, merci de citer
les jeux de données originaux :

```bibtex
@article{polat2022improving,
  title={Improving the computer-aided estimation of ulcerative colitis severity according to mayo endoscopic score by using regression-based deep learning},
  author={Polat, Gorkem and Kani, Haluk Tarik and Ergenc, Ilkay and Ozen Alahdab, Yesim and Temizel, Alptekin and Atug, Ozlen},
  journal={Inflammatory Bowel Diseases},
  year={2022},
  publisher={Oxford University Press}
}

@inproceedings{vallee2020crohnipi,
  title={CrohnIPI: An endoscopic image database for the evaluation of automatic Crohn's disease lesions recognition algorithms},
  author={Vall{\'e}e, R{\'e}mi and De Maissin, Astrid and Coutrot, Antoine and Mouch{\`e}re, Harold and Bourreille, Arnaud and Normand, Nicolas},
  booktitle={SPIE Medical Imaging},
  year={2020}
}
```

## ⚠️ Avertissement Légal & Médical

Cet outil est un **prototype académique et de recherche** destiné à _l'aide au diagnostic_ uniquement. Il ne remplace en aucun cas l'expertise clinique, le jugement ou le diagnostic d'un professionnel de santé certifié. Toute décision thérapeutique doit être validée par un médecin.

## 🤝 Contribution & Feedback

Nous accueillons les retours cliniques et techniques pour améliorer la robustesse des modèles.

- Consultez la section **Contact** de l'application pour nous écrire.
- Pour les contributions de code, ouvrez une _Issue_ ou proposez une _Pull Request_ sur ce dépôt technique.

---

_Réalisé avec ❤️ pour l'innovation médicale._
