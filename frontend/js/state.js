import { TEMPLATES } from './constants.js';

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
    examples: [],
    currentTemplate: 'literary',
    clinStructuredData: null,
    // Prompt Library
    prompts: JSON.parse(localStorage.getItem('langextract_prompts')) || [
        { id: 'p_lit', name: 'Literary', prompt: TEMPLATES.literary, readonly: true },
        { id: 'p_med', name: 'Medical', prompt: TEMPLATES.medical, readonly: true },
        { id: 'p_new', name: 'News', prompt: TEMPLATES.news, readonly: true },
        { id: 'p_fin', name: 'Financial', prompt: 'Extract financial entities: companies, tickers, currencies, revenues, profits. Include fiscal quarters as attributes.', readonly: true }
    ],
    // Schema Builder
    schemaFields: [
        { id: Date.now(), name: 'Patient Name', type: 'string', description: 'Full name of the patient' },
        { id: Date.now() + 1, name: 'Diagnoses', type: 'array', description: 'List of confirmed medical diagnoses' }
    ],
    structModel: 'gemini-2.5-flash',
    // Batch Upload Tracker
    structuredBatchMode: false,
    structuredBatchFiles: []
};
