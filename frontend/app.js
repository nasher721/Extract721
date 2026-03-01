import { state } from './js/state.js';
import { $, registerEvent, toggleSecret, updateTextStats } from './js/utils.js';
import { PROVIDER_MODELS } from './js/constants.js';
import { initHistory } from './js/history.js';
import { initPromptLibrary } from './js/prompts.js';
import { initStandardMode } from './js/modes/standard.js';
import { initClinicalMode, initClinicalFileUpload } from './js/modes/clinical.js';
import { initStructuredMode } from './js/modes/structured.js';

document.addEventListener('DOMContentLoaded', () => {
    initConfig();
    initModeToggle();
    initHistory();
    initPromptLibrary();
    initStandardMode();
    initClinicalMode();
    initClinicalFileUpload();
    initStructuredMode();

    // Initial UI state
    switchProvider(state.provider);
});

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
                if (p === 'gemini') localStorage.setItem('GEMINI_API_KEY', state.apiKeys[p]);
            });
        }
    });

    // Eye toggles
    document.querySelectorAll('.input-toggle-btn[data-toggle]').forEach(btn => {
        btn.addEventListener('click', () => {
            const inputId = btn.dataset.toggle;
            const eyeOpen = btn.querySelector('.eye-open');
            const eyeClosed = btn.querySelector('.eye-closed');
            toggleSecret(inputId, eyeOpen.id, eyeClosed.id); // Slight mismatch in utils function params but I'll fix it if needed
            // Actually utils.js toggleSecret(inputId, eyeOpenId, eyeClosedId) expect IDs
            // Let's just use it directly here if easier or align utils.
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
            const val = modelSel.value;
            state.selectedModel = val;
            state.clinicalModel = val;
            state.structModel = val;
            localStorage.setItem('lx_model', val);

            const hint = $('modelHint');
            if (hint) hint.textContent = val;
            updateProviderBadges(state.provider, val);
        });

        // Restore
        const savedModel = localStorage.getItem('lx_model');
        if (savedModel) {
            modelSel.value = savedModel;
            state.selectedModel = savedModel;
            state.clinicalModel = savedModel;
            state.structModel = savedModel;
        }
    }
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

        const grp = $(`modelGroup-${p}`);
        if (grp) grp.style.display = p === provider ? '' : 'none';
    });

    // Set model select to first option of the new provider
    const select = $('modelSelect');
    if (select) {
        const opts = select.querySelectorAll(`#modelGroup-${provider} option`);
        if (opts.length) {
            // Only change if current selected model is not from this provider
            const currentVal = select.value;
            const isFromCurrentProvider = Array.from(opts).some(o => o.value === currentVal);

            if (!isFromCurrentProvider) {
                select.value = opts[0].value;
                state.selectedModel = opts[0].value;
                state.clinicalModel = opts[0].value;
                state.structModel = opts[0].value;
            }

            const hint = $('modelHint');
            if (hint) hint.textContent = select.value;
            updateProviderBadges(state.provider, select.value);
        }
    }
}

function updateProviderBadges(provider, model) {
    const names = { 'gemini': 'Gemini', 'openai': 'OpenAI', 'claude': 'Claude', 'glm': 'GLM' };
    const icons = { 'gemini': 'G', 'openai': 'O', 'claude': 'C', 'glm': 'Z' };

    const targets = [
        { icon: 'clinProviderIcon', name: 'clinProviderName', model: 'clinProviderModel' },
        { icon: 'structProviderIcon', name: 'structProviderName', model: 'structProviderModel' }
    ];

    targets.forEach(t => {
        const iconEl = $(t.icon);
        if (iconEl) iconEl.textContent = icons[provider] || '?';
        const nameEl = $(t.name);
        if (nameEl) nameEl.textContent = names[provider] || provider;
        const modelEl = $(t.model);
        if (modelEl) modelEl.textContent = model || '';
    });

    const structHint = $('structProviderHint');
    if (structHint) structHint.textContent = `${names[provider]} · ${model}`;
}
