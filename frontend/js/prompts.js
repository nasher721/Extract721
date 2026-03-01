import { $, escHtml, showToast, registerEvent } from './utils.js';
import { state } from './state.js';

export function promptsSave(items) {
    localStorage.setItem('langextract_prompts', JSON.stringify(items));
    state.prompts = items;
}

export function promptsRender() {
    const list = $('promptList');
    if (!list) return;
    if (!state.prompts.length) {
        list.innerHTML = '<p class="history-empty">No saved prompts.</p>';
        return;
    }
    list.innerHTML = state.prompts.map(item => `
        <div class="history-item" data-id="${item.id}">
            <div class="history-item-content">
                <div class="history-item-title">${escHtml(item.name)}</div>
                <div class="history-item-meta" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:300px;">
                    ${escHtml(item.prompt.substring(0, 60))}...
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
                const ta = $('promptDescription');
                if (ta) {
                    ta.value = item.prompt;
                    showToast('Loaded prompt: ' + item.name, 'success');
                    promptModalClose();

                    // Clear the active template chip since we loaded from library
                    document.querySelectorAll('.template-chip').forEach(c => c.classList.remove('active'));
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

export function promptModalOpen() {
    promptsRender();
    const modal = $('promptModal');
    if (modal) modal.classList.add('open');
}

export function promptModalClose() {
    const modal = $('promptModal');
    if (modal) modal.classList.remove('open');
}

export function initPromptLibrary() {
    registerEvent('openPromptLibraryBtn', 'click', promptModalOpen);
    registerEvent('closePromptBtn', 'click', promptModalClose);

    const modal = $('promptModal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) promptModalClose();
        });
    }

    registerEvent('savePromptBtn', 'click', () => {
        const nameInput = $('newPromptName');
        const name = nameInput.value.trim();
        const promptText = $('promptDescription')?.value.trim();

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

    const fileInput = $('importPromptsFile');
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
