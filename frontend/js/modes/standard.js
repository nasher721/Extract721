import { state } from '../state.js';
import { $, escHtml, showToast, registerEvent, apiClient, updateTextStats, setStatus } from '../utils.js';
import { TEMPLATES } from '../constants.js';
import { historyAdd } from '../history.js';

export function initStandardMode() {
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
        });
    });

    // Char counter
    registerEvent('inputText', 'input', e => {
        updateTextStats(e.target.value, null, 'charCount', null, 'tokenCount', 'estCost', 'standard');
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

export function addExample() {
    state.examples.push({ text: '', extractions: [] });
    renderExamples();
    updateExamplesCount();
}

export function removeExample(idx) {
    state.examples.splice(idx, 1);
    renderExamples();
    updateExamplesCount();
}

export function addExtraction(exIdx) {
    state.examples[exIdx].extractions.push({
        extraction_class: '',
        extraction_text: '',
        attributes: {},
    });
    renderExamples();
}

export function removeExtraction(exIdx, extIdx) {
    state.examples[exIdx].extractions.splice(extIdx, 1);
    renderExamples();
}

export function addAttribute(exIdx, extIdx) {
    const ext = state.examples[exIdx].extractions[extIdx];
    const key = `attr_${Object.keys(ext.attributes).length + 1}`;
    ext.attributes[key] = '';
    renderExamples();
}

export function removeAttribute(exIdx, extIdx, attrKey) {
    delete state.examples[exIdx].extractions[extIdx].attributes[attrKey];
    renderExamples();
}

export function renderExamples() {
    const container = $('examplesContainer');
    if (!container) return;
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

export function updateAttrKey(exIdx, extIdx, oldKey, newKey) {
    const attrs = state.examples[exIdx].extractions[extIdx].attributes;
    if (oldKey === newKey) return;
    const val = attrs[oldKey];
    delete attrs[oldKey];
    attrs[newKey] = val;
}

export function updateAttrVal(exIdx, extIdx, key, val) {
    state.examples[exIdx].extractions[extIdx].attributes[key] = val;
}

export function updateExamplesCount() {
    $('examplesCount').textContent = state.examples.length;
}

export async function runExtraction() {
    const apiKey = state.apiKeys[state.provider];
    if (!apiKey) { showToast(`Please enter your ${state.provider.toUpperCase()} API key`, 'error'); return; }

    const text = $('inputText')?.value?.trim();
    if (!text) { showToast('Please enter some text to analyze', 'error'); return; }

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

        // Add to history
        historyAdd({
            mode: 'standard',
            title: text.substring(0, 30) + '...',
            inputText: text,
            provider: state.provider,
            model: state.selectedModel,
            prompt: payload.prompt
        });
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

    const frame = $('vizFrame');
    frame.srcdoc = data.html || '<p>No visualization available.</p>';
    $('tabVizContent').style.display = 'flex';

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
    if (!btn) return;
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

let configCollapsed = false;
function toggleConfigCollapse() {
    configCollapsed = !configCollapsed;
    const panel = $('configPanel');
    const btn = $('collapseConfig');
    if (!panel) return;
    panel.style.width = configCollapsed ? '48px' : '';
    panel.style.minWidth = configCollapsed ? '48px' : '';
    panel.querySelector('.panel-body').style.display = configCollapsed ? 'none' : '';
    panel.querySelector('.panel-title').style.display = configCollapsed ? 'none' : '';
    btn.textContent = configCollapsed ? '›' : '‹';
}

// Attach to window for HTML onclick handlers
window.removeExample = removeExample;
window.addExtraction = addExtraction;
window.removeExtraction = removeExtraction;
window.addAttribute = addAttribute;
window.removeAttribute = removeAttribute;
window.updateAttrKey = updateAttrKey;
window.updateAttrVal = updateAttrVal;
