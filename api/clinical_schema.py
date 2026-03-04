"""
Single source of truth for clinical extraction schema.
Used by the prompt template and exposed via /api/clinical-schema for the frontend.
"""

CLINICAL_SECTIONS = [
    {"key": "history", "label": "History of Present Illness", "icon": "📋", "section": "history"},
    {"key": "past_medical_history", "label": "Past Medical History", "icon": "🏥", "section": "pmh"},
    {"key": "past_surgical_history", "label": "Past Surgical History", "icon": "🔪", "section": "psh"},
    {"key": "family_history", "label": "Family History", "icon": "👨‍👩‍👧", "section": "family"},
    {"key": "social_history", "label": "Social History", "icon": "🚬", "section": "social"},
    {"key": "allergies", "label": "Allergies", "icon": "⚠️", "section": "allergies"},
    {"key": "current_medications", "label": "Current Medications", "icon": "💊", "section": "meds"},
    {"key": "vitals", "label": "Vitals", "icon": "❤️", "section": "vitals"},
    {"key": "exam", "label": "Physical Exam", "icon": "🩺", "section": "exam"},
    {"key": "neurologic_exam", "label": "Neurologic Exam", "icon": "🧠", "section": "neuro"},
    {"key": "labs", "label": "Labs", "icon": "🧪", "section": "labs"},
    {"key": "imaging", "label": "Imaging", "icon": "📷", "section": "imaging"},
    {"key": "active_problems", "label": "Active Problems", "icon": "🔴", "section": "problems"},
    {"key": "assessment_impression", "label": "Assessment / Impression", "icon": "📝", "section": "assessment"},
    {"key": "plan", "label": "Plan", "icon": "📌", "section": "plan"},
    {"key": "orders", "label": "New Orders", "icon": "📋", "section": "orders"},
]


def get_prompt_json_template() -> str:
    """Generate the JSON template for the clinical prompt from CLINICAL_SECTIONS.
    Uses {{ }} so the result is safe for str.format().
    """
    lines = ["{{"]
    for s in CLINICAL_SECTIONS:
        lines.append(f'  "{s["key"]}": null,')
    if lines:
        lines[-1] = lines[-1].rstrip(",")
    lines.append("}}")
    return "\n".join(lines)
