import { state } from '../state.js';
import { $, escHtml, showToast, registerEvent, updateTextStats, setStatus, toggleSecret } from '../utils.js';
import { CLIN_SECTIONS } from '../constants.js';
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

    registerEvent('clinCopyHistoriesBtn', 'click', copyHistories);
}

let currentStreamController = null;

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
            // After stream ends, re-fetch full or parse raw
            // In this specific implementation, we might just re-call non-stream for final structure if needed,
            // but let's assume rawOutput is the full JSON or we call a separate finish endpoint.
            // For now, let's just parse the rawOutput if it's finished.

            // Actually, the original app probably just used the raw output.
            // Let's call the non-streaming endpoint for the final "pretty" result for now if raw fails.

            const finalData = await apiClient('/api/clinical-extract', {
                note_text: noteText,
                model_id: state.clinicalModel,
                api_key: apiKey,
                provider: state.provider
            });

            state.clinStructuredData = finalData.raw_result;
            displayClinicalResults(finalData.raw_result);
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
            // Fallback: try to grep some JSON from rawOutput
            try {
                const jsonMatch = rawOutput.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    const parsed = JSON.parse(jsonMatch[0]);
                    state.clinStructuredData = parsed;
                    displayClinicalResults(parsed);
                }
            } catch (inner) {
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

function displayClinicalResults(data) {
    const cardsEl = $('clinTabCardsContent');
    if (!cardsEl) return;
    cardsEl.innerHTML = '';

    // Sort sections based on CLIN_SECTIONS order
    CLIN_SECTIONS.forEach(sec => {
        const val = data[sec.key];
        if (val === null || val === undefined || (Array.isArray(val) && val.length === 0)) return;

        const card = document.createElement('div');
        card.className = 'clin-card';

        let contentHtml = '';
        if (typeof val === 'string') {
            contentHtml = `<p>${escHtml(val)}</p>`;
        } else if (Array.isArray(val)) {
            contentHtml = `<ul class="clin-list">${val.map(item => `<li>${escHtml(typeof item === 'string' ? item : JSON.stringify(item))}</li>`).join('')}</ul>`;
        } else {
            contentHtml = `<pre class="clin-json-small">${escHtml(JSON.stringify(val, null, 2))}</pre>`;
        }

        card.innerHTML = `
            <div class="clin-card-header">
                <span class="clin-card-icon">${sec.icon}</span>
                <span class="clin-card-title">${sec.label}</span>
            </div>
            <div class="clin-card-body">${contentHtml}</div>
        `;
        cardsEl.appendChild(card);
    });

    $('clinJsonOutput').textContent = JSON.stringify(data, null, 2);
}

function switchClinTab(tab) {
    ['cards', 'json'].forEach(t => {
        $(`clinTab${t.charAt(0).toUpperCase() + t.slice(1)}`).classList.toggle('active', t === tab);
        $(`clinTab${t.charAt(0).toUpperCase() + t.slice(1)}Content`).style.display = t === tab ? 'flex' : 'none';
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
