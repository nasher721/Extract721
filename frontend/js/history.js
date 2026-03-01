import { $, timeSince, showToast } from './utils.js';
import { state } from './state.js';

export function historySave(items) {
    localStorage.setItem('langextract_history', JSON.stringify(items));
}

export function historyLoad() {
    return JSON.parse(localStorage.getItem('langextract_history')) || [];
}

export function historyAdd(item) {
    let history = historyLoad();
    item.id = Date.now();
    item.timestamp = new Date().toISOString();
    history.unshift(item);
    if (history.length > 50) history.pop();
    historySave(history);
}

export function historyRender() {
    const list = $('historyList');
    if (!list) return;
    const history = historyLoad();
    if (!history.length) {
        list.innerHTML = '<p class="history-empty">No extractions saved yet.</p>';
        return;
    }
    list.innerHTML = history.map(item => `
        <div class="history-item" onclick="historyItemClick(${item.id})">
            <div class="history-item-content">
                <div class="history-item-title">${item.title || 'Extraction'}</div>
                <div class="history-item-meta">
                    ${item.mode.charAt(0).toUpperCase() + item.mode.slice(1)} · 
                    ${item.model} · ${timeSince(item.timestamp)}
                </div>
            </div>
            <button class="history-item-delete" onclick="historyItemDelete(event, ${item.id})" title="Delete">✕</button>
        </div>
    `).join('');
}

// These functions will be called from the global scope for simplicity or I can attach them to window
window.historyItemDelete = (e, id) => {
    e.stopPropagation();
    let history = historyLoad();
    history = history.filter(item => item.id !== id);
    historySave(history);
    historyRender();
};

window.historyItemClick = (id) => {
    const history = historyLoad();
    const item = history.find(i => i.id === id);
    if (!item) return;

    if (item.mode === 'clinical') {
        const clinBtn = $('modeClinical');
        if (clinBtn) clinBtn.click();
        setTimeout(() => {
            const ta = $('clinicalNoteText');
            if (ta) ta.value = item.inputText || '';
        }, 100);
    } else if (item.mode === 'structured') {
        const structBtn = $('modeStructured');
        if (structBtn) structBtn.click();
        setTimeout(() => {
            const ta = $('structInputText');
            if (ta) ta.value = item.inputText || '';
        }, 100);
    } else {
        // standard
        const stdBtn = $('modeStandard');
        if (stdBtn) stdBtn.click();
        setTimeout(() => {
            const ta = $('inputText');
            if (ta) ta.value = item.inputText || '';
            const promptEl = $('promptDescription');
            if (promptEl && item.prompt) promptEl.value = item.prompt;
        }, 100);
    }
    historyModalClose();
    showToast('Loaded from history — edit and re-run as needed', 'info');
};

export function historyModalOpen() {
    historyRender();
    const modal = $('historyModal');
    if (modal) modal.classList.add('open');
}

export function historyModalClose() {
    const modal = $('historyModal');
    if (modal) modal.classList.remove('open');
}

export function initHistory() {
    registerEvent('closeHistoryBtn', 'click', historyModalClose);
    registerEvent('clearHistoryBtn', 'click', () => {
        if (!confirm('Clear all extraction history?')) return;
        historySave([]);
        historyRender();
        showToast('History cleared', 'info');
    });
    const modal = $('historyModal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) historyModalClose();
        });
    }
    // Wire up all "open history" buttons across modes
    document.querySelectorAll('#openHistoryBtn, #openHistoryBtnStd').forEach(btn => {
        btn?.addEventListener('click', historyModalOpen);
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') historyModalClose();
    });
}

function registerEvent(id, event, handler) {
    const el = $(id);
    if (el) el.addEventListener(event, handler);
}
