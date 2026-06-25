// ── THEME TOGGLE ──
const themeToggleBtn = document.getElementById('theme-toggle');
const savedTheme = localStorage.getItem('endoai-theme');

const sunSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>';
const moonSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>';

// Appliquer le thème sauvegardé
if (savedTheme === 'light')
{
    document.documentElement.setAttribute('data-theme', 'light');
    themeToggleBtn.innerHTML = moonSvg;
} else
{
    themeToggleBtn.innerHTML = sunSvg;
}

themeToggleBtn.addEventListener('click', () =>
{
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    if (isLight)
    {
        document.documentElement.removeAttribute('data-theme');
        localStorage.setItem('endoai-theme', 'dark');
        themeToggleBtn.innerHTML = sunSvg;
    } else
    {
        document.documentElement.setAttribute('data-theme', 'light');
        localStorage.setItem('endoai-theme', 'light');
        themeToggleBtn.innerHTML = moonSvg;
    }

    // Update charts if they exist
    if (lossChart)
    {
        lossChart.options.plugins.legend.labels.color = isLight ? '#7a8ba0' : '#64748b';
        lossChart.options.scales.x.grid.color = isLight ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
        lossChart.options.scales.y.grid.color = isLight ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
        lossChart.update();
    }
    if (accChart)
    {
        accChart.options.plugins.legend.labels.color = isLight ? '#7a8ba0' : '#64748b';
        accChart.options.scales.x.grid.color = isLight ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
        accChart.options.scales.y.grid.color = isLight ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
        accChart.update();
    }
});

// ── DISEASE SELECTOR ──
// Échelles de sévérité côté frontend (miroir de SEVERITY_SCALES dans model_utils.py)
const severityScales = {
    crohn: {
        name: 'Classification endoscopique des lésions (CD)',
        levels: [
            { code: 'N', label: 'N — Non pathologique' },
            { code: 'E', label: 'E — Érythème' },
            { code: 'O', label: 'O — Œdème' },
            { code: 'S', label: 'S — Sténose' },
            { code: 'AU', label: 'AU — Ulcération aphtoïde (< 3 mm)' },
            { code: 'U3-10', label: 'U3-10 — Ulcération 3–10 mm' },
            { code: 'U>10', label: 'U>10 — Ulcération > 10 mm' },
        ]
    },
    uc: {
        name: 'Score de Mayo endoscopique',
        levels: [
            { code: '0', label: 'Mayo 0 — Muqueuse normale' },
            { code: '1', label: 'Mayo 1 — Érythème léger' },
            { code: '2', label: 'Mayo 2 — Friabilité, érosions' },
            { code: '3', label: 'Mayo 3 — Ulcérations spontanées saignantes' },
        ]
    }
};

let selectedDisease = 'crohn';

function selectDisease(el)
{
    document.querySelectorAll('.disease-option').forEach(o => o.classList.remove('selected'));
    el.classList.add('selected');
    selectedDisease = el.dataset.disease;

    // Hide any previous result when the disease changes
    const ra = document.getElementById('dynamic-result-area');
    ra.classList.remove('visible');
    ra.style.display = 'none';

    // Met à jour les pastilles de précision/rappel/F1 affichées sur les
    // cartes "Modèles disponibles" pour refléter la maladie sélectionnée.
    updateModelCardsPills();

    // Si la fiche détail d'un modèle est ouverte, on la met à jour avec les
    // courbes et métriques de la nouvelle maladie sélectionnée.
    refreshModelDetailIfOpen();
}

function updateModelCardsPills()
{
    [ 'resnet', 'vit' ].forEach(key =>
    {
        const d = modelData[ selectedDisease ][ key ];
        // Ligne 0 = Précision globale, ligne 1 = Macro-moyenne (précision/rappel/F1)
        const macro = d.metrics[ 1 ];
        document.getElementById(`pill-${key}-precision`).textContent = macro[ 1 ];
        document.getElementById(`pill-${key}-recall`).textContent = macro[ 2 ];
        document.getElementById(`pill-${key}-f1`).textContent = macro[ 3 ];
        document.getElementById(`pill-${key}-params`).textContent = d.params;
    });
}

// ── UPLOAD ──
const fileInput = document.getElementById('file-input');
const dropZone = document.getElementById('drop-zone');
let uploadedFile = null;
let lastResult = null; // Dernier résultat d'analyse (utilisé pour l'export PDF et le zoom image)

fileInput.addEventListener('change', e => handleFile(e.target.files[ 0 ]));
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', e => { e.preventDefault(); dropZone.classList.remove('dragover'); if (e.dataTransfer.files[ 0 ]) handleFile(e.dataTransfer.files[ 0 ]); });

function handleFile(file)
{
    if (!file || !file.type.startsWith('image/')) return;
    uploadedFile = file;
    const reader = new FileReader();
    reader.onload = ev =>
    {
        const img = document.getElementById('preview-img');
        img.src = ev.target.result;
        img.style.display = 'block';
        document.getElementById('upload-icon').style.display = 'none';
        document.getElementById('upload-title').textContent = file.name;
        document.getElementById('upload-hint').textContent = (file.size / 1024).toFixed(0) + ' Ko · Prêt pour analyse';
    };
    reader.readAsDataURL(file);
    document.getElementById('analyze-btn').disabled = false;
    // Hide any previous result when a new image is loaded
    const ra = document.getElementById('dynamic-result-area');
    ra.classList.remove('visible');
    ra.style.display = 'none';
}

// ── MODEL DROPDOWN ──
let selectedModel = 'resnet';

function toggleModelDropdown()
{
    const trigger = document.getElementById('model-trigger');
    const dropdown = document.getElementById('model-dropdown');
    const isOpen = trigger.classList.contains('open');
    trigger.classList.toggle('open', !isOpen);
    dropdown.classList.toggle('open', !isOpen);
}

function selectModel(el)
{
    // Update selected state
    document.querySelectorAll('.model-option').forEach(o => o.classList.remove('selected'));
    el.classList.add('selected');
    selectedModel = el.dataset.value;

    // Update trigger display
    document.getElementById('trigger-icon').textContent = el.dataset.icon;
    document.getElementById('trigger-name').textContent = el.dataset.name;
    document.getElementById('trigger-sub').textContent = el.dataset.sub;
    document.getElementById('trigger-badge').textContent = el.dataset.badge;

    // Update hidden radio
    document.getElementById('r-' + selectedModel).checked = true;

    // Close dropdown
    document.getElementById('model-trigger').classList.remove('open');
    document.getElementById('model-dropdown').classList.remove('open');
}

// Close dropdown on outside click
document.addEventListener('click', e =>
{
    const wrap = document.querySelector('.model-dropdown-wrap');
    if (wrap && !wrap.contains(e.target))
    {
        document.getElementById('model-trigger').classList.remove('open');
        document.getElementById('model-dropdown').classList.remove('open');
    }
});

// Fermer le modal de zoom image avec la touche Échap
document.addEventListener('keydown', e =>
{
    if (e.key === 'Escape')
    {
        const modal = document.getElementById('image-zoom-modal');
        if (modal && modal.classList.contains('open'))
        {
            modal.classList.remove('open');
            currentZoomTarget = null;
        }
    }
});

// ── ANALYSIS ──
async function runAnalysis()
{
    if (!uploadedFile) return;
    const btn = document.getElementById('analyze-btn');
    btn.disabled = true;
    document.getElementById('btn-txt').style.display = 'none';
    document.getElementById('btn-spin').style.display = 'block';

    // Hide previous result, show typing indicator
    const ra = document.getElementById('dynamic-result-area');
    ra.classList.remove('visible');
    ra.style.display = 'none';
    document.getElementById('analyzing-indicator').classList.add('active');

    try
    {
        const formData = new FormData();
        formData.append('file', uploadedFile);
        formData.append('modelKey', selectedModel);
        formData.append('disease', selectedDisease);

        const response = await fetch('http://localhost:8000/predict', {
            method: 'POST',
            body: formData
        });

        if (!response.ok)
        {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.detail || `Erreur HTTP: ${response.status}`);
        }

        const data = await response.json();
        const models_info = {
            resnet: 'ResNet-50',
            vit: 'ViT-S/16',
        };

        const result = {
            disease: data.disease,
            name: models_info[ data.model_used ] || data.model_used,
            scaleName: data.scale_name,
            scores: data.scores,
            severityIdx: data.severity_idx,
            severityCode: data.severity_code,
            severityLabel: data.severity_label,
            gradcam_url: data.gradcam_url ? 'http://localhost:8000' + data.gradcam_url : null
        };

        // Hide indicator
        document.getElementById('analyzing-indicator').classList.remove('active');
        showResults(result);

    } catch (error)
    {
        console.error("Erreur de prédiction:", error);

        // Hide indicator
        document.getElementById('analyzing-indicator').classList.remove('active');

        // Afficher l'erreur dans l'UI proprement
        showError(error.message);
    } finally
    {
        btn.disabled = false;
        document.getElementById('btn-txt').style.display = 'inline';
        document.getElementById('btn-spin').style.display = 'none';
    }
}

function showError(message)
{
    const ra = document.getElementById('dynamic-result-area');
    const resultContent = document.getElementById('result-content');
    const errorContent = document.getElementById('error-content');
    const gradcamSection = document.getElementById('gradcam-section');
    const headerText = document.getElementById('result-header-text');
    const errorMsgEl = document.getElementById('error-message-text');

    // Mettre à jour le texte
    headerText.textContent = "Erreur d'analyse";
    headerText.style.color = "var(--red)"; // Optional styling for the header
    errorMsgEl.textContent = message;

    // Basculer l'affichage (Cacher résultats/GradCAM, Afficher l'erreur)
    resultContent.style.display = 'none';
    gradcamSection.style.display = 'none';
    errorContent.style.display = 'block';

    // Afficher la section dynamique
    ra.style.display = 'flex';
    ra.classList.add('visible');

    setTimeout(() => ra.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
}

function showResults(r)
{
    const resultContent = document.getElementById('result-content');
    const errorContent = document.getElementById('error-content');
    const gradcamSection = document.getElementById('gradcam-section');
    const headerText = document.getElementById('result-header-text');

    // Réinitialiser l'état d'erreur
    headerText.textContent = "Résultat de l'analyse";
    headerText.style.color = "var(--muted)";
    resultContent.style.display = 'block';
    gradcamSection.style.display = 'block';
    errorContent.style.display = 'none';

    const scale = severityScales[ r.disease ];

    // Conserver le dernier résultat (utilisé pour l export PDF et le zoom image)
    lastResult = r;
    lastResult.scaleLevels = scale.levels;

    // Badge principal (niveau de sévérité prédit)
    const lvlEl = document.getElementById('severity-label');
    lvlEl.textContent = r.severityLabel;
    lvlEl.className = 'severity-badge sev-level-' + Math.min(r.severityIdx, 3);

    document.getElementById('result-scale-name').textContent = r.scaleName || scale.name;
    document.getElementById('model-tag').textContent = 'via ' + r.name;

    // Construire les barres de confiance dynamiquement, une par niveau de l'échelle
    const barsContainer = document.getElementById('severity-bars');
    barsContainer.innerHTML = scale.levels.map((level, i) => `
        <div class="conf-row">
            <div class="conf-label"><span>${level.label}</span><span id="conf-${i}">—</span></div>
            <div class="conf-track">
                <div class="conf-fill fill-sev-${i}" id="bar-${i}" style="width:0%"></div>
            </div>
        </div>
    `).join('');

    const toP = v => (v * 100).toFixed(1) + '%';
    scale.levels.forEach((level, i) =>
    {
        const score = r.scores[ level.code ] ?? 0;
        document.getElementById('conf-' + i).textContent = toP(score);
    });

    // Show dynamic result area with animation
    const ra = document.getElementById('dynamic-result-area');
    ra.style.display = 'flex';
    ra.classList.add('visible');

    // Animate bars after paint
    setTimeout(() =>
    {
        scale.levels.forEach((level, i) =>
        {
            const score = r.scores[ level.code ] ?? 0;
            document.getElementById('bar-' + i).style.width = (score * 100) + '%';
        });
    }, 60);

    drawGradCAM(r);

    // Smooth scroll to result
    setTimeout(() => ra.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
}

// ── GRAD-CAM SIMULATION/RENDERING ──
function drawGradCAM(r)
{
    const imgEl = document.getElementById('preview-img');
    drawOriginal(imgEl);

    if (r.gradcam_url)
    {
        // Backend returned a generated Grad-CAM
        drawOverlayFromURL(r.gradcam_url);
    } else
    {
        // Fallback or mock : do not generate gradcam via JS
        clearHeatmap();
        drawOverlayEmpty(imgEl);
    }
}

function clearHeatmap()
{
    const c = document.getElementById('cam-heatmap');
    const ctx = c.getContext('2d');
    c.width = 200; c.height = 150;
    ctx.clearRect(0, 0, 200, 150);
}

function drawOverlayEmpty(imgEl)
{
    const c = document.getElementById('cam-overlay');
    const ctx = c.getContext('2d');
    c.width = 200; c.height = 150;
    const img = new Image();
    img.onload = () =>
    {
        ctx.drawImage(img, 0, 0, 200, 150);
    };
    img.src = imgEl.src;
}

function drawOriginal(imgEl)
{
    const c = document.getElementById('cam-original');
    const ctx = c.getContext('2d');
    c.width = 200; c.height = 150;

    // Draw the image nicely cropped or scaled to fit 200x150
    const img = new Image();
    img.onload = () =>
    {
        // Simple scale to fit (or stretch)
        ctx.drawImage(img, 0, 0, 200, 150);
    };
    img.src = imgEl.src;
}

function drawOverlayFromURL(url)
{
    const c = document.getElementById('cam-overlay');
    const ctx = c.getContext('2d');
    c.width = 200; c.height = 150;

    // Clear heatmap mock canvas
    const hc = document.getElementById('cam-heatmap');
    const hctx = hc.getContext('2d');
    hc.width = 200; hc.height = 150;
    hctx.clearRect(0, 0, hc.width, hc.height);

    const img = new Image();
    img.crossOrigin = "Anonymous"; // Avoid CORS canvas issues
    img.onload = () =>
    {
        ctx.drawImage(img, 0, 0, 200, 150);

        // Populate the heatmap canvas with the same image temporarily for the UI
        hctx.drawImage(img, 0, 0, 200, 150);
    };
    img.src = url + "?t=" + new Date().getTime(); // Prevent caching old heatmaps
}

// ── ZOOM SUR LES IMAGES (originale & Grad-CAM) ──
// On affiche la source haute résolution (pas le petit canvas 200x150) pour
// un zoom net : l'image originale uploadée, ou l'URL Grad-CAM du backend.
let currentZoomTarget = null; // 'cam-original' | 'cam-overlay'

function getHighResSrcFor(canvasId)
{
    if (canvasId === 'cam-original')
    {
        const img = document.getElementById('preview-img');
        return img && img.src ? img.src : null;
    }
    if (canvasId === 'cam-overlay')
    {
        if (lastResult && lastResult.gradcam_url)
        {
            return lastResult.gradcam_url + "?t=" + new Date().getTime();
        }
        // Pas de Grad-CAM généré : on retombe sur l'image d'origine affichée dans le canvas
        const img = document.getElementById('preview-img');
        return img && img.src ? img.src : null;
    }
    return null;
}

function openImageModal(canvasId, title)
{
    const src = getHighResSrcFor(canvasId);
    if (!src) return;

    currentZoomTarget = canvasId;
    document.getElementById('image-zoom-title').textContent = title || 'Image';
    const imgEl = document.getElementById('image-zoom-img');
    imgEl.src = src;

    const modal = document.getElementById('image-zoom-modal');
    modal.classList.add('open');
}

function closeImageModal(event)
{
    // Si appelé via le clic sur l'arrière-plan, ne fermer que si le clic est bien hors du contenu
    if (event && event.target && event.target.id !== 'image-zoom-modal') return;
    document.getElementById('image-zoom-modal').classList.remove('open');
    currentZoomTarget = null;
}

function downloadZoomedImage()
{
    if (!currentZoomTarget) return;
    const filename = currentZoomTarget === 'cam-original' ? 'image_originale.jpg' : 'gradcam_superposition.jpg';
    downloadImageFromSrc(document.getElementById('image-zoom-img').src, filename);
}

// ── TÉLÉCHARGEMENT D'IMAGES INDIVIDUELLES ──
function downloadCanvasImage(canvasId, filename)
{
    const src = getHighResSrcFor(canvasId);
    if (!src)
    {
        // Repli : télécharger directement le contenu du canvas affiché
        const canvas = document.getElementById(canvasId);
        try
        {
            const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
            triggerDownload(dataUrl, filename);
        } catch (e)
        {
            console.error('Téléchargement impossible :', e);
        }
        return;
    }
    downloadImageFromSrc(src, filename);
}

function downloadImageFromSrc(src, filename)
{
    // Les data: URLs (preview local) se téléchargent directement.
    if (src.startsWith('data:'))
    {
        triggerDownload(src, filename);
        return;
    }

    // Les URLs distantes (Grad-CAM servi par le backend) sont récupérées en
    // blob pour forcer un vrai téléchargement plutôt qu'une navigation.
    fetch(src)
        .then(res => res.blob())
        .then(blob =>
        {
            const blobUrl = URL.createObjectURL(blob);
            triggerDownload(blobUrl, filename);
            setTimeout(() => URL.revokeObjectURL(blobUrl), 4000);
        })
        .catch(err =>
        {
            console.error('Téléchargement impossible, ouverture dans un nouvel onglet :', err);
            window.open(src, '_blank');
        });
}

function triggerDownload(href, filename)
{
    const a = document.createElement('a');
    a.href = href;
    a.download = filename || 'image.jpg';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

// ── EXPORT PDF DU RAPPORT (résultat + scores + image + Grad-CAM) ──
function loadImageAsDataURL(src)
{
    return new Promise((resolve) =>
    {
        if (!src) { resolve(null); return; }

        // data: URL déjà exploitable directement
        if (src.startsWith('data:')) { resolve(src); return; }

        fetch(src)
            .then(res => res.blob())
            .then(blob =>
            {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = () => resolve(null);
                reader.readAsDataURL(blob);
            })
            .catch(() => resolve(null));
    });
}

async function downloadResultPDF()
{
    if (!lastResult)
    {
        alert("Aucun résultat à exporter. Veuillez d'abord lancer une analyse.");
        return;
    }

    const btnTxt = document.getElementById('pdf-btn-txt');
    const btnSpin = document.getElementById('pdf-btn-spin');
    const btn = document.getElementById('download-pdf-btn');
    btn.disabled = true;
    btnTxt.style.display = 'none';
    btnSpin.style.display = 'block';

    try
    {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ unit: 'mm', format: 'a4' });
        const pageWidth = doc.internal.pageSize.getWidth();
        const marginX = 15;
        let y = 18;

        // ── En-tête ──
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(18);
        doc.setTextColor(30, 30, 30);
        doc.text('EndoAI — Rapport de diagnostic', marginX, y);
        y += 7;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.setTextColor(120, 120, 120);
        const dateStr = new Date().toLocaleString('fr-FR');
        doc.text('Généré le ' + dateStr, marginX, y);
        y += 9;

        doc.setDrawColor(220, 220, 220);
        doc.line(marginX, y, pageWidth - marginX, y);
        y += 10;

        // ── Informations générales ──
        const r = lastResult;
        const diseaseLabel = r.disease === 'crohn' ? 'Maladie de Crohn' : 'Colite ulcérée (UC)';

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(30, 30, 30);
        doc.text('Résultat de l\u2019analyse', marginX, y);
        y += 7;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(11);
        const infoLines = [
            ['Maladie évaluée', diseaseLabel],
            ['Échelle utilisée', r.scaleName || ''],
            ['Modèle utilisé', r.name || ''],
            ['Niveau de sévérité prédit', r.severityLabel || ''],
        ];
        infoLines.forEach(([ label, value ]) =>
        {
            doc.setTextColor(120, 120, 120);
            doc.text(label + ' :', marginX, y);
            doc.setTextColor(30, 30, 30);
            doc.text(String(value), marginX + 55, y);
            y += 6.5;
        });
        y += 4;

        // ── Scores de confiance ──
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(30, 30, 30);
        doc.text('Scores de confiance par niveau', marginX, y);
        y += 7;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10.5);
        const levels = r.scaleLevels || [];
        levels.forEach((level) =>
        {
            const score = r.scores[ level.code ] ?? 0;
            const pct = (score * 100).toFixed(1) + ' %';

            doc.setTextColor(60, 60, 60);
            doc.text(level.label, marginX, y);
            doc.setTextColor(30, 30, 30);
            doc.text(pct, pageWidth - marginX - 14, y);

            // Petite barre de score
            const barX = marginX;
            const barY = y + 1.6;
            const barMaxW = pageWidth - 2 * marginX;
            const barH = 2.2;
            doc.setFillColor(230, 230, 230);
            doc.rect(barX, barY, barMaxW, barH, 'F');
            doc.setFillColor(59, 145, 247);
            doc.rect(barX, barY, barMaxW * Math.min(score, 1), barH, 'F');

            y += 9;
        });
        y += 4;

        if (y > 230) { doc.addPage(); y = 18; }

        // ── Images : originale + Grad-CAM ──
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(30, 30, 30);
        doc.text('Image analysée & explicabilité (Grad-CAM)', marginX, y);
        y += 8;

        const originalSrc = document.getElementById('preview-img').src;
        const gradcamSrc = r.gradcam_url ? (r.gradcam_url + '?t=' + new Date().getTime()) : originalSrc;

        const [ originalData, gradcamData ] = await Promise.all([
            loadImageAsDataURL(originalSrc),
            loadImageAsDataURL(gradcamSrc)
        ]);

        const imgW = (pageWidth - 2 * marginX - 8) / 2;
        const imgH = imgW * 0.75;

        const formatFromDataURL = (dataUrl) =>
        {
            if (!dataUrl) return 'JPEG';
            if (dataUrl.startsWith('data:image/png')) return 'PNG';
            if (dataUrl.startsWith('data:image/webp')) return 'WEBP';
            return 'JPEG';
        };

        if (originalData)
        {
            try { doc.addImage(originalData, formatFromDataURL(originalData), marginX, y, imgW, imgH); } catch (e) { console.error(e); }
        }
        if (gradcamData)
        {
            try { doc.addImage(gradcamData, formatFromDataURL(gradcamData), marginX + imgW + 8, y, imgW, imgH); } catch (e) { console.error(e); }
        }
        y += imgH + 5;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9.5);
        doc.setTextColor(120, 120, 120);
        doc.text('Image originale', marginX, y);
        doc.text('Superposition Grad-CAM', marginX + imgW + 8, y);
        y += 10;

        // ── Avertissement médical ──
        if (y > 250) { doc.addPage(); y = 18; }
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(9);
        doc.setTextColor(150, 110, 20);
        const warning = "Avertissement : cet outil est destine a l'aide au diagnostic uniquement. Il ne remplace pas l'expertise d'un professionnel de sante qualifie.";
        const wrapped = doc.splitTextToSize(warning, pageWidth - 2 * marginX);
        doc.text(wrapped, marginX, y);

        const filenameSafe = 'EndoAI_rapport_' + (r.disease || 'resultat') + '_' + Date.now() + '.pdf';
        doc.save(filenameSafe);

    } catch (err)
    {
        console.error('Erreur lors de la génération du PDF :', err);
        alert("Une erreur est survenue lors de la génération du PDF. Veuillez réessayer.");
    } finally
    {
        btn.disabled = false;
        btnTxt.style.display = 'inline';
        btnSpin.style.display = 'none';
    }
}


// ── MODEL DETAIL ──
// Courbes d'entraînement réelles (extraites des logs d'entraînement) et
// métriques de validation réelles (mesurées sous échantillonneur pondéré,
// pour compenser le déséquilibre des classes). Structure : par maladie,
// puis par modèle.
const modelData = {
    uc: {
        resnet: {
            name: 'ResNet-50',
            tag: 'Réseau résiduel profond — LIMUC (UC)',
            layers: ['Conv2D 64 + BN + ReLU', '4× Blocs résiduels (64→128→256→512)', 'Connexions skip (shortcuts)', 'Global Average Pooling', 'Dense 4 → Softmax (Mayo 0-3)'],
            loss: {
                train: [1.0026, 0.7461, 0.6148, 0.5697, 0.5361, 0.5204, 0.5037, 0.4860, 0.4808, 0.4536, 0.4499, 0.4306, 0.4274, 0.4166, 0.3945, 0.3769, 0.3743, 0.3564, 0.3455, 0.3226],
                val: [0.8516, 0.6767, 0.6105, 0.5701, 0.5636, 0.5452, 0.5324, 0.5295, 0.5301, 0.5263, 0.5275, 0.5346, 0.5331, 0.5348, 0.5437, 0.5324, 0.5627, 0.5473, 0.5403, 0.5739]
            },
            acc: {
                train: null, // non logué à l'entraînement (seule Val Acc a été suivie)
                val: [0.6126, 0.7226, 0.7284, 0.7461, 0.7445, 0.7701, 0.7685, 0.7732, 0.7722, 0.7800, 0.7774, 0.7722, 0.7779, 0.7774, 0.7685, 0.7628, 0.7701, 0.7789, 0.7696, 0.7659]
            },
            bestEpoch: 10,
            bestValAcc: 0.7800,
            earlyStopEpoch: 20,
            totalEpochs: 50,
            metrics: [
                ['Précision globale', '76.0%', '—', '—', '—'],
                ['Macro-moyenne', '70.0%', '71.0%', '70.0%', '—'],
            ],
            params: '≈ 25.6M'
        },
        vit: {
            name: 'ViT-S/16',
            tag: 'Vision Transformer — LIMUC (UC)',
            layers: ['Patch Embedding 16×16 → 196 tokens', 'Positional Encoding', '12× Transformer Blocks (MSA + FFN)', 'MLP Head (384→4)', 'Softmax — Mayo 0-3'],
            loss: {
                train: [0.6443, 0.4831, 0.4557, 0.4314, 0.4051, 0.3818, 0.3717, 0.3423, 0.3290, 0.3052, 0.2705, 0.2501, 0.2248, 0.2068, 0.1870, 0.1607, 0.1413, 0.1246, 0.1122, 0.1107, 0.0907, 0.0803, 0.0769, 0.0705, 0.0640, 0.0620, 0.0490, 0.0454, 0.0405, 0.0377],
                val: [0.6441, 0.5639, 0.5104, 0.5488, 0.5385, 0.5104, 0.4983, 0.5050, 0.5123, 0.5132, 0.5247, 0.5381, 0.5348, 0.5495, 0.5688, 0.5936, 0.5682, 0.6467, 0.6758, 0.6196, 0.6979, 0.7054, 0.7294, 0.7528, 0.7183, 0.7832, 0.8370, 0.8203, 0.8825, 0.8792]
            },
            acc: {
                train: null,
                val: [0.7200, 0.7596, 0.7826, 0.7570, 0.7643, 0.7888, 0.7951, 0.7956, 0.7914, 0.7888, 0.7852, 0.7821, 0.7920, 0.7956, 0.7967, 0.7868, 0.7904, 0.7883, 0.7815, 0.7946, 0.7878, 0.7878, 0.7888, 0.7914, 0.7888, 0.7935, 0.7842, 0.7789, 0.7899, 0.7878]
            },
            bestEpoch: 15,
            bestValAcc: 0.7967,
            earlyStopEpoch: 30,
            totalEpochs: 60,
            metrics: [
                ['Précision globale', '78.0%', '—', '—', '—'],
                ['Macro-moyenne', '72.0%', '70.0%', '71.0%', '—'],
            ],
            params: '≈ 22.0M'
        }
    },
    crohn: {
        resnet: {
            name: 'ResNet-50',
            tag: 'Réseau résiduel profond — CrohnIPI',
            layers: ['Conv2D 64 + BN + ReLU', '4× Blocs résiduels (64→128→256→512)', 'Connexions skip (shortcuts)', 'Global Average Pooling', 'Dense 7 → Softmax (N, E, O, S, AU, U3-10, U>10)'],
            loss: {
                train: [1.5066, 1.1372, 1.0632, 1.0166, 0.9680, 0.9406, 0.8797, 0.8173, 0.7802, 0.7236, 0.6670, 0.6276, 0.5933, 0.5436, 0.4968, 0.4754, 0.4517, 0.4007, 0.3837, 0.3548, 0.3531, 0.3409, 0.2893, 0.2647, 0.2632, 0.2804, 0.2558, 0.2080, 0.2041, 0.2018, 0.1866, 0.1644, 0.1801, 0.1513, 0.1582, 0.1600, 0.1359, 0.1268, 0.1226, 0.1230, 0.0988, 0.1147, 0.1194, 0.1023, 0.0951, 0.0859, 0.0995],
                val: [1.3033, 1.0945, 1.0596, 1.0014, 0.9815, 0.9319, 0.8645, 0.8352, 0.7917, 0.7753, 0.7105, 0.6519, 0.6652, 0.5923, 0.5693, 0.5783, 0.5495, 0.5348, 0.5302, 0.5301, 0.5958, 0.5263, 0.5310, 0.5067, 0.5384, 0.5072, 0.5316, 0.4971, 0.5433, 0.5464, 0.5294, 0.5245, 0.5556, 0.5710, 0.5811, 0.5835, 0.5492, 0.5623, 0.5819, 0.6127, 0.5917, 0.6322, 0.6040, 0.5913, 0.6065, 0.6037, 0.6004]
            },
            acc: {
                train: null,
                val: [0.6099, 0.6099, 0.6099, 0.6195, 0.6291, 0.6482, 0.6941, 0.7170, 0.7514, 0.7801, 0.7954, 0.8126, 0.8088, 0.8317, 0.8164, 0.8203, 0.8413, 0.8317, 0.8432, 0.8337, 0.8394, 0.8528, 0.8451, 0.8509, 0.8413, 0.8585, 0.8470, 0.8451, 0.8413, 0.8394, 0.8566, 0.8604, 0.8470, 0.8394, 0.8585, 0.8394, 0.8489, 0.8451, 0.8604, 0.8432, 0.8509, 0.8585, 0.8585, 0.8489, 0.8566, 0.8547, 0.8394]
            },
            bestEpoch: 32,
            bestValAcc: 0.8604,
            earlyStopEpoch: 47,
            totalEpochs: 50,
            metrics: [
                ['Précision globale', '82.0%', '—', '—', '—'],
                ['Macro-moyenne', '73.0%', '63.0%', '66.0%', '—'],
            ],
            params: '≈ 25.6M'
        },
        vit: {
            name: 'ViT-S/16',
            tag: 'Vision Transformer — CrohnIPI',
            layers: ['Patch Embedding 16×16 → 196 tokens', 'Positional Encoding', '12× Transformer Blocks (MSA + FFN)', 'MLP Head (384→7)', 'Softmax — N, E, O, S, AU, U3-10, U>10'],
            loss: {
                train: [1.1315, 0.7523, 0.5711, 0.4748, 0.4162, 0.3370, 0.2991, 0.2589, 0.2281, 0.2069, 0.1958, 0.1538, 0.1418, 0.1376, 0.1211, 0.0973, 0.1038, 0.0808, 0.0791, 0.0642, 0.0694, 0.0549, 0.0457, 0.0440, 0.0490, 0.0517, 0.0377, 0.0326, 0.0400, 0.0358, 0.0300, 0.0217, 0.0217, 0.0316, 0.0545, 0.0199, 0.0201, 0.0245, 0.0178, 0.0223, 0.0209],
                val: [0.9324, 0.7234, 0.6526, 0.5616, 0.4685, 0.5024, 0.4169, 0.4201, 0.4080, 0.4277, 0.4227, 0.4009, 0.4414, 0.4116, 0.4116, 0.4187, 0.4054, 0.4662, 0.4614, 0.4506, 0.4279, 0.4594, 0.4574, 0.4685, 0.4744, 0.4655, 0.4704, 0.4862, 0.4672, 0.5022, 0.5006, 0.5327, 0.5327, 0.5371, 0.4907, 0.4777, 0.5597, 0.4923, 0.5852, 0.5681, 0.5676]
            },
            acc: {
                train: null,
                val: [0.7075, 0.7610, 0.7801, 0.8011, 0.8337, 0.8222, 0.8489, 0.8528, 0.8585, 0.8528, 0.8509, 0.8642, 0.8413, 0.8585, 0.8566, 0.8604, 0.8623, 0.8470, 0.8489, 0.8470, 0.8700, 0.8547, 0.8604, 0.8662, 0.8604, 0.8834, 0.8604, 0.8700, 0.8700, 0.8604, 0.8681, 0.8642, 0.8757, 0.8623, 0.8681, 0.8662, 0.8700, 0.8681, 0.8585, 0.8623, 0.8662]
            },
            bestEpoch: 26,
            bestValAcc: 0.8834,
            earlyStopEpoch: 41,
            totalEpochs: 50,
            metrics: [
                ['Précision globale', '87.0%', '—', '—', '—'],
                ['Macro-moyenne', '77.0%', '75.0%', '75.0%', '—'],
            ],
            params: '≈ 22.0M'
        }
    }
};

let lossChart = null, accChart = null;
const chartDefaults = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { labels: { color: '#7a8ba0', font: { family: 'DM Sans', size: 11 }, boxWidth: 12 } } },
    scales: {
        x: { ticks: { color: '#7a8ba0', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.05)' } },
        y: { ticks: { color: '#7a8ba0', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.05)' } }
    }
};

let currentModelKey = null;

function showModelDetail(key)
{
    document.querySelectorAll('.model-card').forEach(c => c.classList.remove('active'));
    document.getElementById('card-' + key).classList.add('active');
    currentModelKey = key;

    const d = modelData[ selectedDisease ][ key ];
    document.getElementById('detail-tag').textContent = d.tag;
    document.getElementById('detail-title').textContent = d.name;

    const mb = document.getElementById('metrics-body');
    mb.innerHTML = d.metrics.map((r, i) => `
    <tr${i === d.metrics.length - 1 ? ' style="font-weight:500"' : ''}>
      <td>${r[ 0 ]}</td>
      <td class="score-cell">${r[ 1 ]}</td>
      <td class="score-cell">${r[ 2 ]}</td>
      <td class="score-cell">${r[ 3 ]}</td>
      <td style="color:var(--muted)">${r[ 4 ]}</td>
    </tr>
  `).join('');

    const epochs = Array.from({ length: d.loss.train.length }, (_, i) => 'Ép. ' + (i + 1));
    if (lossChart) lossChart.destroy();
    if (accChart) accChart.destroy();

    lossChart = new Chart(document.getElementById('loss-chart'), {
        type: 'line',
        data: {
            labels: epochs,
            datasets: [
                { label: 'Train', data: d.loss.train, borderColor: '#3b91f7', tension: 0.4, pointRadius: 2, borderWidth: 2, fill: false },
                { label: 'Validation', data: d.loss.val, borderColor: '#ef5b5b', tension: 0.4, pointRadius: 2, borderWidth: 2, borderDash: [ 4, 3 ], fill: false }
            ]
        },
        options: { ...chartDefaults }
    });

    // Val Acc est toujours disponible ; Train Acc n'a pas été loguée pendant
    // ces entraînements (seule la perte d'entraînement a été suivie), donc
    // le dataset "Train" n'est affiché que s'il existe.
    const accDatasets = [
        { label: 'Validation', data: d.acc.val, borderColor: '#f9c848', tension: 0.4, pointRadius: 2, borderWidth: 2, fill: false }
    ];
    if (d.acc.train)
    {
        accDatasets.unshift({ label: 'Train', data: d.acc.train, borderColor: '#2dd4a0', tension: 0.4, pointRadius: 2, borderWidth: 2, fill: false });
    }

    accChart = new Chart(document.getElementById('acc-chart'), {
        type: 'line',
        data: { labels: epochs, datasets: accDatasets },
        options: { ...chartDefaults }
    });

    const detail = document.getElementById('model-detail');
    detail.classList.add('open');
    setTimeout(() => detail.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
}

function refreshModelDetailIfOpen()
{
    const detail = document.getElementById('model-detail');
    if (detail.classList.contains('open') && currentModelKey)
    {
        showModelDetail(currentModelKey);
    }
}

function closeModelDetail()
{
    document.getElementById('model-detail').classList.remove('open');
    document.querySelectorAll('.model-card').forEach(c => c.classList.remove('active'));
}

// ── CONTACT FORM ──
async function submitForm()
{
    const fields = [ 'f-prenom', 'f-nom', 'f-email', 'f-message' ];
    const empty = fields.some(id => !document.getElementById(id).value.trim());
    if (empty) { alert('Veuillez remplir tous les champs requis.'); return; }

    // UI state: loading
    const btn = document.querySelector('.submit-btn');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Envoi en cours...";
    btn.style.opacity = "0.7";

    const templateParams = {
        prenom: document.getElementById('f-prenom').value,
        nom: document.getElementById('f-nom').value,
        email: document.getElementById('f-email').value,
        profil: document.getElementById('f-profil').value,
        message: document.getElementById('f-message').value
    };

    const statusDiv = document.getElementById('form-success');

    try
    {
        // Envoi E-mail avec EmailJS
        // (Remplacez par votre vrai Service ID et Template ID EmailJS)
        await emailjs.send('SERVICE_ID_A_REMPLACER', 'TEMPLATE_ID_A_REMPLACER', templateParams);

        // UI state: success
        statusDiv.style.display = 'block';
        statusDiv.style.backgroundColor = "rgba(45,212,160,0.1)";
        statusDiv.style.color = "var(--green)";
        statusDiv.style.border = "1px solid rgba(45,212,160,0.2)";
        statusDiv.style.padding = "12px";
        statusDiv.style.borderRadius = "8px";
        statusDiv.textContent = "✓ Message envoyé ! Nous reviendrons vers vous rapidement.";

        fields.forEach(id => document.getElementById(id).value = '');
        document.getElementById('f-profil').value = '';
    } catch (error)
    {
        console.error('EmailJS error:', error);

        // UI state: error styling
        statusDiv.style.display = 'block';
        statusDiv.style.backgroundColor = "rgba(239,91,91,0.08)";
        statusDiv.style.color = "var(--red)";
        statusDiv.style.border = "1px solid rgba(239,91,91,0.25)";
        statusDiv.style.padding = "12px";
        statusDiv.style.borderRadius = "8px";
        statusDiv.textContent = "⚠️ Une erreur est survenue lors de l'envoi du message. Veuillez réessayer.";
    } finally
    {
        btn.disabled = false;
        btn.textContent = originalText;
        btn.style.opacity = "1";
    }
}

// ── INITIALISATION ──
// Remplit les pastilles de métriques des cartes "Modèles disponibles" avec
// les valeurs de la maladie sélectionnée par défaut au chargement de la page.
updateModelCardsPills();
