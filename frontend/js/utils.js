import { state } from './state.js';
import { MODEL_PRICING_PER_1M_TOKENS } from './constants.js';

export const $ = id => document.getElementById(id);

export function escHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

export function showToast(message, type = 'info') {
    const container = $('toastContainer') || document.body;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <div class="toast-icon">${type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️'}</div>
        <div class="toast-content">${message}</div>
    `;
    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 500);
    }, 4000);
}

export function setStatus(type, text) {
    const dot = document.querySelector('.status-dot');
    const txt = document.querySelector('.status-text');
    if (!dot || !txt) return;

    dot.className = 'status-dot ' + type;
    txt.textContent = text;
}

export function registerEvent(id, event, handler) {
    const el = $(id);
    if (el) el.addEventListener(event, handler);
}

export function toggleSecret(inputId, eyeOpenId, eyeClosedId) {
    const input = $(inputId);
    const open = $(eyeOpenId);
    const closed = $(eyeClosedId);
    if (!input) return;

    const isPassword = input.type === 'password';
    input.type = isPassword ? 'text' : 'password';
    if (open) open.style.display = isPassword ? 'block' : 'none';
    if (closed) closed.style.display = isPassword ? 'none' : 'block';
}

export function estimateCost(charCount, modelId) {
    const estimatedTokens = Math.ceil(charCount / 4);
    const pricePer1M = MODEL_PRICING_PER_1M_TOKENS[modelId] || 0.15;
    const cost = (estimatedTokens / 1000000) * pricePer1M;
    return {
        tokens: estimatedTokens.toLocaleString(),
        cost: cost > 0 ? cost.toFixed(4) : "0.0000"
    };
}

export function updateTextStats(text, wordId, charId, lineId, tokenId, costId, modeHint = 'gemini-2.5-flash') {
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

export function timeSince(iso) {
    const diff = (Date.now() - new Date(iso)) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
}

export async function apiClient(url, payload) {
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
