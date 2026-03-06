import { state } from '../state.js';
import { $, escHtml, showToast, registerEvent, updateTextStats, setStatus, toggleSecret } from '../utils.js';
import { CLIN_SECTIONS } from '../constants.js';

function getClinSections() {
    return state.clinSections || CLIN_SECTIONS;
}
import { historyAdd } from '../history.js';

export function initClinicalMode() {
    registerEvent('toggleClinicalApiKey', 'click', () => {
        toggleSecret('clinicalApiKey', 'clinEyeOpen', 'clinEyeClosed');
    });

    document.querySelectorAll('[data-clin-model]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('[data-clin-model]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.clinicalModel = btn.dataset.clinModel;
            $('clinModelHint').textContent = state.clinicalModel;
        });
    });

    registerEvent('clinicalNoteText', 'input', e => {
        updateTextStats(e.target.value, 'clinWordCount', 'clinCharCount', 'clinLineCount', 'clinTokenCount', 'clinCostEst', 'clinical');
    });

    registerEvent('clinicalExtractBtn', 'click', runClinicalExtraction);

    document.querySelectorAll('[data-clin-tab]').forEach(tab => {
        tab.addEventListener('click', () => switchClinTab(tab.dataset.clinTab));
    });

    registerEvent('clinCopyJsonBtn', 'click', () => {
        const textContent = $('clinJsonOutput')?.textContent;
        if (textContent) {
            navigator.clipboard.writeText(textContent)
                .then(() => showToast('JSON copied!', 'success'));
        }
    });

    registerEvent('clinCopyRawBtn', 'click', () => {
        const textContent = $('clinRawOutput')?.textContent;
        if (textContent) {
            navigator.clipboard.writeText(textContent)
                .then(() => showToast('Raw output copied!', 'success'));
        }
    });

    registerEvent('clinCopyHistoriesBtn', 'click', copyHistories);
}

let currentStreamController = null;

/** Parse JSON from streamed LLM output, stripping markdown fences if present. */
function parseStreamedJson(raw) {
    if (!raw || !raw.trim()) return null;
    let clean = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    const match = clean.match(/\{[\s\S]*\}/);
    if (match) clean = match[0];
    try {
        return JSON.parse(clean);
    } catch {
        return null;
    }
}

export async function runClinicalExtraction() {
    const apiKey = state.apiKeys[state.provider];
    if (!apiKey) { showToast(`Please enter your ${state.provider.toUpperCase()} API key`, 'error'); return; }

    const noteText = $('clinicalNoteText')?.value?.trim();
    if (!noteText) { showToast('Please paste an EMR note first', 'error'); return; }

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
                note_text: noteText,
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

        $('clinEmptyState').style.display = 'none';
        $('clinErrorState').style.display = 'none';
        $('clinResultsTabs').style.display = 'flex';
        switchClinTab('cards');

        const cardsEl = $('clinTabCardsContent');
        cardsEl.innerHTML = `
            <div style="padding:20px; text-align:center; color:var(--text-muted); font-size:14px;">
               <div class="spinner" style="display:inline-block; margin-right:10px; width:16px; height:16px;"></div> 
               Streaming response from AI...
            </div>
            <pre id="clinStreamRaw" class="json-output" style="padding:16px; min-height:100px; white-space:pre-wrap; word-break:break-word;"></pre>
        `;

        const jsonOut = $('clinJsonOutput');
        jsonOut.textContent = "Streaming...";
        const rawOut = $('clinRawOutput');
        if (rawOut) rawOut.textContent = "Streaming...";

        const reader = res.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let rawOutput = "";
        let streamEl = $('clinStreamRaw');

        try {
            while (true) {
                const { value, done } = await reader.read();
                if (done) break;

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
                                    cardsEl.scrollTop = cardsEl.scrollHeight;
                                }
                            } else if (dataObj.error) {
                                throw new Error(dataObj.error);
                            }
                        } catch (e) {
                            if (e !== SyntaxError && e.message !== "Unexpected end of JSON input") {
                                console.warn("[Stream Parse Debug]", e);
                            }
                        }
                    }
                }
            }
        } finally {
            reader.releaseLock();
        }

        // Final result processing
        try {
            let structured = parseStreamedJson(rawOutput);
            if (!structured) {
                const finalData = await apiClient('/api/clinical-extract', {
                    note_text: noteText,
                    model_id: state.clinicalModel,
                    api_key: apiKey,
                    provider: state.provider
                });
                structured = finalData.structured;
                rawOutput = finalData.raw_llm_output || rawOutput;
            }
            state.clinStructuredData = structured;
            displayClinicalResults(structured, rawOutput);
            setStatus('ready', 'Done');
            showToast('Note processed successfully', 'success');

            historyAdd({
                mode: 'clinical',
                title: noteText.substring(0, 30) + '...',
                inputText: noteText,
                provider: state.provider,
                model: state.clinicalModel
            });

        } catch (e) {
            console.error("Final processing failed", e);
            const parsed = parseStreamedJson(rawOutput);
            if (parsed) {
                state.clinStructuredData = parsed;
                displayClinicalResults(parsed, rawOutput);
            } else {
                showError(e.message);
            }
        }

    } catch (err) {
        if (err.name === 'AbortError') return;
        showError(err.message);
        setStatus('error', 'Error');
        showToast(err.message, 'error');
    } finally {
        setClinicalLoading(false);
    }
}

function displayClinicalResults(data, rawOutput = '') {
    const cardsEl = $('clinTabCardsContent');
    const summaryEl = $('clinSmartSummary');
    if (!cardsEl) return;
    cardsEl.innerHTML = '';

    // 1. Rich Smart Summary
    if (summaryEl) {
        summaryEl.classList.remove('u-hidden');
        summaryEl.classList.add('u-block');

        const diagnosis = data.assessment_impression || data.diagnosis || data.chief_complaint || 'Undetermined';
        const plan = Array.isArray(data.plan) ? data.plan : (data.plan ? [data.plan] : []);
        const meds = Array.isArray(data.current_medications) ? data.current_medications : (data.current_medications ? [data.current_medications] : []);
        const problems = Array.isArray(data.active_problems) ? data.active_problems : (data.active_problems ? [data.active_problems] : []);
        const orders = Array.isArray(data.orders) ? data.orders : (data.orders ? [data.orders] : []);
        const sectionsFound = getClinSections().filter(s => {
            const v = data[s.key];
            return v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0);
        }).length;

        // Build impression text: if it's long use the first sentence only for the badge
        const impressionText = typeof diagnosis === 'string' ? diagnosis : JSON.stringify(diagnosis);
        const impressionShort = impressionText.length > 120 ? impressionText.substring(0, 120) + '…' : impressionText;

        summaryEl.innerHTML = `
            <div class="summary-headline">
                <span>🧠</span> Smart Case Summary
            </div>
            <div class="summary-impression">
                <span class="summary-impression-label">Assessment / Impression</span>
                <span class="summary-impression-value">${escHtml(impressionShort)}</span>
            </div>
            <div class="summary-stats">
                <div class="stat-item">
                    <div class="stat-value">${sectionsFound}</div>
                    <div class="stat-label">Sections Extracted</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${plan.length || '—'}</div>
                    <div class="stat-label">Plan Items</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${meds.length || (data.current_medications ? '✓' : '—')}</div>
                    <div class="stat-label">Medications</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${problems.length || (data.active_problems ? '✓' : '—')}</div>
                    <div class="stat-label">Active Problems</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${data.vitals ? '✓' : '—'}</div>
                    <div class="stat-label">Vitals</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${orders.length || (data.orders ? '✓' : '—')}</div>
                    <div class="stat-label">New Orders</div>
                </div>
            </div>
        `;
    }

    // 2. Render section cards
    getClinSections().forEach(sec => {
        const val = data[sec.key];
        if (val === null || val === undefined || val === '' || (Array.isArray(val) && val.length === 0)) return;

        const card = document.createElement('div');
        card.className = 'clin-card';
        card.dataset.section = sec.section;

        const contentHtml = renderClinValue(val);

        card.innerHTML = `
            <div class="clin-card-header" role="button" tabindex="0" aria-expanded="true">
                <span class="clin-card-icon">${sec.icon}</span>
                <span class="clin-card-title">${sec.label}</span>
                <button class="btn-icon btn-copy-card" title="Copy ${escHtml(sec.label)}" aria-label="Copy ${escHtml(sec.label)}">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                </button>
                <span class="clin-card-toggle" aria-hidden="true">▾</span>
            </div>
            <div class="clin-card-body">${contentHtml}</div>
        `;

        const header = card.querySelector('.clin-card-header');
        header.addEventListener('click', (e) => {
            if (e.target.closest('.btn-copy-card')) return;
            const collapsed = card.classList.toggle('collapsed');
            header.setAttribute('aria-expanded', String(!collapsed));
        });
        header.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); header.click(); }
        });

        const copyBtn = card.querySelector('.btn-copy-card');
        copyBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const textToCopy = typeof val === 'string' ? val
                : Array.isArray(val) ? val.map(item => typeof item === 'string' ? item : JSON.stringify(item)).join('\n')
                : JSON.stringify(val, null, 2);
            navigator.clipboard.writeText(textToCopy)
                .then(() => showToast(`${sec.label} copied!`, 'success'));
        });

        cardsEl.appendChild(card);
    });

    // JSON tab — syntax-highlighted
    const jsonEl = $('clinJsonOutput');
    if (jsonEl) jsonEl.innerHTML = syntaxHighlightJson(data);

    // Raw tab
    const rawEl = $('clinRawOutput');
    if (rawEl) rawEl.textContent = rawOutput || JSON.stringify(data, null, 2);
}

/** Render a clinical field value using appropriate rich markup. */
function renderClinValue(val) {
    if (typeof val === 'string') {
        return `<span class="clin-value-string">${escHtml(val)}</span>`;
    }
    if (Array.isArray(val)) {
        if (val.length === 0) return '<span class="clin-value-null">None recorded</span>';
        // Array of objects → subitem cards
        if (val.some(item => typeof item === 'object' && item !== null)) {
            return val.map(item =>
                typeof item === 'object' && item !== null
                    ? renderClinSubitem(item)
                    : `<div class="clin-subitem"><div class="clin-subitem-row"><span class="clin-subitem-val">${escHtml(String(item))}</span></div></div>`
            ).join('');
        }
        // Simple string array → styled list
        return `<ul class="clin-list">${val.map(item =>
            `<li class="clin-list-item">${escHtml(typeof item === 'string' ? item : JSON.stringify(item))}</li>`
        ).join('')}</ul>`;
    }
    if (typeof val === 'object' && val !== null) {
        return renderClinObject(val);
    }
    return `<span class="clin-value-string">${escHtml(String(val))}</span>`;
}

/** Render an object as a subitem block (used for items in object arrays). */
function renderClinSubitem(obj) {
    const rows = Object.entries(obj)
        .filter(([, v]) => v !== null && v !== undefined && v !== '')
        .map(([k, v]) => `
            <div class="clin-subitem-row">
                <span class="clin-subitem-key">${escHtml(formatClinKey(k))}</span>
                <span class="clin-subitem-val">${escHtml(typeof v === 'string' ? v : JSON.stringify(v))}</span>
            </div>`).join('');
    return `<div class="clin-subitem">${rows}</div>`;
}

/** Render a plain object as a key-value table (used for vitals, nested objects). */
function renderClinObject(obj) {
    const rows = Object.entries(obj)
        .filter(([, v]) => v !== null && v !== undefined && v !== '')
        .map(([k, v]) => `
            <tr>
                <td class="cell-key">${escHtml(formatClinKey(k))}</td>
                <td class="cell-val">${escHtml(typeof v === 'string' ? v : JSON.stringify(v))}</td>
            </tr>`).join('');
    return `<table class="clin-obj-table"><tbody>${rows}</tbody></table>`;
}

/** Convert snake_case / camelCase key to a Title Case display label. */
function formatClinKey(k) {
    return k.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/\b\w/g, c => c.toUpperCase());
}

/** Return syntax-highlighted HTML for a JSON object. */
function syntaxHighlightJson(data) {
    const json = JSON.stringify(data, null, 2)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return json.replace(
        /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
        match => {
            let cls = 'json-num';
            if (/^"/.test(match)) {
                cls = /:$/.test(match) ? 'json-key' : 'json-str';
            } else if (/true|false/.test(match)) {
                cls = 'json-bool';
            } else if (/null/.test(match)) {
                cls = 'json-null';
            }
            return `<span class="${cls}">${match}</span>`;
        }
    );
}

function switchClinTab(tab) {
    // cards → flex column; json/raw → flex column (toolbar + pre)
    const displayMode = { cards: 'flex', json: 'flex', raw: 'flex' };
    ['cards', 'json', 'raw'].forEach(t => {
        const capT = t.charAt(0).toUpperCase() + t.slice(1);
        $(`clinTab${capT}`).classList.toggle('active', t === tab);
        $(`clinTab${capT}Content`).style.display = t === tab ? displayMode[t] : 'none';
    });
}

function setClinicalLoading(loading) {
    const btn = $('clinicalExtractBtn');
    if (!btn) return;
    btn.disabled = loading;
    $('clinExtractSpinner').style.display = loading ? 'flex' : 'none';
    $('clinExtractContent').style.display = loading ? 'none' : 'flex';
}

function showError(msg) {
    $('clinEmptyState').style.display = 'none';
    $('clinErrorState').style.display = 'flex';
    $('clinErrorMsg').textContent = msg;
    $('clinResultsTabs').style.display = 'none';
    $('clinTabCardsContent').style.display = 'none';
    $('clinTabJsonContent').style.display = 'none';
    $('clinTabRawContent').style.display = 'none';
}

function copyHistories() {
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
}

async function apiClient(url, payload) {
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP Error ${res.status}`);
    }
    return await res.json();
}

export function initClinicalFileUpload() {
    const dropZone = $('clinFileDropZone');
    const fileInput = $('clinFileInput');
    const nameTag = $('clinFileName');
    const textarea = $('clinicalNoteText');
    if (!dropZone || !fileInput || !textarea) return;

    async function uploadFile(file) {
        if (!file) return;
        const allowed = ['.txt', '.pdf', '.docx'];
        const ext = '.' + (file.name.split('.').pop() || '').toLowerCase();
        if (!allowed.includes(ext)) {
            showToast(`Unsupported file type: ${ext}. Use .txt, .pdf, or .docx`, 'error');
            return;
        }
        if (nameTag) nameTag.textContent = `📄 ${file.name}`;
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
