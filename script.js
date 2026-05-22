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

// ── UPLOAD ──
const fileInput = document.getElementById('file-input');
const dropZone = document.getElementById('drop-zone');
let uploadedFile = null;

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

// ── ANALYSIS ──
function runAnalysis()
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

    setTimeout(() =>
    {
        const models = {
            resnet: { name: 'ResNet-50', normal: 0.05, crohn: 0.82, uc: 0.13, diag: 'crohn' },
            vit: { name: 'ViT-B/16', normal: 0.04, crohn: 0.79, uc: 0.17, diag: 'crohn' },
            cnn: { name: 'CNN Baseline', normal: 0.11, crohn: 0.71, uc: 0.18, diag: 'crohn' },
        };
        const r = models[ selectedModel ];

        // Hide indicator
        document.getElementById('analyzing-indicator').classList.remove('active');

        showResults(r);

        btn.disabled = false;
        document.getElementById('btn-txt').style.display = 'inline';
        document.getElementById('btn-spin').style.display = 'none';
    }, 2200);
}

function showResults(r)
{
    const labels = { normal: 'Normal', crohn: 'Maladie de Crohn', uc: 'Colite ulcéreuse' };
    const classes = { normal: 'diag-normal', crohn: 'diag-crohn', uc: 'diag-uc' };
    const el = document.getElementById('diag-label');
    el.textContent = labels[ r.diag ];
    el.className = 'diagnosis-label ' + classes[ r.diag ];
    document.getElementById('model-tag').textContent = 'via ' + r.name;

    const toP = v => (v * 100).toFixed(1) + '%';
    document.getElementById('conf-normal').textContent = toP(r.normal);
    document.getElementById('conf-crohn').textContent = toP(r.crohn);
    document.getElementById('conf-uc').textContent = toP(r.uc);

    // Show dynamic result area with animation
    const ra = document.getElementById('dynamic-result-area');
    ra.style.display = 'flex';
    ra.classList.add('visible');

    // Animate bars after paint
    setTimeout(() =>
    {
        document.getElementById('bar-normal').style.width = (r.normal * 100) + '%';
        document.getElementById('bar-crohn').style.width = (r.crohn * 100) + '%';
        document.getElementById('bar-uc').style.width = (r.uc * 100) + '%';
    }, 60);

    drawGradCAM();
    showFindings();

    // Smooth scroll to result
    setTimeout(() => ra.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
}

// ── GRAD-CAM SIMULATION ──
function drawGradCAM()
{
    const imgEl = document.getElementById('preview-img');
    drawOriginal(imgEl);
    drawHeatmap();
    drawOverlay(imgEl);
}

function drawOriginal(imgEl)
{
    const c = document.getElementById('cam-original');
    const ctx = c.getContext('2d');
    c.width = 200; c.height = 150;
    const img = new Image();
    img.onload = () => ctx.drawImage(img, 0, 0, 200, 150);
    img.src = imgEl.src;
}

function drawHeatmap()
{
    const c = document.getElementById('cam-heatmap');
    const ctx = c.getContext('2d');
    c.width = 200; c.height = 150;
    ctx.fillStyle = '#0a0f15';
    ctx.fillRect(0, 0, 200, 150);
    const blobs = [
        { x: 90, y: 60, r: 50, s: 'rgba(239,91,91,0.9)' },
        { x: 130, y: 90, r: 40, s: 'rgba(249,200,72,0.75)' },
        { x: 60, y: 100, r: 30, s: 'rgba(249,200,72,0.5)' },
        { x: 155, y: 50, r: 25, s: 'rgba(74,222,128,0.4)' },
    ];
    blobs.forEach(b =>
    {
        const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
        g.addColorStop(0, b.s);
        g.addColorStop(1, 'transparent');
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fillStyle = g; ctx.fill();
    });
}

function drawOverlay(imgEl)
{
    const c = document.getElementById('cam-overlay');
    const ctx = c.getContext('2d');
    c.width = 200; c.height = 150;
    const img = new Image();
    img.onload = () =>
    {
        ctx.drawImage(img, 0, 0, 200, 150);
        ctx.globalAlpha = 0.55;
        const hm = document.getElementById('cam-heatmap');
        ctx.drawImage(hm, 0, 0);
        ctx.globalAlpha = 1;
    };
    img.src = imgEl.src;
}

// ── FINDINGS ──
function showFindings()
{
    const fl = document.getElementById('findings-list');
    const items = [
        { sev: 'high', title: 'Ulcérations serpigineuses', desc: 'Zone 1 — Centre de l\'image. Lésions profondes caractéristiques de la maladie de Crohn détectées avec une activation élevée (78%).' },
        { sev: 'med', title: 'Aspect en pavé cobblestone', desc: 'Zone 2 — Quadrant supérieur droit. Motif muqueux typique des MICI inflammatoires actives (61%).' },
        { sev: 'low', title: 'Muqueuse saine adjacente', desc: 'Zone 3 — Bords. Régions de référence sans activité inflammatoire détectée (22%).' },
    ];
    const colors = { high: 'var(--red)', med: 'var(--amber)', low: 'var(--teal)' };
    fl.innerHTML = items.map(i => `
    <div class="finding-item finding-${i.sev}">
      <div class="finding-dot" style="background:${colors[ i.sev ]}"></div>
      <div class="finding-text"><strong>${i.title}</strong>${i.desc}</div>
    </div>
  `).join('');
}

// ── MODEL DETAIL ──
const modelData = {
    cnn: {
        name: 'CNN Baseline',
        tag: 'Architecture convolutive',
        layers: [ 'Conv2D 32 → ReLU → MaxPool', 'Conv2D 64 → ReLU → MaxPool', 'Conv2D 128 → ReLU → MaxPool', 'Dense 256 → Dropout 0.4', 'Dense 3 → Softmax' ],
        loss: {
            train: [ 0.92, 0.74, 0.61, 0.52, 0.44, 0.39, 0.35, 0.32, 0.30, 0.29 ],
            val: [ 0.98, 0.83, 0.70, 0.63, 0.57, 0.54, 0.52, 0.51, 0.50, 0.51 ]
        },
        acc: {
            train: [ 0.61, 0.72, 0.78, 0.82, 0.85, 0.87, 0.88, 0.89, 0.90, 0.90 ],
            val: [ 0.58, 0.69, 0.74, 0.77, 0.80, 0.82, 0.83, 0.84, 0.84, 0.84 ]
        },
        metrics: [
            [ 'Normal', '90.1%', '89.4%', '89.7%', 312 ],
            [ 'Crohn', '86.4%', '88.1%', '87.2%', 287 ],
            [ 'UC', '85.8%', '89.2%', '87.5%', 301 ],
            [ 'Moyenne', '87.4%', '88.9%', '88.1%', 900 ],
        ]
    },
    resnet: {
        name: 'ResNet-50',
        tag: 'Réseau résiduel profond',
        layers: [ 'Conv2D 64 + BN + ReLU', '4× Blocs résiduels (64→128→256→512)', 'Connexions skip (shortcuts)', 'Global Average Pooling', 'Dense 3 → Softmax (fine-tuning)' ],
        loss: {
            train: [ 0.68, 0.49, 0.37, 0.28, 0.22, 0.18, 0.15, 0.13, 0.12, 0.11 ],
            val: [ 0.72, 0.55, 0.44, 0.37, 0.32, 0.29, 0.27, 0.26, 0.25, 0.26 ]
        },
        acc: {
            train: [ 0.72, 0.82, 0.88, 0.91, 0.93, 0.95, 0.96, 0.97, 0.97, 0.97 ],
            val: [ 0.69, 0.79, 0.85, 0.88, 0.91, 0.93, 0.94, 0.95, 0.95, 0.95 ]
        },
        metrics: [
            [ 'Normal', '96.3%', '95.7%', '96.0%', 312 ],
            [ 'Crohn', '94.8%', '96.9%', '95.8%', 287 ],
            [ 'UC', '94.6%', '96.6%', '95.6%', 301 ],
            [ 'Moyenne', '95.2%', '96.4%', '95.8%', 900 ],
        ]
    },
    vit: {
        name: 'ViT-B/16',
        tag: 'Vision Transformer',
        layers: [ 'Patch Embedding 16×16 → 196 tokens', 'Positional Encoding', '12× Transformer Blocks (MSA + FFN)', 'MLP Head (768→3)', 'Softmax — 3 classes' ],
        loss: {
            train: [ 0.71, 0.51, 0.38, 0.29, 0.22, 0.17, 0.14, 0.12, 0.11, 0.10 ],
            val: [ 0.74, 0.56, 0.44, 0.35, 0.29, 0.25, 0.23, 0.22, 0.22, 0.22 ]
        },
        acc: {
            train: [ 0.70, 0.80, 0.87, 0.91, 0.93, 0.95, 0.96, 0.97, 0.98, 0.98 ],
            val: [ 0.67, 0.78, 0.85, 0.89, 0.92, 0.94, 0.95, 0.96, 0.96, 0.96 ]
        },
        metrics: [
            [ 'Normal', '97.1%', '96.5%', '96.8%', 312 ],
            [ 'Crohn', '95.7%', '97.0%', '96.3%', 287 ],
            [ 'UC', '95.5%', '96.6%', '96.0%', 301 ],
            [ 'Moyenne', '96.1%', '96.7%', '96.4%', 900 ],
        ]
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

function showModelDetail(key)
{
    document.querySelectorAll('.model-card').forEach(c => c.classList.remove('active'));
    document.getElementById('card-' + key).classList.add('active');

    const d = modelData[ key ];
    document.getElementById('detail-tag').textContent = d.tag;
    document.getElementById('detail-title').textContent = d.name;

    const archEl = document.getElementById('arch-layers');
    archEl.innerHTML = d.layers.map((l, i) => `
    <div class="arch-layer"><div class="arch-layer-num">${i + 1}</div><span style="font-size:12px;">${l}</span></div>
    ${i < d.layers.length - 1 ? '<div class="arch-arrow" style="font-size:13px;color:var(--muted)">↓</div>' : ''}
  `).join('');

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

    const epochs = Array.from({ length: 10 }, (_, i) => 'Ép. ' + (i + 1));
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

    accChart = new Chart(document.getElementById('acc-chart'), {
        type: 'line',
        data: {
            labels: epochs,
            datasets: [
                { label: 'Train', data: d.acc.train, borderColor: '#2dd4a0', tension: 0.4, pointRadius: 2, borderWidth: 2, fill: false },
                { label: 'Validation', data: d.acc.val, borderColor: '#f9c848', tension: 0.4, pointRadius: 2, borderWidth: 2, borderDash: [ 4, 3 ], fill: false }
            ]
        },
        options: { ...chartDefaults }
    });

    const detail = document.getElementById('model-detail');
    detail.classList.add('open');
    setTimeout(() => detail.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
}

function closeModelDetail()
{
    document.getElementById('model-detail').classList.remove('open');
    document.querySelectorAll('.model-card').forEach(c => c.classList.remove('active'));
}

// ── CONTACT FORM ──
function submitForm()
{
    const fields = [ 'f-prenom', 'f-nom', 'f-email', 'f-message' ];
    const empty = fields.some(id => !document.getElementById(id).value.trim());
    if (empty) { alert('Veuillez remplir tous les champs requis.'); return; }
    document.getElementById('form-success').style.display = 'block';
    fields.forEach(id => document.getElementById(id).value = '');
    document.getElementById('f-profil').value = '';
}