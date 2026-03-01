/* ============================================================
   LangExtract Studio — app.js
   Handles Standard mode (langextract) + Clinical mode (direct LLM)
   ============================================================ */

// ─── State ───────────────────────────────────────────────────────────────────

const PROVIDER_MODELS = {
    gemini: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-1.5-flash', 'gemini-1.5-pro'],
    openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
    claude: ['claude-3-5-sonnet-20241022', 'claude-3-opus-20240229', 'claude-3-haiku-20240307'],
    glm: ['glm-4', 'glm-4-flash', 'glm-4-air', 'glm-4-plus']
};

const debounce = (fn, delay = 150) => {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delay);
    };
};

const TEMPLATES = {
    literary: `Extract characters, emotions, and relationships in order of appearance.
Use exact text for extractions. Do not paraphrase or overlap entities.
Provide meaningful attributes for each entity to add context.`,
    medical: `Extract medical entities: diagnoses, medications, dosages, procedures, and symptoms.
Use exact text. Include severity, laterality, and clinical context as attributes.`,
    news: `Extract named entities: people, organizations, locations, and events.
Include roles, relationships, and dates as attributes where present.`,
    custom: ``,
};

const state = {
    mode: 'standard',            // 'standard' | 'clinical' | 'structured'
    provider: localStorage.getItem('lx_provider') || 'gemini',
    selectedModel: 'gemini-2.5-flash',
    clinicalModel: 'gemini-2.5-flash',
    apiKeys: {
        gemini: localStorage.getItem('apiKey_gemini') || '',
        openai: localStorage.getItem('apiKey_openai') || '',
        claude: localStorage.getItem('apiKey_claude') || '',
        glm: localStorage.getItem('apiKey_glm') || '',
    },
    examples: [],
    currentTemplate: 'literary',
    clinStructuredData: null,
    // Prompt Library
    prompts: JSON.parse(localStorage.getItem('langextract_prompts')) || [
        { id: 'p_lit', name: 'Literary', prompt: TEMPLATES.literary, readonly: true },
        { id: 'p_med', name: 'Medical', prompt: TEMPLATES.medical, readonly: true },
        { id: 'p_new', name: 'News', prompt: TEMPLATES.news, readonly: true },
        { id: 'p_fin', name: 'Financial', prompt: 'Extract financial entities: companies, tickers, currencies, revenues, profits. Include fiscal quarters as attributes.', readonly: true }
    ],
    // Schema Builder
    schemaFields: [
        { id: Date.now(), name: 'Patient Name', type: 'string', description: 'Full name of the patient' },
        { id: Date.now() + 1, name: 'Diagnoses', type: 'array', description: 'List of confirmed medical diagnoses' }
    ],
    structModel: 'gemini-2.5-flash',
    // Batch Upload Tracker
    structuredBatchMode: false,
    structuredBatchFiles: []
};

// ─── DOM Shortcuts ────────────────────────────────────────────────────────────

const $ = id => document.getElementById(id);

// ─── Clinical Section Metadata ────────────────────────────────────────────────

const CLIN_SECTIONS = [
    { key: 'history', label: 'History of Present Illness', icon: '📋', section: 'history' },
    { key: 'past_medical_history', label: 'Past Medical History', icon: '🏥', section: 'pmh' },
    { key: 'past_surgical_history', label: 'Past Surgical History', icon: '🔪', section: 'psh' },
    { key: 'family_history', label: 'Family History', icon: '👨‍👩‍👧', section: 'family' },
    { key: 'social_history', label: 'Social History', icon: '🚬', section: 'social' },
    { key: 'allergies', label: 'Allergies', icon: '⚠️', section: 'allergies' },
    { key: 'current_medications', label: 'Current Medications', icon: '💊', section: 'meds' },
    { key: 'vitals', label: 'Vitals', icon: '❤️', section: 'vitals' },
    { key: 'exam', label: 'Physical Exam', icon: '🩺', section: 'exam' },
    { key: 'neurologic_exam', label: 'Neurologic Exam', icon: '🧠', section: 'neuro' },
    { key: 'labs', label: 'Labs', icon: '🧪', section: 'labs' },
    { key: 'imaging', label: 'Imaging', icon: '📷', section: 'imaging' },
    { key: 'active_problems', label: 'Active Problems', icon: '🔴', section: 'problems' },
    { key: 'assessment_impression', label: 'Assessment / Impression', icon: '📝', section: 'assessment' },
    { key: 'plan', label: 'Plan', icon: '📌', section: 'plan' },
    { key: 'orders', label: 'New Orders', icon: '📋', section: 'orders' },
];

// ─── Init ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    initConfig();
    initModeToggle();
    initStandardMode();
    initClinicalMode();
    initStructuredMode();
});

// ─── Mode Toggle ──────────────────────────────────────────────────────────────

function initModeToggle() {
    const btns = document.querySelectorAll('.mode-btn');
    const applyMode = (mode) => {
        const safeMode = ['standard', 'clinical', 'structured'].includes(mode) ? mode : 'standard';
        state.mode = safeMode;
        localStorage.setItem('lx_mode', safeMode);
    btns.forEach(b => {
        b.classList.toggle('active', b.dataset.mode === safeMode);
    });
        const appMain = $('appMain');
        const clinicalMain = $('clinicalMain');
        const structuredMain = $('structuredMain');
        if (appMain) appMain.style.display = safeMode === 'standard' ? 'grid' : 'none';
        if (clinicalMain) clinicalMain.style.display = safeMode === 'clinical' ? 'grid' : 'none';
        if (structuredMain) structuredMain.style.display = safeMode === 'structured' ? 'grid' : 'none';
    };

    const savedMode = localStorage.getItem('lx_mode');
    if (savedMode) {
        applyMode(savedMode);
    } else {
        applyMode(state.mode);
    }

    btns.forEach(btn => {
        btn.addEventListener('click', () => {
            const mode = btn.dataset.mode;
            if (mode === state.mode) return;
            applyMode(mode);
        });
    });
}

// ─── Provider / API Key / Model Config ───────────────────────────────────────

function getActiveKey() {
    return state.apiKeys[state.provider] || '';
}

function updateProviderBadges(provider, model) {
    const providerNames = {
        'gemini': 'Gemini',
        'openai': 'OpenAI',
        'claude': 'Claude',
        'glm': 'GLM'
    };
    const providerIcons = {
        'gemini': 'G',
        'openai': 'O',
        'claude': 'C',
        'glm': 'Z'
    };

    // Clinical badge
    const clinIcon = $('clinProviderIcon');
    if (clinIcon) clinIcon.textContent = providerIcons[provider] || 'G';
    const clinName = $('clinProviderName');
    if (clinName) clinName.textContent = providerNames[provider] || 'Gemini';
    const clinModel = $('clinProviderModel');
    if (clinModel) clinModel.textContent = model || '';

    // Structured badge
    const structIcon = $('structProviderIcon');
    if (structIcon) structIcon.textContent = providerIcons[provider] || 'G';
    const structName = $('structProviderName');
    if (structName) structName.textContent = providerNames[provider] || 'Gemini';
    const structModel = $('structProviderModel');
    if (structModel) structModel.textContent = model || '';

    const structHint = $('structProviderHint');
    if (structHint) structHint.textContent = `${providerNames[provider]} · ${model}`;
}

function switchProvider(provider) {
    state.provider = provider;
    localStorage.setItem('lx_provider', provider);

    // Highlight tab
    document.querySelectorAll('.provider-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.provider === provider);
    });

    // Show/hide key panels
    ['gemini', 'openai', 'claude', 'glm'].forEach(p => {
        const panel = $(`keyPanel-${p}`);
        if (panel) panel.style.display = p === provider ? '' : 'none';
    });

    // Show only the relevant optgroup in the model select
    ['gemini', 'openai', 'claude', 'glm'].forEach(p => {
        const grp = $(`modelGroup-${p}`);
        if (grp) grp.style.display = p === provider ? '' : 'none';
    });

    // Set model select to first option of the new provider
    const select = $('modelSelect');
    if (select) {
        const opts = select.querySelectorAll(`#modelGroup-${provider} option`);
        if (opts.length) {
            select.value = opts[0].value;
            state.selectedModel = opts[0].value;
            state.clinicalModel = opts[0].value;
            state.structModel = opts[0].value;
            const hint = $('modelHint');
            if (hint) hint.textContent = opts[0].value;
        }
        updateProviderBadges(state.provider, state.selectedModel);
    }
}

function initConfig() {
    const providers = ['gemini', 'openai', 'claude', 'glm'];

    // Load persisted keys into inputs
    providers.forEach(p => {
        const input = $(`apiKey-${p}`);
        if (input) {
            input.value = state.apiKeys[p];
            input.addEventListener('input', () => {
                state.apiKeys[p] = input.value.trim();
                localStorage.setItem(`apiKey_${p}`, state.apiKeys[p]);
                // Backwards-compat: keep GEMINI_API_KEY if gemini
                if (p === 'gemini') localStorage.setItem('GEMINI_API_KEY', state.apiKeys[p]);
            });
        }
    });

    // Eye-toggle for each key
    document.querySelectorAll('.input-toggle-btn[data-toggle]').forEach(btn => {
        btn.addEventListener('click', () => {
            const inputId = btn.dataset.toggle;
            const input = $(inputId);
            if (!input) return;
            const isPassword = input.type === 'password';
            input.type = isPassword ? 'text' : 'password';
            btn.querySelector('.eye-open').style.display = isPassword ? 'block' : 'none';
            btn.querySelector('.eye-closed').style.display = isPassword ? 'none' : 'block';
        });
    });

    // Provider tab switching
    document.querySelectorAll('.provider-tab').forEach(tab => {
        tab.addEventListener('click', () => switchProvider(tab.dataset.provider));
    });

    // Model dropdown
    const modelSel = $('modelSelect');
    if (modelSel) {
        modelSel.addEventListener('change', () => {
            state.selectedModel = modelSel.value;
            state.clinicalModel = modelSel.value;
            state.structModel = modelSel.value;
            const hint = $('modelHint');
            if (hint) hint.textContent = modelSel.value;
            updateProviderBadges(state.provider, state.selectedModel);
        });
    }

    // Restore provider + model from last session
    switchProvider(state.provider);
    const savedModel = localStorage.getItem('lx_model');
    if (savedModel && modelSel) {
        modelSel.value = savedModel;
        state.selectedModel = savedModel;
        state.clinicalModel = savedModel;
        state.structModel = savedModel;
    }
    if (modelSel) {
        modelSel.addEventListener('change', () => {
            localStorage.setItem('lx_model', modelSel.value);
        });
    }

    // Change provider buttons
    const switchToStandard = () => {
        document.querySelectorAll('.mode-tab').forEach(t => {
            t.classList.remove('active');
        });
        const stdTab = document.querySelector('.mode-tab[data-mode="standard"]');
        if (stdTab) stdTab.classList.add('active');
        $('standardMain').style.display = 'flex';
        $('clinicalMain').style.display = 'none';
        $('structuredMain').style.display = 'none';
        state.mode = 'standard';
    };

    const clinChangeBtn = $('clinChangeProviderBtn');
    if (clinChangeBtn) clinChangeBtn.addEventListener('click', switchToStandard);

    const structChangeBtn = $('structChangeProviderBtn');

    const structInput = $('structInputText');
    if (structInput) {
        const debouncedStructStats = debounce((val) => updateTextStats(val, 'structWordCount', 'structCharCount', null, 'structTokenCount', 'structCostEst', 'structured'));
        structInput.addEventListener('input', () => debouncedStructStats(structInput.value));
    }
}

// ─── Text Stats Helpers ───────────────────────────────────────────────────────

const MODEL_PRICING_PER_1M_TOKENS = {
    'gemini-2.5-flash': 0.075,
    'gemini-2.5-pro': 3.50,
    'gemini-1.5-flash': 0.075,
    'gemini-1.5-pro': 3.50,
    'gpt-4o': 5.00,
    'gpt-4o-mini': 0.15,
    'gpt-4-turbo': 10.00,
    'gpt-3.5-turbo': 0.50,
    'claude-3-5-sonnet-20241022': 3.00,
    'claude-3-opus-20240229': 15.00,
    'claude-3-haiku-20240307': 0.25,
    'glm-4': 14.00,
    'glm-4-flash': 0.15,
    'glm-4-air': 1.00,
    'glm-4-plus': 7.00
};

function estimateCost(charCount, modelId) {
    const estimatedTokens = Math.ceil(charCount / 4);
    const pricePer1M = MODEL_PRICING_PER_1M_TOKENS[modelId] || 0.15;
    const cost = (estimatedTokens / 1000000) * pricePer1M;
    return { tokens: estimatedTokens.toLocaleString(), cost: cost > 0 ? cost.toFixed(4) : "0.0000" };
}

function updateTextStats(text, wordId, charId, lineId, tokenId, costId, modeHint = 'gemini-2.5-flash') {
    const charCount = text.length;
    const charEl = $(charId);
    const wordEl = $(wordId);
    const lineEl = $(lineId);

    if (charEl) charEl.textContent = charCount.toLocaleString();

    if (wordEl || lineEl) {
        const words = text.trim() ? text.trim().split(/\s+/).length : 0;
        const lines = text.length > 0 ? text.split('\n').length : 0;
        if (wordEl) wordEl.textContent = words.toLocaleString();
        if (lineEl) lineEl.textContent = lines.toLocaleString();
    }

    const tokenEl = $(tokenId);
    const costEl = $(costId);
    if (tokenEl || costEl) {
        let activeModel = modeHint;
        if (modeHint === 'standard') activeModel = state.selectedModel || 'gemini-2.5-flash';
        else if (modeHint === 'clinical') activeModel = state.clinicalModel || 'gemini-2.5-flash';
        else if (modeHint === 'structured') activeModel = state.structModel || 'gemini-2.5-flash';

        const { tokens, cost } = estimateCost(charCount, activeModel);
        if (tokenEl) tokenEl.textContent = tokens;
        if (costEl) costEl.textContent = `$${cost}`;
    }
}


// ═══════════════════════════════════════════════════════════════════════════════
// STANDARD MODE
// ═══════════════════════════════════════════════════════════════════════════════

function initStandardMode() {
    // Default example
    state.examples = [
        {
            text: 'Lady Juliet gazed longingly at the stars, her heart aching for Romeo, whose absence filled her with a deep and melancholic yearning.',
            extractions: [
                {
                    extraction_class: 'Character',
                    extraction_text: 'Lady Juliet',
                    attributes: { gender: 'Female', emotion: 'Longing' },
                },
                {
                    extraction_class: 'Character',
                    extraction_text: 'Romeo',
                    attributes: { gender: 'Male', relationship: 'Absent lover' },
                },
            ],
        },
    ];

    renderExamples();
    updateExamplesCount();

    // Prompt templates
    document.querySelectorAll('.template-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            document.querySelectorAll('.template-chip').forEach(c => {
                c.classList.remove('active');
            });
            chip.classList.add('active');
            state.currentTemplate = chip.dataset.template;
            if (state.currentTemplate !== 'custom') {
                $('promptDescription').value = TEMPLATES[state.currentTemplate];
            }
        });
    });

    // Model buttons
    document.querySelectorAll('[data-model]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('[data-model]').forEach(b => {
                b.classList.remove('active');
            });
            btn.classList.add('active');
            state.selectedModel = btn.dataset.model;
            $('modelHint').textContent = state.selectedModel;
        });
    });

    // API key toggle
    registerEvent('toggleApiKey', 'click', () => toggleSecret('apiKey', 'eyeOpen', 'eyeClosed'));

    // Char counter
    const debouncedStdStats = debounce((val) => updateTextStats(val, null, 'charCount', null, 'tokenCount', 'estCost', 'standard'));
    registerEvent('inputText', 'input', e => {
        debouncedStdStats(e.target.value);
    });

    // Add example
    registerEvent('addExampleBtn', 'click', addExample);

    // Extract
    registerEvent('extractBtn', 'click', runExtraction);

    // Keyboard shortcut
    document.addEventListener('keydown', e => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && state.mode === 'standard') {
            runExtraction();
        }
    });

    // Results tabs
    document.querySelectorAll('[data-tab]').forEach(tab => {
        tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });

    // Copy JSON
    registerEvent('copyJsonBtn', 'click', () => {
        const content = $('jsonOutput')?.textContent;
        if (content) {
            navigator.clipboard.writeText(content).then(() => showToast('JSON copied!', 'success'));
        }
    });

    // Config collapse
    registerEvent('collapseConfig', 'click', toggleConfigCollapse);
}

// Examples ─────────────────────────────────────────────────────────────────────

function addExample() {
    state.examples.push({ text: '', extractions: [] });
    renderExamples();
    updateExamplesCount();
}

function removeExample(idx) {
    state.examples.splice(idx, 1);
    renderExamples();
    updateExamplesCount();
}

function addExtraction(exIdx) {
    state.examples[exIdx].extractions.push({
        extraction_class: '',
        extraction_text: '',
        attributes: {},
    });
    renderExamples();
}

function removeExtraction(exIdx, extIdx) {
    state.examples[exIdx].extractions.splice(extIdx, 1);
    renderExamples();
}

function addAttribute(exIdx, extIdx) {
    const ext = state.examples[exIdx].extractions[extIdx];
    const key = `attr_${Object.keys(ext.attributes).length + 1}`;
    ext.attributes[key] = '';
    renderExamples();
}

function removeAttribute(exIdx, extIdx, attrKey) {
    delete state.examples[exIdx].extractions[extIdx].attributes[attrKey];
    renderExamples();
}

function renderExamples() {
    const container = $('examplesContainer');
    container.innerHTML = '';
    state.examples.forEach((ex, exIdx) => {
        const card = document.createElement('div');
        card.className = 'example-card';
        const extractions = ex.extractions.map((ext, extIdx) => {
            const attrs = Object.entries(ext.attributes).map(([key, val]) => `
        <div class="attr-row">
          <input class="form-input small" placeholder="Key" value="${escHtml(key)}"
            oninput="updateAttrKey(${exIdx},${extIdx},'${key}',this.value)" />
          <input class="form-input small" placeholder="Value" value="${escHtml(String(val))}"
            oninput="updateAttrVal(${exIdx},${extIdx},'${key}',this.value)" />
          <button class="attr-btn" onclick="removeAttribute(${exIdx},${extIdx},'${key}')" title="Remove">×</button>
        </div>`).join('');

            return `
        <div class="extraction-item">
          <button class="remove-extraction" onclick="removeExtraction(${exIdx},${extIdx})" title="Remove">×</button>
          <input class="form-input small" placeholder="Class (e.g. Character)"
            value="${escHtml(ext.extraction_class)}"
            oninput="state.examples[${exIdx}].extractions[${extIdx}].extraction_class=this.value" />
          <input class="form-input small" placeholder="Extracted text"
            value="${escHtml(ext.extraction_text)}"
            oninput="state.examples[${exIdx}].extractions[${extIdx}].extraction_text=this.value" />
          <div class="attrs-group">
            ${attrs}
            <button class="add-attr-btn" onclick="addAttribute(${exIdx},${extIdx})">+ Attribute</button>
          </div>
        </div>`;
        }).join('');

        card.innerHTML = `
      <div class="example-card-header">
        <span class="example-card-title">Example ${exIdx + 1}</span>
        <div class="example-card-actions">
          <button class="btn-icon danger" onclick="removeExample(${exIdx})" title="Remove example">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
          </button>
        </div>
      </div>
      <div class="example-card-body">
        <div class="example-text-group">
          <label class="example-field-label">Source Text</label>
          <textarea class="form-textarea code-font" rows="3"
            oninput="state.examples[${exIdx}].text=this.value"
            placeholder="Example source text…">${escHtml(ex.text)}</textarea>
        </div>
        <div class="example-text-group">
          <label class="example-field-label">Extractions</label>
          <div class="extractions-list">${extractions}</div>
          <div class="add-extraction-btn-row">
            <button class="add-extraction-btn" onclick="addExtraction(${exIdx})">+ Add Extraction</button>
          </div>
        </div>
      </div>`;
        container.appendChild(card);
    });
}

function updateAttrKey(exIdx, extIdx, oldKey, newKey) {
    const attrs = state.examples[exIdx].extractions[extIdx].attributes;
    if (oldKey === newKey) return;
    const val = attrs[oldKey];
    delete attrs[oldKey];
    attrs[newKey] = val;
}

function updateAttrVal(exIdx, extIdx, key, val) {
    state.examples[exIdx].extractions[extIdx].attributes[key] = val;
}

function updateExamplesCount() {
    $('examplesCount').textContent = state.examples.length;
}

// Extraction ───────────────────────────────────────────────────────────────────

async function runExtraction() {
    const apiKey = getActiveKey();
    if (!apiKey) { showToast(`Please enter your ${state.provider.toUpperCase()} API key`, 'error'); return; }

    const text = $('inputText')?.value?.trim();
    if (!text) { showToast('Please enter some text to analyze', 'error'); return; }

    const modelId = state.selectedModel;

    setExtractionLoading(true);
    setStatus('loading', 'Extracting…');

    const payload = {
        text,
        prompt: $('promptDescription')?.value?.trim() ?? '',
        examples: state.examples.map(({ text, extractions }) => ({
            text,
            extractions: extractions.map(({ extraction_class, extraction_text, attributes }) => ({
                extraction_class,
                extraction_text,
                attributes
            })),
        })),
        model_id: state.selectedModel,
        api_key: apiKey,
        provider: state.provider,
    };

    try {
        const data = await apiClient('/api/extract', payload);
        displayResults(data);
        setStatus('ready', 'Done');
        showToast('Extraction complete!', 'success');
    } catch (err) {
        showError(err.message);
        setStatus('error', 'Error');
        showToast(err.message, 'error');
    } finally {
        setExtractionLoading(false);
    }
}

function displayResults(data) {
    $('emptyState').style.display = 'none';
    $('errorState').style.display = 'none';
    $('resultsTabs').style.display = 'flex';

    // Viz tab
    const frame = $('vizFrame');
    frame.srcdoc = data.html || '<p>No visualization available.</p>';
    $('tabVizContent').style.display = 'flex';

    // JSON tab
    $('jsonOutput').textContent = JSON.stringify(data.raw_result, null, 2);

    switchTab('viz');
}

function switchTab(tab) {
    ['viz', 'json'].forEach(t => {
        $(`tab${t.charAt(0).toUpperCase() + t.slice(1)}`).classList.toggle('active', t === tab);
        $(`tab${t.charAt(0).toUpperCase() + t.slice(1)}Content`).style.display = t === tab ? 'flex' : 'none';
    });
}

function setExtractionLoading(loading) {
    const btn = $('extractBtn');
    btn.disabled = loading;
    $('extractSpinner').style.display = loading ? 'flex' : 'none';
    btn.querySelector('.extract-btn-content').style.display = loading ? 'none' : 'flex';
}

function showError(msg) {
    $('emptyState').style.display = 'none';
    $('errorState').style.display = 'flex';
    $('errorMsg').textContent = msg;
    $('resultsTabs').style.display = 'none';
    $('tabVizContent').style.display = 'none';
    $('tabJsonContent').style.display = 'none';
}

// Config collapse ──────────────────────────────────────────────────────────────

let configCollapsed = false;
function toggleConfigCollapse() {
    configCollapsed = !configCollapsed;
    const panel = $('configPanel');
    const btn = $('collapseConfig');
    panel.style.width = configCollapsed ? '48px' : '';
    panel.style.minWidth = configCollapsed ? '48px' : '';
    panel.querySelector('.panel-body').style.display = configCollapsed ? 'none' : '';
    panel.querySelector('.panel-title').style.display = configCollapsed ? 'none' : '';
    btn.textContent = configCollapsed ? '›' : '‹';
}

// ═══════════════════════════════════════════════════════════════════════════════
// CLINICAL MODE
// ═══════════════════════════════════════════════════════════════════════════════

function initClinicalMode() {
    // API key toggle
    registerEvent('toggleClinicalApiKey', 'click', () => {
        toggleSecret('clinicalApiKey', 'clinEyeOpen', 'clinEyeClosed');
    });

    // Model selection
    document.querySelectorAll('[data-clin-model]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('[data-clin-model]').forEach(b => {
                b.classList.remove('active');
            });
            btn.classList.add('active');
            state.clinicalModel = btn.dataset.clinModel;
            $('clinModelHint').textContent = state.clinicalModel;
        });
    });

    // Char counter
    const debouncedClinStats = debounce((val) => updateTextStats(val, 'clinWordCount', 'clinCharCount', 'clinLineCount', 'clinTokenCount', 'clinCostEst', 'clinical'));
    registerEvent('clinicalNoteText', 'input', e => {
        debouncedClinStats(e.target.value);
    });

    // Extract button
    registerEvent('clinicalExtractBtn', 'click', runClinicalExtraction);

    registerEvent('clinCopySummaryBtn', 'click', copyClinicalSummary);

    // Keyboard shortcut
    document.addEventListener('keydown', e => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && state.mode === 'clinical') {
            runClinicalExtraction();
        }
    });

    // Results tabs
    document.querySelectorAll('[data-clin-tab]').forEach(tab => {
        tab.addEventListener('click', () => switchClinTab(tab.dataset.clinTab));
    });

    // Copy JSON
    registerEvent('clinCopyJsonBtn', 'click', () => {
        const textContent = $('clinJsonOutput')?.textContent;
        if (textContent) {
            navigator.clipboard.writeText(textContent)
                .then(() => showToast('JSON copied!', 'success'));
        }
    });

    // Copy Histories
    registerEvent('clinCopyHistoriesBtn', 'click', () => {
        if (!state.clinStructuredData || state.clinStructuredData._parse_error) {
            showToast('No structured data available to copy', 'error');
            return;
        }
        const hKeys = ['history', 'past_medical_history', 'past_surgical_history', 'family_history', 'social_history'];
        let parts = [];
        hKeys.forEach(k => {
            const val = state.clinStructuredData[k];
            if (val !== null && val !== undefined) {
                const label = CLIN_SECTIONS.find(s => s.key === k)?.label || k;
                let text = '';
                if (typeof val === 'string') {
                    text = val;
                } else if (Array.isArray(val)) {
                    text = val.map(v => typeof v === 'string' ? `- ${v}` : `- ${JSON.stringify(v)}`).join('\n');
                } else {
                    text = JSON.stringify(val, null, 2);
                }
                parts.push(`${label}:\n${text}`);
            }
        });
        if (parts.length === 0) {
            showToast('No histories found to copy', 'error');
            return;
        }
        navigator.clipboard.writeText(parts.join('\n\n'))
            .then(() => showToast('Histories copied to clipboard!', 'success'))
            .catch(() => showToast('Failed to copy', 'error'));
    });
}

let currentStreamController = null;

async function runClinicalExtraction() {
    const apiKey = getActiveKey();
    if (!apiKey) { showToast(`Please enter your ${state.provider.toUpperCase()} API key`, 'error'); return; }

    const noteEl = $('clinicalNoteText');
    const rawNote = noteEl?.value ?? '';
    const cleanedNote = rawNote
        .replace(/\r\n/g, '\n')
        .replace(/[\t ]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    if (noteEl && cleanedNote !== rawNote) {
        noteEl.value = cleanedNote;
    }
    if (!cleanedNote) { showToast('Please paste an EMR note first', 'error'); return; }

    if (currentStreamController) {
        currentStreamController.abort();
    }
    currentStreamController = new AbortController();

    setClinicalLoading(true);
    setStatus('loading', 'Processing note…');

    try {
        const res = await fetch('/api/clinical-extract-stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                note_text: cleanedNote,
                model_id: state.clinicalModel,
                api_key: apiKey,
                provider: state.provider,
                }),
            signal: currentStreamController.signal
        });

        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData?.detail || `HTTP Error ${res.status}`);
        }

        const emptyEl = $('clinEmptyState');
        const errEl = $('clinErrorState');
        const tabsEl = $('clinResultsTabs');
        if (emptyEl) emptyEl.style.display = 'none';
        if (errEl) errEl.style.display = 'none';
        if (tabsEl) tabsEl.style.display = 'flex';
        switchClinTab('cards');

        const cardsEl = $('clinTabCardsContent');
        if (cardsEl) {
            cardsEl.innerHTML = `
                <div style="padding:20px; text-align:center; color:var(--text-muted); font-size:14px;">
                   <div class="spinner" style="display:inline-block; margin-right:10px; width:16px; height:16px;"></div> 
                   Streaming response from AI...
                </div>
                <pre id="clinStreamRaw" class="json-output" style="padding:16px; min-height:100px; white-space:pre-wrap; word-break:break-word;"></pre>
            `;
        }

        const jsonOut = $('clinJsonOutput');
        if (jsonOut) jsonOut.textContent = "Streaming...";

        const reader = res.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let rawOutput = "";
        let streamEl = $('clinStreamRaw');

        try {
            while (true) {
                const { value, done } = await reader.read();
                if (done) break;

                if (value) {
                    const chunkStr = decoder.decode(value, { stream: true });
                    const lines = chunkStr.split('\n');
                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            try {
                                const dataObj = JSON.parse(line.substring(6));
                                if (dataObj.chunk) {
                                    rawOutput += dataObj.chunk;
                                    if (streamEl) {
                                        streamEl.textContent = rawOutput;
                                        if (cardsEl) cardsEl.scrollTop = cardsEl.scrollHeight;
                                    }
                                } else if (dataObj.error) {
                                    throw new Error(dataObj.error);
                                }
                            } catch (e) {
                                if (e !== SyntaxError && e.message !== "Unexpected end of JSON input") {
                                    // Let streaming JSON errors pass quietly but log others
                                    console.warn("[Stream Parse Debug]", e);
                                }
                            }
                        }
                    }
                }
            }
        } finally {
            reader.releaseLock();
        }

        // Clean and parse final output
        let clean = rawOutput.trim();
        clean = clean.replace(/^```(?:json)?\s*/im, '');
        clean = clean.replace(/\s*```$/im, '');
        clean = clean.trim();

        let structured;
        try {
            structured = JSON.parse(clean);
        } catch (e) {
            console.error("[Structured Extraction Error] Failed to parse final JSON:", e);
            structured = { raw_text: clean, _parse_error: "Model did not return valid JSON" };
        }

        state.clinStructuredData = structured;
        displayClinicalResults(structured, rawOutput);
        setStatus('ready', 'Done');
        showToast('Streaming complete!', 'success');

        if (typeof saveToHistory === 'function') {
            saveToHistory({
                mode: 'clinical',
                provider: state.provider,
                model: state.clinicalModel,
                inputSnippet: noteText.substring(0, 100),
                promptText: "Clinical Default Extract",
                rawResult: JSON.stringify(structured, null, 2),
                timestamp: new Date().toISOString()
            });
        }
    } catch (err) {
        if (err.name === 'AbortError') {
            console.log('Stream aborted');
        } else {
            showClinicalError(err.message);
            setStatus('error', 'Error');
            showToast(err.message, 'error');
        }
    } finally {
        setClinicalLoading(false);
        currentStreamController = null;
    }
}

function displayClinicalResults(structured, rawOutput) {
    $('clinEmptyState').style.display = 'none';
    $('clinErrorState').style.display = 'none';
    $('clinResultsTabs').style.display = 'flex';

    // Build card view
    const cardsEl = $('clinTabCardsContent');
    cardsEl.innerHTML = '';

    if (structured._parse_error) {
        // Fallback: just show raw text
        const pre = document.createElement('pre');
        pre.className = 'json-output';
        pre.style.padding = '16px';
        pre.textContent = structured.raw_text || rawOutput;
        cardsEl.appendChild(pre);
    } else {
        CLIN_SECTIONS.forEach(({ key, label, icon, section }) => {
            const val = structured[key];
            if (val === null || val === undefined) return; // skip nulls

            const card = document.createElement('div');
            card.className = 'clin-card';
            card.dataset.section = section;
            card.innerHTML = `
        <div class="clin-card-header" onclick="this.parentElement.classList.toggle('collapsed')">
          <span class="clin-card-icon">${icon}</span>
          <span class="clin-card-title">${label}</span>
          <span class="clin-card-toggle">▾</span>
        </div>
        <div class="clin-card-body">${renderClinValue(val)}</div>`;
            cardsEl.appendChild(card);
        });
        if (!cardsEl.children.length) {
            cardsEl.innerHTML = '<p style="padding:16px;color:var(--text-muted);">All sections returned null.</p>';
        }
    }

    // JSON view
    $('clinJsonOutput').textContent = JSON.stringify(structured, null, 2);

    switchClinTab('cards');
}

function renderClinValue(val) {
    if (val === null || val === undefined) {
        return '<span class="clin-value-null">Not present</span>';
    }
    if (typeof val === 'string') {
        return `<span class="clin-value-string">${escHtml(val)}</span>`;
    }
    if (Array.isArray(val)) {
        if (val.length === 0) return '<span class="clin-value-null">None</span>';
        const items = val.map(item => {
            if (typeof item === 'string') {
                return `<li class="clin-list-item">${escHtml(item)}</li>`;
            }
            if (typeof item === 'object' && item !== null) {
                // Object-in-array (e.g. allergy: {medication, reaction})
                const rows = Object.entries(item).map(([k, v]) =>
                    `<div class="clin-subitem-row"><span class="clin-subitem-key">${escHtml(k)}</span><span>${escHtml(String(v ?? ''))}</span></div>`
                ).join('');
                return `<li class="clin-subitem">${rows}</li>`;
            }
            return `<li class="clin-list-item">${escHtml(String(item))}</li>`;
        }).join('');
        return `<ul class="clin-list">${items}</ul>`;
    }
    if (typeof val === 'object') {
        // Flat key-value dict (e.g. vitals)
        const rows = Object.entries(val).map(([k, v]) => `
      <tr>
        <td class="cell-key">${escHtml(k)}</td>
        <td class="cell-val">${escHtml(String(v ?? ''))}</td>
      </tr>`).join('');
        return `<table class="clin-obj-table"><tbody>${rows}</tbody></table>`;
    }
    return escHtml(String(val));
}

function switchClinTab(tab) {
    ['cards', 'json'].forEach(t => {
        const titleCase = t.charAt(0).toUpperCase() + t.slice(1);
        const tabEl = $(`clinTab${titleCase}`);
        const contEl = $(`clinTab${titleCase}Content`);
        if (tabEl) tabEl.classList.toggle('active', t === tab);
        if (contEl) contEl.style.display = t === tab ? 'flex' : 'none';
    });
}

function setClinicalLoading(loading) {
    const btn = $('clinicalExtractBtn');
    btn.disabled = loading;
    $('clinExtractSpinner').style.display = loading ? 'flex' : 'none';
    $('clinExtractContent').style.display = loading ? 'none' : 'flex';
}

function showClinicalError(msg) {
    $('clinEmptyState').style.display = 'none';
    $('clinErrorState').style.display = 'flex';
    $('clinErrorMsg').textContent = msg;
    $('clinResultsTabs').style.display = 'none';
    $('clinTabCardsContent').style.display = 'none';
    $('clinTabJsonContent').style.display = 'none';
}

// ═══════════════════════════════════════════════════════════════════════════════
// SHARED UTILITIES
// ═══════════════════════════════════════════════════════════════════════════════

function toggleSecret(inputId, openId, closedId) {
    const input = $(inputId);
    const isText = input.type === 'text';
    input.type = isText ? 'password' : 'text';
    $(openId).style.display = isText ? 'block' : 'none';
    $(closedId).style.display = isText ? 'none' : 'block';
}

function setStatus(type, text) {
    const dot = document.querySelector('#statusIndicator .status-dot');
    const span = document.querySelector('#statusIndicator .status-text');
    dot.className = `status-dot ${type === 'loading' ? 'loading' : type === 'error' ? 'error' : ''}`;
    span.textContent = text;
}

function showToast(msg, type = 'info') {
    const container = $('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = msg;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('visible'));
    setTimeout(() => {
        toast.classList.remove('visible');
        setTimeout(() => toast.remove(), 400);
    }, 3200);
}

function escHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Generic event register to prevent null reference errors on missing DOM nodes
 */
function registerEvent(id, eventType, callback) {
    const el = document.getElementById(id);
    if (el) {
        el.addEventListener(eventType, callback);
    } else {
        console.warn(`[Systematic Debugging] Element #${id} not found for event ${eventType}`);
    }
}

/**
 * Robust API Client with built-in systematic error tracking and generic error parsing
 */
async function apiClient(endpoint, payload) {
    console.log(`[API Request] -> ${endpoint}`, { provider: payload.provider, model: payload.model_id });
    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json().catch(() => null);

        if (!response.ok) {
            const errorMsg = data?.detail || `HTTP Error ${response.status}`;
            console.error(`[API Error] <- ${endpoint}:`, errorMsg);
            throw new Error(errorMsg);
        }

        console.log(`[API Success] <- ${endpoint}`, data);
        return data;
    } catch (err) {
        console.error(`[API Network/Timeout Error] -> ${endpoint}:`, err);
        throw err;
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// STRUCTURED SCHEMA MODE
// ═══════════════════════════════════════════════════════════════════════════════

function initStructuredMode() {
    registerEvent('structAddFieldBtn', 'click', () => {
        state.schemaFields.push({
            id: Date.now(),
            name: '',
            type: 'string',
            description: ''
        });
        renderSchemaFields();
    });

    registerEvent('structExtractBtn', 'click', runStructuredExtraction);

    // Initial render
    renderSchemaFields();

    // Model selection sync
    registerEvent('structModelSelect', 'change', (e) => {
        state.structModel = e.target.value;
    });

    // Sync initial value if element exists
    const mSelect = $('structModelSelect');
    if (mSelect) {
        mSelect.value = state.structModel;
    }
}

function renderSchemaFields() {
    const container = $('structFieldsContainer');
    if (!container) return;

    container.innerHTML = '';

    state.schemaFields.forEach((field, index) => {
        const fieldRow = document.createElement('div');
        fieldRow.className = 'schema-field-row card-glass';
        fieldRow.style.padding = '12px';
        fieldRow.style.marginBottom = '12px';
        fieldRow.style.borderRadius = '8px';

        fieldRow.innerHTML = `
            <div style="display: flex; gap: 10px; margin-bottom: 8px;">
                <input type="text" placeholder="Field Name (e.g. age)" value="${field.name}" 
                       class="schema-input field-name" data-id="${field.id}" style="flex: 1;">
                <select class="schema-select field-type" data-id="${field.id}">
                    <option value="string" ${field.type === 'string' ? 'selected' : ''}>String</option>
                    <option value="number" ${field.type === 'number' ? 'selected' : ''}>Number</option>
                    <option value="boolean" ${field.type === 'boolean' ? 'selected' : ''}>Boolean</option>
                    <option value="array" ${field.type === 'array' ? 'selected' : ''}>Array</option>
                    <option value="object" ${field.type === 'object' ? 'selected' : ''}>Object</option>
                </select>
                <button class="remove-field-btn" data-id="${field.id}" style="background: none; border: none; cursor: pointer; color: var(--text-dim); font-size: 1.2rem;">&times;</button>
            </div>
            <textarea placeholder="Description / Advice (e.g. Extract the age as a number)" 
                      class="schema-input field-desc" data-id="${field.id}" style="width: 100%; min-height: 40px; margin-top: 5px;">${field.description}</textarea>
        `;

        container.appendChild(fieldRow);
    });

    // Update count
    const countEl = $('structFieldCount');
    if (countEl) countEl.textContent = state.schemaFields.length;

    // Attach listeners
    container.querySelectorAll('.field-name').forEach(input => {
        input.addEventListener('input', (e) => {
            updateField(e.target.dataset.id, { name: e.target.value });
        });
    });

    container.querySelectorAll('.field-type').forEach(select => {
        select.addEventListener('change', (e) => {
            updateField(e.target.dataset.id, { type: e.target.value });
        });
    });

    container.querySelectorAll('.field-desc').forEach(textarea => {
        textarea.addEventListener('input', (e) => {
            updateField(e.target.dataset.id, { description: e.target.value });
        });
    });

    container.querySelectorAll('.remove-field-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = parseInt(e.target.dataset.id);
            state.schemaFields = state.schemaFields.filter(f => f.id !== id);
            renderSchemaFields();
        });
    });
    initStructuredBatchUpload();
}

function initStructuredBatchUpload() {
    registerEvent('structInputModeSingleBtn', 'click', () => {
        state.structuredBatchMode = false;
        $('structInputModeSingleBtn')?.classList.add('active');
        $('structInputModeBatchBtn')?.classList.remove('active');
        const sv = $('structSingleInputView'); if (sv) sv.style.display = 'flex';
        const bv = $('structBatchInputView'); if (bv) bv.style.display = 'none';
        const btn = $('structExtractBtnContent');
        if (btn) btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3" /></svg> Extract Structured JSON';
    });

    registerEvent('structInputModeBatchBtn', 'click', () => {
        state.structuredBatchMode = true;
        $('structInputModeBatchBtn')?.classList.add('active');
        $('structInputModeSingleBtn')?.classList.remove('active');
        const bv = $('structBatchInputView'); if (bv) bv.style.display = 'flex';
        const sv = $('structSingleInputView'); if (sv) sv.style.display = 'none';
        const btn = $('structExtractBtnContent');
        if (btn) btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3" /></svg> Extract Batch JSON';
    });

    const dropZone = $('structBatchDropZone');
    const fileInput = $('structBatchFileInput');
    if (!dropZone || !fileInput) return;

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, e => e.preventDefault(), false);
    });
    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => dropZone.classList.add('drag-over'), false);
    });
    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => dropZone.classList.remove('drag-over'), false);
    });

    dropZone.addEventListener('drop', (e) => handleStructBatchFiles(e.dataTransfer.files), false);
    fileInput.addEventListener('change', function () { handleStructBatchFiles(this.files); });

    registerEvent('structBatchClearBtn', 'click', () => {
        state.structuredBatchFiles = [];
        renderStructBatchFiles();
    });
}

async function handleStructBatchFiles(files) {
    if (!files || files.length === 0) return;
    showToast('Parsing ' + files.length + ' file(s)...', 'info');

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
            const formData = new FormData();
            formData.append('file', file);
            const response = await fetch('/api/parse-file', { method: 'POST', body: formData });
            if (!response.ok) throw new Error('File parse failed');
            const data = await response.json();

            state.structuredBatchFiles.push({
                id: 'bf_' + Date.now() + '_' + i,
                name: file.name,
                size: file.size,
                text: data.text
            });
        } catch (err) {
            console.error('Error parsing file:', file.name, err);
            showToast('Failed to parse ' + file.name, 'error');
        }
    }
    renderStructBatchFiles();
    showToast('Files loaded successfully.', 'success');
}

function renderStructBatchFiles() {
    const list = $('structBatchFileList');
    const container = $('structBatchListContainer');
    const stats = $('structBatchStats');
    const countSpan = $('structBatchCount');
    if (!list) return;

    if (state.structuredBatchFiles.length === 0) {
        list.innerHTML = '';
        container.style.display = 'none';
        stats.style.display = 'none';
        return;
    }

    container.style.display = 'block';
    stats.style.display = 'flex';
    countSpan.textContent = state.structuredBatchFiles.length;

    list.innerHTML = state.structuredBatchFiles.map(f => `
        <tr>
            <td style="padding: 8px 12px; font-size: 0.85rem; border-bottom: 1px solid var(--border-color);">${escapeHtml(f.name)}</td>
            <td style="padding: 8px 12px; text-align: right; font-size: 0.8rem; border-bottom: 1px solid var(--border-color); color: var(--text-secondary);">${(f.size / 1024).toFixed(1)} KB</td>
            <td style="padding: 8px 12px; text-align: center; border-bottom: 1px solid var(--border-color);">
                <button class="btn-icon struct-batch-del" data-id="${f.id}" title="Remove file" style="padding:2px;">✕</button>
            </td>
        </tr>
    `).join('');

    list.querySelectorAll('.struct-batch-del').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.dataset.id;
            state.structuredBatchFiles = state.structuredBatchFiles.filter(f => f.id !== id);
            renderStructBatchFiles();
        });
    });
}

function updateField(id, updates) {
    const index = state.schemaFields.findIndex(f => f.id === parseInt(id));
    if (index !== -1) {
        state.schemaFields[index] = { ...state.schemaFields[index], ...updates };
    }
}

async function runStructuredBatchExtraction() {
    if (state.structuredBatchFiles.length === 0) {
        showToast('Please add at least one file to process', 'error');
        return;
    }

    const btn = $('structExtractBtn');
    const spinner = $('structExtractSpinner');
    const btnContent = btn?.querySelector('.extract-btn-content');
    const output = $('structJsonOutput');

    setStatus('loading', 'Processing batch extraction...');
    if (btn) btn.disabled = true;
    if (spinner) spinner.style.display = 'inline-flex';
    if (btnContent) btnContent.style.display = 'none';
    if (output) output.style.display = 'none';

    try {
        const apiKey = getActiveKey();
        if (!apiKey) throw new Error('Please enter your ' + state.provider.toUpperCase() + ' API key in the config panel.');

        const payload = {
            items: state.structuredBatchFiles.map(f => ({ id: f.id, text: f.text })),
            prompt: 'Extract data',
            extraction_schema: state.schemaFields,
            model_id: state.structModel,
            api_key: apiKey,
            provider: state.provider
        };

        const result = await apiClient('/api/extract-batch', payload);

        const combinedResults = [];
        result.results.forEach(res => {
            const originalFile = state.structuredBatchFiles.find(f => f.id === res.id);
            if (res.success && res.data) {
                const items = Array.isArray(res.data) ? res.data : [res.data];
                items.forEach(item => {
                    combinedResults.push({
                        _source_file: originalFile ? originalFile.name : 'Unknown',
                        ...item
                    });
                });
            } else {
                combinedResults.push({
                    _source_file: originalFile ? originalFile.name : 'Unknown',
                    _error: res.error || 'Parsing failed'
                });
            }
        });

        _lastStructuredResult = combinedResults;

        if (output) {
            output.textContent = JSON.stringify(combinedResults, null, 2);
            output.style.display = 'block';
        }

        setStatus('success', 'Batch extraction complete');
        showToast('Processed ' + result.results.length + ' files', 'success');

        if (typeof saveToHistory === 'function') {
            saveToHistory({
                mode: 'structured',
                provider: state.provider,
                model: state.structModel,
                inputSnippet: `Batch: ${state.structuredBatchFiles.length} files`,
                promptText: `Schema Fields: ${state.schemaFields.length}`,
                rawResult: JSON.stringify(combinedResults, null, 2),
                timestamp: new Date().toISOString()
            });
        }

    } catch (error) {
        setStatus('error', error.message);
        showToast(error.message, 'error');
    } finally {
        setStatus('success', 'Ready');
        if (btn) btn.disabled = false;
        if (spinner) spinner.style.display = 'none';
        if (btnContent) btnContent.style.display = 'inline-flex';
    }
}

async function runStructuredExtraction() {
    if (state.schemaFields.length === 0) {
        showToast('Please add at least one schema field', 'error');
        return;
    }

    const allowedTypes = new Set(['string', 'number', 'boolean', 'array', 'object']);
    const hasEmptyName = state.schemaFields.some(f => !String(f.name || '').trim());
    if (hasEmptyName) {
        showToast('All schema fields need a name', 'error');
        return;
    }
    state.schemaFields = state.schemaFields.map(f => ({
        ...f,
        type: allowedTypes.has(f.type) ? f.type : 'string'
    }));

    if (state.structuredBatchMode) {
        return runStructuredBatchExtraction();
    }

    const text = $('structInputText')?.value?.trim() ?? '';
    if (!text) {
        showToast('Please provide input text', 'error');
        return;
    }

    const btn = $('structExtractBtn');
    const spinner = $('structExtractSpinner');
    const btnContent = btn?.querySelector('.extract-btn-content');
    const output = $('structJsonOutput');

    setStatus('loading', 'Extracting structured data...');
    if (btn) btn.disabled = true;
    if (spinner) spinner.style.display = 'inline-flex';
    if (btnContent) btnContent.style.display = 'none';
    if (output) output.style.display = 'none';

    try {
        const apiKey = getActiveKey();
        if (!apiKey) throw new Error(`Please enter your ${state.provider.toUpperCase()} API key in the config panel.`);

        const payload = {
            text: text,
            extraction_schema: state.schemaFields,
            model_id: state.structModel,
            api_key: apiKey,
            provider: state.provider,
        };

        const result = await apiClient('/api/extract-structured', payload);

        _lastStructuredResult = result.data;

        if (output) {
            output.textContent = JSON.stringify(result.data, null, 2);
            output.style.display = 'block';
        }

        setStatus('success', 'Structured extraction complete');
        showToast('Structured extraction complete', 'success');

        if (typeof saveToHistory === 'function') {
            saveToHistory({
                mode: 'structured',
                provider: state.provider,
                model: state.structModel,
                inputSnippet: text.substring(0, 100),
                promptText: `Schema Fields: ${state.schemaFields.length}`,
                rawResult: JSON.stringify(result.data, null, 2),
                timestamp: new Date().toISOString()
            });
        }

    } catch (error) {
        setStatus('error', error.message);
        showToast(error.message, 'error');
    } finally {
        setStatus('success', 'Ready');
        if (btn) btn.disabled = false;
        if (spinner) spinner.style.display = 'none';
        if (btnContent) btnContent.style.display = 'inline-flex';
    }
}

// ─── Shared Helpers ──────────────────────────────────────────────────────────

function registerClick(id, fn) {
    const el = $(id);
    if (el) el.addEventListener('click', fn);
}

// ═══════════════════════════════════════════════════════════════════════════
//  HISTORY MODULE
//  Saves every extraction run to localStorage (max 50 items).
//  Allows replay by restoring inputs and results.
// ═══════════════════════════════════════════════════════════════════════════

const HISTORY_KEY = 'lx_history_v1';
const HISTORY_MAX = 50;

function historyLoad() {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); }
    catch { return []; }
}

function historySave(items) {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, HISTORY_MAX)));
}

function historyAdd(entry) {
    const items = historyLoad();
    items.unshift({ ...entry, id: Date.now(), ts: new Date().toISOString() });
    historySave(items);
}

function historyRender() {
    const list = document.getElementById('historyList');
    if (!list) return;
    const items = historyLoad();
    if (!items.length) {
        list.innerHTML = '<p class="history-empty">No extractions saved yet.</p>';
        return;
    }
    list.innerHTML = items.map(item => `
        <div class="history-item" data-id="${item.id}">
            <div class="history-item-content">
                <div class="history-item-title">${escapeHtml(item.title || 'Extraction')}</div>
                <div class="history-item-meta">
                    <span>${timeSince(item.ts)}</span>
                    <span>${item.provider || 'gemini'} · ${item.model || ''}</span>
                </div>
            </div>
            <div style="display:flex;align-items:center;gap:6px;">
                <span class="history-item-badge">${item.mode || 'standard'}</span>
                <button class="history-item-delete" data-del="${item.id}" title="Delete">✕</button>
            </div>
        </div>
    `).join('');

    list.querySelectorAll('.history-item').forEach(el => {
        el.addEventListener('click', (e) => {
            if (e.target.closest('.history-item-delete')) return;
            const id = Number(el.dataset.id);
            historyReplay(items.find(i => i.id === id));
        });
    });
    list.querySelectorAll('.history-item-delete').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = Number(btn.dataset.del);
            historySave(historyLoad().filter(i => i.id !== id));
            historyRender();
        });
    });
}

function historyReplay(item) {
    if (!item) return;
    historyModalClose();

    if (item.mode === 'clinical') {
        // Switch to clinical mode and restore note
        const clinBtn = document.getElementById('modeClinical');
        if (clinBtn) clinBtn.click();
        setTimeout(() => {
            const ta = document.getElementById('clinicalNoteText');
            if (ta) ta.value = item.inputText || '';
        }, 100);
    } else if (item.mode === 'structured') {
        const structBtn = document.getElementById('modeStructured');
        if (structBtn) structBtn.click();
        setTimeout(() => {
            const ta = document.getElementById('structInputText');
            if (ta) ta.value = item.inputText || '';
        }, 100);
    } else {
        // standard
        const stdBtn = document.getElementById('modeStandard');
        if (stdBtn) stdBtn.click();
        setTimeout(() => {
            const ta = document.getElementById('inputText');
            if (ta) ta.value = item.inputText || '';
            const promptEl = document.getElementById('promptDescription');
            if (promptEl && item.prompt) promptEl.value = item.prompt;
        }, 100);
    }
    showToast('Loaded from history — edit and re-run as needed', 'info');
}

function historyModalOpen() {
    historyRender();
    const modal = document.getElementById('historyModal');
    if (modal) modal.classList.add('open');
}

function historyModalClose() {
    const modal = document.getElementById('historyModal');
    if (modal) modal.classList.remove('open');
}

function initHistory() {
    document.getElementById('closeHistoryBtn')?.addEventListener('click', historyModalClose);
    document.getElementById('clearHistoryBtn')?.addEventListener('click', () => {
        if (!confirm('Clear all extraction history?')) return;
        historySave([]);
        historyRender();
        showToast('History cleared', 'info');
    });
    document.getElementById('historyModal')?.addEventListener('click', (e) => {
        if (e.target === document.getElementById('historyModal')) historyModalClose();
    });
    // Wire up all "open history" buttons across modes
    document.querySelectorAll('#openHistoryBtn, #openHistoryBtnStd').forEach(btn => {
        btn?.addEventListener('click', historyModalOpen);
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') historyModalClose();
    });
}

// ═══════════════════════════════════════════════════════════════════════════
//  CLINICAL FILE UPLOAD MODULE
// ═══════════════════════════════════════════════════════════════════════════

function initClinicalFileUpload() {
    const dropZone = document.getElementById('clinFileDropZone');
    const fileInput = document.getElementById('clinFileInput');
    const nameTag = document.getElementById('clinFileName');
    const textarea = document.getElementById('clinicalNoteText');
    if (!dropZone || !fileInput || !textarea) return;

    async function uploadFile(file) {
        if (!file) return;
        const allowed = ['.txt', '.pdf', '.docx'];
        const ext = '.' + (file.name.split('.').pop() || '').toLowerCase();
        if (!allowed.includes(ext)) {
            showToast(`Unsupported file type: ${ext}. Use .txt, .pdf, or .docx`, 'error');
            return;
        }
        if (nameTag) nameTag.textContent = `�� ${file.name}`;
        showToast(`Parsing ${file.name}…`, 'info');

        const formData = new FormData();
        formData.append('file', file);
        try {
            const resp = await fetch('/api/parse-file', { method: 'POST', body: formData });
            if (!resp.ok) {
                const err = await resp.json();
                throw new Error(err.detail || 'Failed to parse file');
            }
            const data = await resp.json();
            textarea.value = data.text;
            textarea.dispatchEvent(new Event('input'));
            if (data.pages) showToast(`Imported ${data.pages}-page PDF`, 'success');
            else showToast(`Imported ${file.name}`, 'success');
        } catch (e) {
            showToast(e.message, 'error');
            if (nameTag) nameTag.textContent = '';
        }
    }

    fileInput.addEventListener('change', () => uploadFile(fileInput.files[0]));
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        uploadFile(e.dataTransfer.files[0]);
    });
}

// ═══════════════════════════════════════════════════════════════════════════
//  CSV EXPORT MODULE (Schema Mode)
// ═══════════════════════════════════════════════════════════════════════════

let _lastStructuredResult = null;   // cached for CSV export

function initCsvExport() {
    const btn = document.getElementById('structCsvBtn');
    if (!btn) return;
    btn.addEventListener('click', async () => {
        if (!_lastStructuredResult) return;
        // Wrap as array if single object
        const rows = Array.isArray(_lastStructuredResult)
            ? _lastStructuredResult
            : [_lastStructuredResult];
        try {
            const resp = await fetch('/api/export-csv', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rows, filename: 'langextract_schema' })
            });
            if (!resp.ok) throw new Error('CSV export failed');
            const blob = await resp.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'langextract_schema.csv';
            document.body.appendChild(a);
            a.click();
            setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
            showToast('CSV downloaded', 'success');
        } catch (e) {
            showToast(e.message, 'error');
        }
    });
}

// ═══════════════════════════════════════════════════════════════════════════
//  SCHEMA TEMPLATES MODULE
// ═══════════════════════════════════════════════════════════════════════════

const SCHEMA_TEMPLATES = {
    '': [],
    invoice: [
        { name: 'invoice_number', type: 'string', description: 'Invoice ID or number' },
        { name: 'vendor', type: 'string', description: 'Vendor or supplier name' },
        { name: 'date', type: 'string', description: 'Invoice date' },
        { name: 'due_date', type: 'string', description: 'Payment due date' },
        { name: 'total_amount', type: 'number', description: 'Total invoice amount' },
        { name: 'currency', type: 'string', description: 'Currency code (e.g. USD)' },
        { name: 'line_items', type: 'array', description: 'List of line items with description and amount' },
    ],
    resume: [
        { name: 'full_name', type: 'string', description: 'Candidate full name' },
        { name: 'email', type: 'string', description: 'Contact email address' },
        { name: 'phone', type: 'string', description: 'Phone number' },
        { name: 'skills', type: 'array', description: 'List of technical or professional skills' },
        { name: 'work_experience', type: 'array', description: 'List of job roles with company, title, dates' },
        { name: 'education', type: 'array', description: 'Degrees, institutions, years' },
        { name: 'summary', type: 'string', description: 'Professional summary or objective' },
    ],
    contract: [
        { name: 'parties', type: 'array', description: 'Parties involved in the contract' },
        { name: 'effective_date', type: 'string', description: 'Contract effective date' },
        { name: 'expiration_date', type: 'string', description: 'Contract expiration/end date' },
        { name: 'governing_law', type: 'string', description: 'Governing law / jurisdiction' },
        { name: 'payment_terms', type: 'string', description: 'Payment obligations and terms' },
        { name: 'obligations', type: 'array', description: 'Key obligations of each party' },
        { name: 'termination_clause', type: 'string', description: 'Conditions for termination' },
    ],
    medical: [
        { name: 'patient_name', type: 'string', description: 'Patient full name' },
        { name: 'dob', type: 'string', description: 'Patient date of birth' },
        { name: 'diagnosis', type: 'array', description: 'List of diagnoses' },
        { name: 'medications', type: 'array', description: 'Current medications with dosages' },
        { name: 'allergies', type: 'array', description: 'Known allergies' },
        { name: 'vital_signs', type: 'object', description: 'Vital signs (BP, HR, temp, etc.)' },
        { name: 'attending_physician', type: 'string', description: 'Name of attending physician' },
    ],
    research: [
        { name: 'title', type: 'string', description: 'Paper title' },
        { name: 'authors', type: 'array', description: 'List of authors' },
        { name: 'abstract', type: 'string', description: 'Abstract text' },
        { name: 'keywords', type: 'array', description: 'Keywords/topics' },
        { name: 'methodology', type: 'string', description: 'Research methodology' },
        { name: 'findings', type: 'string', description: 'Key findings or results' },
        { name: 'doi', type: 'string', description: 'DOI identifier' },
        { name: 'publication_date', type: 'string', description: 'Publication date' },
    ],
    product: [
        { name: 'product_name', type: 'string', description: 'Product name' },
        { name: 'sku', type: 'string', description: 'SKU or product ID' },
        { name: 'price', type: 'number', description: 'Price (numeric)' },
        { name: 'currency', type: 'string', description: 'Currency code' },
        { name: 'category', type: 'string', description: 'Product category' },
        { name: 'description', type: 'string', description: 'Product description' },
        { name: 'in_stock', type: 'boolean', description: 'Whether item is in stock' },
        { name: 'rating', type: 'number', description: 'Average rating (0-5)' },
    ],
};

function injectSchemaTemplatePicker() {
    // Find the schema field list header and inject template picker just above it
    const schemaSection = document.querySelector('.structured-main .panel-config .panel-body');
    if (!schemaSection) return;
    const existing = document.getElementById('schemaTemplatePicker');
    if (existing) return;

    const row = document.createElement('div');
    row.className = 'schema-template-row';
    row.innerHTML = `
        <label class="schema-template-label" for="schemaTemplatePicker">Template:</label>
        <select class="schema-template-select" id="schemaTemplatePicker" aria-label="Schema template">
            <option value="">— blank —</option>
            <option value="invoice">📄 Invoice</option>
            <option value="resume">👤 Resume</option>
            <option value="contract">📝 Contract</option>
            <option value="medical">🏥 Medical Record</option>
            <option value="research">🔬 Research Paper</option>
            <option value="product">📦 Product</option>
        </select>
    `;
    // Insert before the first config-section or at top of panel body
    const firstSection = schemaSection.querySelector('.config-section');
    if (firstSection) {
        schemaSection.insertBefore(row, firstSection);
    } else {
        schemaSection.prepend(row);
    }

    document.getElementById('schemaTemplatePicker').addEventListener('change', (e) => {
        const fields = SCHEMA_TEMPLATES[e.target.value];
        if (!fields) return;
        if (state.schemaFields.length > 0 && !confirm('Replace current fields with template?')) return;
        state.schemaFields = fields.map(f => ({ ...f }));
        // Re-render the schema fields table (call existing renderer if available)
        if (typeof renderSchemaFields === 'function') renderSchemaFields();
        showToast(`Loaded ${e.target.value || 'blank'} template`, 'success');
        e.target.value = ''; // reset picker
    });
}

// ═══════════════════════════════════════════════════════════════════════════
//  PROMPT LIBRARY MODULE
// ═══════════════════════════════════════════════════════════════════════════

function promptsSave(items) {
    localStorage.setItem('langextract_prompts', JSON.stringify(items));
    state.prompts = items;
}

function promptsRender() {
    const list = document.getElementById('promptList');
    if (!list) return;
    if (!state.prompts.length) {
        list.innerHTML = '<p class="history-empty">No saved prompts.</p>';
        return;
    }
    list.innerHTML = state.prompts.map(item => `
        <div class="history-item" data-id="${item.id}">
            <div class="history-item-content">
                <div class="history-item-title">${escapeHtml(item.name)}</div>
                <div class="history-item-meta" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:300px;">
                    ${escapeHtml(item.prompt.substring(0, 60))}...
                </div>
            </div>
            <div style="display:flex;align-items:center;gap:6px;">
                ${item.readonly ? '<span class="history-item-badge">Built-in</span>' : ''}
                <button class="btn-secondary btn-sm prompt-item-load" data-id="${item.id}">Load</button>
                ${!item.readonly ? `<button class="history-item-delete prompt-item-del" data-id="${item.id}" title="Delete">✕</button>` : ''}
            </div>
        </div>
    `).join('');

    // Load
    list.querySelectorAll('.prompt-item-load').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const item = state.prompts.find(p => p.id === btn.dataset.id);
            if (item) {
                const ta = document.getElementById('promptDescription');
                if (ta) {
                    ta.value = item.prompt;
                    showToast('Loaded prompt: ' + item.name, 'success');
                    promptModalClose();

                    // Clear the active template chip since we loaded from library
                    document.querySelectorAll('.template-chip').forEach(c => {
                        c.classList.remove('active');
                    });
                    state.currentTemplate = 'custom';
                }
            }
        });
    });

    // Delete
    list.querySelectorAll('.prompt-item-del').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!confirm('Delete this prompt?')) return;
            const newPrompts = state.prompts.filter(p => p.id !== btn.dataset.id);
            promptsSave(newPrompts);
            promptsRender();
        });
    });
}

function promptModalOpen() {
    promptsRender();
    const modal = document.getElementById('promptModal');
    if (modal) modal.classList.add('open');
}
function promptModalClose() {
    const modal = document.getElementById('promptModal');
    if (modal) modal.classList.remove('open');
}

function initPromptLibrary() {
    registerEvent('openPromptLibraryBtn', 'click', promptModalOpen);
    registerEvent('closePromptBtn', 'click', promptModalClose);

    // Close modal if clicked outside
    const modal = document.getElementById('promptModal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) promptModalClose();
        });
    }

    registerEvent('savePromptBtn', 'click', () => {
        const nameInput = document.getElementById('newPromptName');
        const name = nameInput.value.trim();
        const promptText = document.getElementById('promptDescription')?.value.trim();

        if (!name) { showToast('Please enter a name to save.', 'error'); return; }
        if (!promptText) { showToast('Prompt description is empty.', 'error'); return; }

        const newPrompt = {
            id: 'p_' + Date.now(),
            name: name,
            prompt: promptText,
            readonly: false
        };

        promptsSave([newPrompt, ...state.prompts]);
        promptsRender();
        nameInput.value = '';
        showToast('Prompt saved to library!', 'success');
    });

    registerEvent('exportPromptsBtn', 'click', () => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state.prompts, null, 2));
        const a = document.createElement('a');
        a.href = dataStr;
        a.download = 'langextract_prompts_' + new Date().toISOString().slice(0, 10) + '.json';
        a.click();
    });

    const fileInput = document.getElementById('importPromptsFile');
    if (fileInput) {
        registerEvent('importPromptsBtn', 'click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (evt) => {
                try {
                    const imported = JSON.parse(evt.target.result);
                    if (!Array.isArray(imported)) throw new Error('Invalid format');
                    // Merge, avoiding strict duplicates by ID
                    const existingIds = new Set(state.prompts.map(p => p.id));
                    const toAdd = imported.filter(p => !existingIds.has(p.id) && p.name && p.prompt);
                    if (toAdd.length) {
                        promptsSave([...toAdd, ...state.prompts]);
                        promptsRender();
                        showToast('Imported ' + toAdd.length + ' prompts!', 'success');
                    } else {
                        showToast('No new prompts found or invalid file.', 'info');
                    }
                } catch {
                    showToast('Failed to parse JSON file', 'error');
                }
                fileInput.value = '';
            };
            reader.readAsText(file);
        });
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  PATCH: Intercept extraction functions to save to history & track CSV data
// ═══════════════════════════════════════════════════════════════════════════

(function patchExtractionForHistory() {
    // We monkey-patch after the page loads so we get the final versions of fns
    const _origDocLoaded = document.addEventListener.bind(document);
    window.addEventListener('load', () => {
        // Initialize new modules
        initHistory();
        initClinicalFileUpload();
        initCsvExport();
        injectSchemaTemplatePicker();
        initPromptLibrary();

        // Patch structuredExtraction to track last result and show CSV btn
        const origStructBtn = document.getElementById('structExtractBtn');
        if (origStructBtn) {
            origStructBtn.addEventListener('click', () => {
                // After extraction completes, observe output element
                const output = document.getElementById('structJsonOutput');
                if (!output) return;
                const obs = new MutationObserver(() => {
                    if (output.textContent.trim()) {
                        try {
                            _lastStructuredResult = JSON.parse(output.textContent);
                            const csvBtn = document.getElementById('structCsvBtn');
                            if (csvBtn) csvBtn.style.display = 'inline-flex';
                            historyAdd({
                                mode: 'structured',
                                title: `Schema: ${(state.schemaFields[0]?.name || 'extract')}…`,
                                inputText: document.getElementById('structInputText')?.value || '',
                                provider: state.provider,
                                model: state.selectedModel,
                            });
                        } catch { /* ignore parse error */ }
                        obs.disconnect();
                    }
                });
                obs.observe(output, { childList: true, characterData: true, subtree: true });
            }, { capture: true });
        }

        // Patch Copy / history for structured JSON output
        const copyStructBtn = document.getElementById('structCopyJsonBtn');
        if (copyStructBtn) {
            copyStructBtn.addEventListener('click', () => {
                const output = document.getElementById('structJsonOutput');
                if (output) {
                    navigator.clipboard.writeText(output.textContent).then(() => showToast('Copied', 'success'));
                }
            });
        }
    });
})();

// ═══════════════════════════════════════════════════════════════════════════
//  UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function timeSince(iso) {
    const diff = (Date.now() - new Date(iso)) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
}
