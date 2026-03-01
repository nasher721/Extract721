export const PROVIDER_MODELS = {
    gemini: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-1.5-flash', 'gemini-1.5-pro'],
    openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
    claude: ['claude-3-5-sonnet-20241022', 'claude-3-opus-20240229', 'claude-3-haiku-20240307'],
    glm: ['glm-4', 'glm-4-flash', 'glm-4-air', 'glm-4-plus']
};

export const TEMPLATES = {
    literary: `Extract characters, emotions, and relationships in order of appearance.
Use exact text for extractions. Do not paraphrase or overlap entities.
Provide meaningful attributes for each entity to add context.`,
    medical: `Extract medical entities: diagnoses, medications, dosages, procedures, and symptoms.
Use exact text. Include severity, laterality, and clinical context as attributes.`,
    news: `Extract named entities: people, organizations, locations, and events.
Include roles, relationships, and dates as attributes where present.`,
    custom: ``,
};

export const CLIN_SECTIONS = [
    { key: 'history', label: 'History of Present Illness', icon: '📋', section: 'history' },
    { key: 'past_medical_history', label: 'Past Medical History', icon: '🏥', section: 'pmh' },
    { key: 'past_surgical_history', label: 'Past Surgical History', icon: '🔪', section: 'psh' },
    { key: 'family_history', label: 'Family History', icon: '👨‍👩‍👧', section: 'family' },
    { key: 'social_history', label: 'Social History', icon: '🚬', section: 'social' },
    { key: 'allergies', label: 'Allergies', icon: '⚠️', section: 'allergies' },
    { key: 'current_medications', label: 'Current Medications', icon: '💊', section: 'meds' },
    { key: 'vitals', label: 'Vitals', icon: '❤️', section: 'vitals' },
    { key: 'exam', label: 'Physical Exam', icon: '🩺', section: 'exam' },
    { key: 'neurologic_exam', label: 'Neurologic Exam', icon: '🧠', section: 'neuro' },
    { key: 'labs', label: 'Labs', icon: '🧪', section: 'labs' },
    { key: 'imaging', label: 'Imaging', icon: '📷', section: 'imaging' },
    { key: 'active_problems', label: 'Active Problems', icon: '🔴', section: 'problems' },
    { key: 'assessment_impression', label: 'Assessment / Impression', icon: '📝', section: 'assessment' },
    { key: 'plan', label: 'Plan', icon: '📌', section: 'plan' },
    { key: 'orders', label: 'New Orders', icon: '📋', section: 'orders' },
];

export const MODEL_PRICING_PER_1M_TOKENS = {
    'gemini-2.5-flash': 0.075,
    'gemini-2.5-pro': 3.50,
    'gemini-1.5-flash': 0.075,
    'gemini-1.5-pro': 3.50,
    'gpt-4o': 5.00,
    'gpt-4o-mini': 0.15,
    'gpt-4-turbo': 10.00,
    'gpt-3.5-turbo': 0.50,
    'claude-3-5-sonnet-20241022': 3.00,
    'claude-3-opus-20240229': 15.00,
    'claude-3-haiku-20240307': 0.25,
    'glm-4': 14.00,
    'glm-4-flash': 0.15,
    'glm-4-air': 1.00,
    'glm-4-plus': 7.00
};

export const SCHEMA_TEMPLATES = {
    '': [],
    invoice: [
        { name: 'invoice_number', type: 'string', description: 'Invoice ID or number' },
        { name: 'vendor', type: 'string', description: 'Vendor or supplier name' },
        { name: 'date', type: 'string', description: 'Invoice date' },
        { name: 'due_date', type: 'string', description: 'Payment due date' },
        { name: 'total_amount', type: 'number', description: 'Total invoice amount' },
        { name: 'currency', type: 'string', description: 'Currency code (e.g. USD)' },
        { name: 'line_items', type: 'array', description: 'List of line items with description and amount' },
    ],
    resume: [
        { name: 'full_name', type: 'string', description: 'Candidate full name' },
        { name: 'email', type: 'string', description: 'Contact email address' },
        { name: 'phone', type: 'string', description: 'Phone number' },
        { name: 'skills', type: 'array', description: 'List of technical or professional skills' },
        { name: 'work_experience', type: 'array', description: 'List of job roles with company, title, dates' },
        { name: 'education', type: 'array', description: 'Degrees, institutions, years' },
        { name: 'summary', type: 'string', description: 'Professional summary or objective' },
    ],
    contract: [
        { name: 'parties', type: 'array', description: 'Parties involved in the contract' },
        { name: 'effective_date', type: 'string', description: 'Contract effective date' },
        { name: 'expiration_date', type: 'string', description: 'Contract expiration/end date' },
        { name: 'governing_law', type: 'string', description: 'Governing law / jurisdiction' },
        { name: 'payment_terms', type: 'string', description: 'Payment obligations and terms' },
        { name: 'obligations', type: 'array', description: 'Key obligations of each party' },
        { name: 'termination_clause', type: 'string', description: 'Conditions for termination' },
    ],
    medical: [
        { name: 'patient_name', type: 'string', description: 'Patient full name' },
        { name: 'dob', type: 'string', description: 'Patient date of birth' },
        { name: 'diagnosis', type: 'array', description: 'List of diagnoses' },
        { name: 'medications', type: 'array', description: 'Current medications with dosages' },
        { name: 'allergies', type: 'array', description: 'Known allergies' },
        { name: 'vital_signs', type: 'object', description: 'Vital signs (BP, HR, temp, etc.)' },
        { name: 'attending_physician', type: 'string', description: 'Name of attending physician' },
    ],
    research: [
        { name: 'title', type: 'string', description: 'Paper title' },
        { name: 'authors', type: 'array', description: 'List of authors' },
        { name: 'abstract', type: 'string', description: 'Abstract text' },
        { name: 'keywords', type: 'array', description: 'Keywords/topics' },
        { name: 'methodology', type: 'string', description: 'Research methodology' },
        { name: 'findings', type: 'string', description: 'Key findings or results' },
        { name: 'doi', type: 'string', description: 'DOI identifier' },
        { name: 'publication_date', type: 'string', description: 'Publication date' },
    ],
    product: [
        { name: 'product_name', type: 'string', description: 'Product name' },
        { name: 'sku', type: 'string', description: 'SKU or product ID' },
        { name: 'price', type: 'number', description: 'Price (numeric)' },
        { name: 'currency', type: 'string', description: 'Currency code' },
        { name: 'category', type: 'string', description: 'Product category' },
        { name: 'description', type: 'string', description: 'Product description' },
        { name: 'in_stock', type: 'boolean', description: 'Whether item is in stock' },
        { name: 'rating', type: 'number', description: 'Average rating (0-5)' },
    ],
};
