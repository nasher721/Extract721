import { state } from '../state.js';
import { $, escHtml, showToast, registerEvent, apiClient, setStatus, updateTextStats } from '../utils.js';
import { SCHEMA_TEMPLATES } from '../constants.js';
import { historyAdd } from '../history.js';

let _lastStructuredResult = null;

export function initStructuredMode() {
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

    // Template selection
    document.querySelectorAll('.schema-template-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            document.querySelectorAll('.schema-template-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            const templateKey = chip.dataset.template;
            const template = SCHEMA_TEMPLATES[templateKey];
            if (template) {
                state.schemaFields = template.map((f, i) => ({ ...f, id: Date.now() + i }));
                renderSchemaFields();
                showToast(`Applied ${templateKey} template`, 'success');
            }
        });
    });

    registerEvent('structInputText', 'input', e => {
        updateTextStats(e.target.value, null, null, null, 'structTokenCount', 'structCostEst', 'structured');
    });

    initStructuredBatchUpload();
    initCsvExport();
}

export function renderSchemaFields() {
    const container = $('structFieldsContainer');
    if (!container) return;

    container.innerHTML = '';

    state.schemaFields.forEach((field) => {
        const fieldRow = document.createElement('div');
        fieldRow.className = 'schema-field-row card-glass';
        fieldRow.style.padding = '12px';
        fieldRow.style.marginBottom = '12px';
        fieldRow.style.borderRadius = '8px';

        fieldRow.innerHTML = `
            <div style="display: flex; gap: 10px; margin-bottom: 8px;">
                <input type="text" placeholder="Field Name (e.g. age)" value="${escHtml(field.name)}" 
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
                       class="schema-input field-desc" data-id="${field.id}" style="width: 100%; min-height: 40px; margin-top: 5px;">${escHtml(field.description)}</textarea>
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
    const field = state.schemaFields.find(f => f.id === parseInt(id));
    if (field) {
        Object.assign(field, updates);
    }
}

export function initStructuredBatchUpload() {
    registerEvent('structInputModeSingleBtn', 'click', () => {
        state.structuredBatchMode = false;
        $('structInputModeSingleBtn')?.classList.add('active');
        $('structInputModeBatchBtn')?.classList.remove('active');
        const sv = $('structSingleInputView'); if (sv) sv.style.display = 'flex';
        const bv = $('structBatchInputView'); if (bv) bv.style.display = 'none';
        const btn = $('structExtractBtnContent');
        if (btn) btn.innerHTML = 'Extract Structured JSON';
    });

    registerEvent('structInputModeBatchBtn', 'click', () => {
        state.structuredBatchMode = true;
        $('structInputModeBatchBtn')?.classList.add('active');
        $('structInputModeSingleBtn')?.classList.remove('active');
        const bv = $('structBatchInputView'); if (bv) bv.style.display = 'flex';
        const sv = $('structSingleInputView'); if (sv) sv.style.display = 'none';
        const btn = $('structExtractBtnContent');
        if (btn) btn.innerHTML = 'Extract Batch JSON';
    });

    const dropZone = $('structBatchDropZone');
    const fileInput = $('structBatchFileInput');
    if (!dropZone || !fileInput) return;

    fileInput.addEventListener('change', () => handleStructBatchFiles(fileInput.files));
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        handleStructBatchFiles(e.dataTransfer.files);
    });

    registerEvent('structBatchClearBtn', 'click', () => {
        state.structuredBatchFiles = [];
        renderStructBatchFiles();
    });
}

async function handleStructBatchFiles(files) {
    if (!files || files.length === 0) return;
    showToast(`Parsing ${files.length} file(s)...`, 'info');

    for (const file of Array.from(files)) {
        try {
            const formData = new FormData();
            formData.append('file', file);
            const resp = await fetch('/api/parse-file', { method: 'POST', body: formData });
            if (!resp.ok) throw new Error('File parse failed');
            const data = await resp.json();

            state.structuredBatchFiles.push({
                id: 'bf_' + Date.now() + Math.random(),
                name: file.name,
                size: file.size,
                text: data.text
            });
        } catch (err) {
            console.error('Error parsing file:', file.name, err);
            showToast(`Failed to parse ${file.name}`, 'error');
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
            <td>${escHtml(f.name)}</td>
            <td style="text-align: right;">${(f.size / 1024).toFixed(1)} KB</td>
            <td style="text-align: center;">
                <button class="btn-icon struct-batch-del" data-id="${f.id}" title="Remove file">✕</button>
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

export async function runStructuredExtraction() {
    if (!state.schemaFields.length) { showToast('Please add at least one schema field', 'error'); return; }

    if (state.structuredBatchMode) {
        return runStructuredBatchExtraction();
    }

    const text = $('structInputText')?.value?.trim();
    if (!text) { showToast('Please enter some text to analyze', 'error'); return; }

    setStructuredLoading(true);
    setStatus('loading', 'Extracting structured data…');

    const apiKey = state.apiKeys[state.provider];
    if (!apiKey) { showToast(`Please enter your ${state.provider.toUpperCase()} API key`, 'error'); return; }

    try {
        const data = await apiClient('/api/extract-structured', {
            text,
            extraction_schema: state.schemaFields,
            model_id: state.structModel,
            api_key: apiKey,
            provider: state.provider
        });

        _lastStructuredResult = data.data;
        displayStructuredResults(_lastStructuredResult);
        setStatus('ready', 'Done');
        showToast('Extraction complete!', 'success');

        historyAdd({
            mode: 'structured',
            title: text.substring(0, 30) + '...',
            inputText: text,
            provider: state.provider,
            model: state.structModel
        });
    } catch (err) {
        showError(err.message);
        setStatus('error', 'Error');
        showToast(err.message, 'error');
    } finally {
        setStructuredLoading(false);
    }
}

async function runStructuredBatchExtraction() {
    if (!state.structuredBatchFiles.length) { showToast('No files to process', 'error'); return; }

    setStructuredLoading(true);
    setStatus('loading', 'Processing batch extraction…');

    const apiKey = state.apiKeys[state.provider];

    try {
        const payload = {
            items: state.structuredBatchFiles.map(f => ({ id: f.id, text: f.text })),
            prompt: 'Extract data',
            extraction_schema: state.schemaFields,
            model_id: state.structModel,
            api_key: apiKey,
            provider: state.provider
        };

        const result = await apiClient('/api/extract-batch', payload);

        const combined = result.results.map(res => {
            const file = state.structuredBatchFiles.find(f => f.id === res.id);
            return {
                _source_file: file ? file.name : 'Unknown',
                ...(res.success ? res.data : { _error: res.error })
            };
        });

        _lastStructuredResult = combined;
        displayStructuredResults(combined);
        setStatus('ready', 'Done');
        showToast(`Processed ${result.results.length} files`, 'success');

    } catch (err) {
        showError(err.message);
        setStatus('error', 'Error');
        showToast(err.message, 'error');
    } finally {
        setStructuredLoading(false);
    }
}

function displayStructuredResults(data) {
    const out = $('structJsonOutput');
    if (!out) return;
    out.style.display = 'block';
    out.textContent = JSON.stringify(data, null, 2);
    $('structEmptyState').style.display = 'none';
    $('structErrorState').style.display = 'none';
}

function setStructuredLoading(loading) {
    const btn = $('structExtractBtn');
    if (!btn) return;
    btn.disabled = loading;
    $('structExtractSpinner').style.display = loading ? 'flex' : 'none';
    $('structExtractBtnContent').style.display = loading ? 'none' : 'flex';
}

function showError(msg) {
    $('structEmptyState').style.display = 'none';
    $('structErrorState').style.display = 'flex';
    $('structErrorMsg').textContent = msg;
    $('structJsonOutput').style.display = 'none';
}

function initCsvExport() {
    registerEvent('exportCsvBtn', async () => {
        if (!_lastStructuredResult) {
            showToast('No data to export. Run extraction first.', 'error');
            return;
        }

        showToast('Generating CSV…', 'info');
        try {
            const data = Array.isArray(_lastStructuredResult) ? _lastStructuredResult : [_lastStructuredResult];
            const resp = await fetch('/api/export-csv', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            if (!resp.ok) throw new Error('Failed to generate CSV');

            const blob = await resp.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `langextract_export_${new Date().getTime()}.csv`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            showToast('CSV Exported!', 'success');
        } catch (e) {
            showToast(e.message, 'error');
        }
    });
}
