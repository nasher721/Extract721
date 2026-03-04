import { TEMPLATES } from './constants.js';

function loadExamples() {
    try {
        const s = localStorage.getItem('langextract_examples');
        if (s) {
            const arr = JSON.parse(s);
            if (Array.isArray(arr) && arr.length > 0) return arr;
        }
    } catch (_) {}
    return [];
}

function loadSchemaFields() {
    try {
        const s = localStorage.getItem('langextract_schema_fields');
        if (s) {
            const arr = JSON.parse(s);
            if (Array.isArray(arr) && arr.length > 0) return arr;
        }
    } catch (_) {}
    return [
        { id: `sf_${Date.now()}_0`, name: 'Patient Name', type: 'string', description: 'Full name of the patient' },
        { id: `sf_${Date.now()}_1`, name: 'Diagnoses', type: 'array', description: 'List of confirmed medical diagnoses' }
    ];
}

export function persistExamples() {
    try {
        localStorage.setItem('langextract_examples', JSON.stringify(state.examples));
    } catch (_) {}
}

export function persistSchemaFields() {
    try {
        localStorage.setItem('langextract_schema_fields', JSON.stringify(state.schemaFields));
    } catch (_) {}
}

export const state = {
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
    examples: loadExamples(),
    currentTemplate: 'literary',
    clinStructuredData: null,
    // Prompt Library
    prompts: JSON.parse(localStorage.getItem('langextract_prompts')) || [
        { id: 'p_lit', name: 'Literary', prompt: TEMPLATES.literary, readonly: true },
        { id: 'p_med', name: 'Medical', prompt: TEMPLATES.medical, readonly: true },
        { id: 'p_new', name: 'News', prompt: TEMPLATES.news, readonly: true },
        { id: 'p_fin', name: 'Financial', prompt: 'Extract financial entities: companies, tickers, currencies, revenues, profits. Include fiscal quarters as attributes.', readonly: true }
    ],
    // Schema Builder (use unique IDs)
    schemaFields: loadSchemaFields(),
    structModel: 'gemini-2.5-flash',
    // Batch Upload Tracker
    structuredBatchMode: false,
    structuredBatchFiles: [],
    editingPromptId: null,
    clinSections: null  // Fetched from /api/clinical-schema; fallback to CLIN_SECTIONS
};
