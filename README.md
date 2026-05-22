# 🔬 EndoAI - Diagnostic des MICI par Imagerie Endoscopique

![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![Chart.js](https://img.shields.io/badge/Chart.js-FF6384?style=for-the-badge&logo=chartdotjs&logoColor=white)

**EndoAI** est une application web interactive conçue pour assister les professionnels de santé dans le diagnostic des Maladies Inflammatoires Chroniques de l'Intestin (MICI) à partir d'images d'endoscopie. L'outil repose sur des modèles d'Intelligence Artificielle avancés pour distinguer la **maladie de Crohn**, la **colite ulcéreuse** et un **état normal**.

## ✨ Fonctionnalités Principales

- **Analyse Multi-Modèles** : Choisissez entre trois architectures selon vos besoins :
  - **ResNet-50** : Précision élevée (F1-Score 95.8%) et temps d'inférence rapide.
  - **Vision Transformer (ViT-B/16)** : Architecture basée sur l'attention offrant les meilleures performances globales (F1-Score 96.4%).
  - **CNN Baseline** : Réseau léger, optimisé pour les environnements à ressources limitées.
- **Explicabilité (XAI - Grad-CAM)** : L'IA ne donne pas qu'un résultat. Elle surligne les zones de l'image (cartes de chaleur) qui ont conduit à sa prédiction, offrant ainsi aux médecins une transparence totale.
- **Tableau de Bord des Modèles** : Visualisation dynamique (via _Chart.js_) des courbes d'apprentissage (Loss/Accuracy), architecture en couches et métriques détaillées de chaque modèle.
- **Thème Dynamique** : Basculez entre un mode Clair (diurne) et un mode Sombre (nocturne) pour un confort visuel optimal en milieu clinique.
- **Design Réactif** : Interface entièrement _responsive_ s'adaptant aussi bien aux écrans de bureau qu'aux tablettes et mobiles.

## 🚀 Installation & Utilisation

Le projet est conçu de manière modulaire et statique côté client (Front-end). Aucune dépendance complexe n'est requise.

1. **Cloner le répertoire**

   ```bash
   git clone https://github.com/votre-nom/endoai.git
   cd endoai
   ```

2. **Lancer l'application**
   Il suffit d'ouvrir le fichier `index.html` dans n'importe quel navigateur web moderne (Chrome, Firefox, Edge, Safari).
   ```bash
   start index.html
   ```

## 📂 Structure du Projet

```text
📁 /
├── 📄 index.html      # Structure principale de la page web (HTML)
├── 📄 style.css       # Styles, design et thèmes (Clair/Sombre) (S'il a été séparé)
├── 📄 script.js       # Logique applicative, gestion des modèles et graphiques
└── 📄 README.md       # Documentation du projet
```

## ⚠️ Avertissement Légal & Médical

Cet outil est un **prototype académique et de recherche** destiné à _l'aide au diagnostic_ uniquement. Il ne remplace en aucun cas l'expertise clinique, le jugement ou le diagnostic d'un professionnel de santé certifié. Toute décision thérapeutique doit être validée par un médecin.

## 🤝 Contribution & Feedback

Nous accueillons les retours cliniques et techniques pour améliorer la robustesse des modèles.

- Consultez la section **Contact** de l'application pour nous écrire.
- Pour les contributions de code, ouvrez une _Issue_ ou proposez une _Pull Request_ sur ce dépôt technique.

---

_Réalisé avec ❤️ pour l'innovation médicale._
