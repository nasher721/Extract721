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
    // Schema Builder
    schemaFields: [
        { id: Date.now(), name: 'Patient Name', type: 'string', description: 'Full name of the patient' },
        { id: Date.now() + 1, name: 'Diagnoses', type: 'array', description: 'List of confirmed medical diagnoses' }
    ],
    structModel: 'gemini-2.5-flash'
};

// ─── DOM Shortcuts ────────────────────────────────────────────────────────────

const $ = id => document.getElementById(id);

// ─── Prompt Templates ─────────────────────────────────────────────────────────

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
    btns.forEach(btn => {
        btn.addEventListener('click', () => {
            const mode = btn.dataset.mode;
            if (mode === state.mode) return;
            state.mode = mode;
            btns.forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
            $('appMain').style.display = mode === 'standard' ? 'grid' : 'none';
            $('clinicalMain').style.display = mode === 'clinical' ? 'grid' : 'none';
            $('structuredMain').style.display = mode === 'structured' ? 'grid' : 'none';
        });
    });
}

// ─── Provider / API Key / Model Config ───────────────────────────────────────

function getActiveKey() {
    return state.apiKeys[state.provider] || '';
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
            document.querySelectorAll('.template-chip').forEach(c => c.classList.remove('active'));
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
            document.querySelectorAll('[data-model]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.selectedModel = btn.dataset.model;
            $('modelHint').textContent = state.selectedModel;
            $('customModelId').style.display = state.selectedModel === 'custom' ? 'block' : 'none';
        });
    });

    // API key toggle
    $('toggleApiKey').addEventListener('click', () => toggleSecret('apiKey', 'eyeOpen', 'eyeClosed'));

    // Char counter
    $('inputText').addEventListener('input', e => {
        $('charCount').textContent = e.target.value.length.toLocaleString();
    });

    // Add example
    $('addExampleBtn').addEventListener('click', addExample);

    // Extract
    $('extractBtn').addEventListener('click', runExtraction);

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
    $('copyJsonBtn').addEventListener('click', () => {
        const content = $('jsonOutput').textContent;
        navigator.clipboard.writeText(content).then(() => showToast('JSON copied!', 'success'));
    });

    // Config collapse
    $('collapseConfig').addEventListener('click', toggleConfigCollapse);
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

    const text = $('inputText').value.trim();
    if (!text) { showToast('Please enter some text to analyze', 'error'); return; }

    const modelId = state.selectedModel === 'custom'
        ? ($('customModelId').value.trim() || 'gemini-2.5-flash')
        : state.selectedModel;

    setExtractionLoading(true);
    setStatus('loading', 'Extracting…');

    const payload = {
        text,
        prompt: $('promptDescription').value.trim(),
        examples: state.examples.map(ex => ({
            text: ex.text,
            extractions: ex.extractions.map(ext => ({
                extraction_class: ext.extraction_class,
                extraction_text: ext.extraction_text,
                attributes: ext.attributes,
            })),
        })),
        model_id: state.selectedModel,
        api_key: apiKey,
        provider: state.provider,
    };

    try {
        const res = await fetch('/api/extract', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Extraction failed');

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
    $('toggleClinicalApiKey').addEventListener('click', () => {
        toggleSecret('clinicalApiKey', 'clinEyeOpen', 'clinEyeClosed');
    });

    // Model selection
    document.querySelectorAll('[data-clin-model]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('[data-clin-model]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.clinicalModel = btn.dataset.clinModel;
            $('clinModelHint').textContent = state.clinicalModel;
        });
    });

    // Char counter
    $('clinicalNoteText').addEventListener('input', e => {
        $('clinCharCount').textContent = e.target.value.length.toLocaleString();
    });

    // Extract button
    $('clinicalExtractBtn').addEventListener('click', runClinicalExtraction);

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
    $('clinCopyJsonBtn').addEventListener('click', () => {
        navigator.clipboard.writeText($('clinJsonOutput').textContent)
            .then(() => showToast('JSON copied!', 'success'));
    });

    // Copy Histories
    const clinCopyHistoriesBtn = $('clinCopyHistoriesBtn');
    if (clinCopyHistoriesBtn) {
        clinCopyHistoriesBtn.addEventListener('click', () => {
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
}

async function runClinicalExtraction() {
    const apiKey = getActiveKey();
    if (!apiKey) { showToast(`Please enter your ${state.provider.toUpperCase()} API key`, 'error'); return; }

    const noteText = $('clinicalNoteText').value.trim();
    if (!noteText) { showToast('Please paste an EMR note first', 'error'); return; }

    setClinicalLoading(true);
    setStatus('loading', 'Processing note…');

    try {
        const res = await fetch('/api/clinical-extract-stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                note_text: noteText,
                model_id: state.clinicalModel,
                api_key: apiKey,
                provider: state.provider,
            }),
        });

        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.detail || 'Clinical extraction failed');
        }

        $('clinEmptyState').style.display = 'none';
        $('clinErrorState').style.display = 'none';
        $('clinResultsTabs').style.display = 'flex';
        switchClinTab('cards');

        const cardsEl = $('clinTabCardsContent');
        // Show streaming state
        cardsEl.innerHTML = `
            <div style="padding:20px; text-align:center; color:var(--text-muted); font-size:14px;">
               <div class="spinner" style="display:inline-block; margin-right:10px; width:16px; height:16px;"></div> 
               Streaming response from AI...
            </div>
            <pre id="clinStreamRaw" class="json-output" style="padding:16px; min-height:100px; white-space:pre-wrap; word-break:break-word;"></pre>
        `;
        $('clinJsonOutput').textContent = "Streaming...";

        const reader = res.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let rawOutput = "";
        let streamEl = $('clinStreamRaw');

        let done = false;
        while (!done) {
            const { value, done: readerDone } = await reader.read();
            done = readerDone;
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
                                    // auto-scroll
                                    cardsEl.scrollTop = cardsEl.scrollHeight;
                                }
                            } else if (dataObj.error) {
                                throw new Error(dataObj.error);
                            }
                        } catch (e) {
                            // ignore json parse errors on incomplete chunks
                        }
                    }
                }
            }
        }

        // Clean and parse final output
        let clean = rawOutput.trim();
        clean = clean.replace(/^```(?:json)?\s*/m, '');
        clean = clean.replace(/\s*```$/m, '');
        clean = clean.trim();

        let structured;
        try {
            structured = JSON.parse(clean);
        } catch (e) {
            structured = { raw_text: clean, _parse_error: "Model did not return valid JSON" };
        }

        state.clinStructuredData = structured;
        displayClinicalResults(structured, rawOutput);
        setStatus('ready', 'Done');
        showToast('Streaming complete!', 'success');
    } catch (err) {
        showClinicalError(err.message);
        setStatus('error', 'Error');
        showToast(err.message, 'error');
    } finally {
        setClinicalLoading(false);
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

// ═══════════════════════════════════════════════════════════════════════════════
// STRUCTURED SCHEMA MODE
// ═══════════════════════════════════════════════════════════════════════════════

function initStructuredMode() {
    registerClick('structAddFieldBtn', () => {
        state.schemaFields.push({
            id: Date.now(),
            name: '',
            type: 'string',
            description: ''
        });
        renderSchemaFields();
    });

    registerClick('structExtractBtn', runStructuredExtraction);

    // Initial render
    renderSchemaFields();

    // Model selection sync
    const mSelect = $('structModelSelect');
    if (mSelect) {
        mSelect.value = state.structModel;
        mSelect.addEventListener('change', (e) => {
            state.structModel = e.target.value;
        });
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
}

function updateField(id, updates) {
    const index = state.schemaFields.findIndex(f => f.id === parseInt(id));
    if (index !== -1) {
        state.schemaFields[index] = { ...state.schemaFields[index], ...updates };
    }
}

async function runStructuredExtraction() {
    const text = $('structInputText')?.value.trim() || '';
    if (!text) {
        showToast('Please provide input text', 'error');
        return;
    }

    if (state.schemaFields.length === 0) {
        showToast('Please add at least one field', 'error');
        return;
    }

    const btn = $('structExtractBtn');
    const spinner = btn.querySelector('.spinner');
    const btnText = btn.querySelector('.btn-text');
    const output = $('structJsonOutput');

    setStatus('loading', 'Extracting structured data...');
    btn.disabled = true;
    if (spinner) spinner.style.display = 'inline-block';
    if (btnText) btnText.textContent = 'Extracting...';
    output.style.display = 'none';

    try {
        const apiKey = getActiveKey();
        if (!apiKey) throw new Error(`Please enter your ${state.provider.toUpperCase()} API key in the config panel.`);

        const response = await fetch('/api/extract-structured', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text: text,
                extraction_schema: state.schemaFields,
                model_id: state.structModel,
                api_key: apiKey,
                provider: state.provider,
            })
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || 'Extraction failed');
        }

        const result = await response.json();

        output.textContent = JSON.stringify(result.data, null, 2);
        output.style.display = 'block';
        setStatus('success', 'Structured extraction complete');
        showToast('Structured extraction complete', 'success');

    } catch (error) {
        console.error('Structured Extraction Error:', error);
        setStatus('error', error.message);
        showToast(error.message, 'error');
    } finally {
        setStatus('success', 'Ready');
        btn.disabled = false;
        if (spinner) spinner.style.display = 'none';
        if (btnText) btnText.textContent = 'Run Structured Extraction';
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
