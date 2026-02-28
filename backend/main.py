import os
import json
import tempfile
import re
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import langextract as lx

# Resolve paths relative to this file so the server works from any CWD
BASE_DIR = Path(__file__).resolve().parent.parent
FRONTEND_DIR = BASE_DIR / "frontend"

app = FastAPI()

# Enable CORS for local dev
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Clinical EMR Extraction Prompt ───────────────────────────────────────────

CLINICAL_PROMPT_TEMPLATE = """You are a clinical document cleaning and structured extraction engine.

PRIMARY GOAL:
Remove unnecessary EMR clutter and extract only clinically relevant information.

You must aggressively eliminate:
- Administrative artifacts (Expand All, Cosign Needed, ICU checklist)
- Device inventory unless clinically relevant
- Duplicate section headers
- Repeated medication tables
- Workflow checklists (CAM, RASS, mobility goals, line necessity reviews)
- Billing or quality metrics
- Full medication lists unless clinically relevant
- Redundant normal findings
- Boilerplate text

Retain only medically meaningful data for clinical reasoning.

--------------------------------------------------
EXTRACT ONLY THE FOLLOWING SECTIONS:
--------------------------------------------------

1. History of Present Illness (HPI)
   - Chief issue
   - Surgical/medical context
   - Pertinent intraoperative events
   - Current status

2. Past Medical History (PMH) - Chronic conditions only

3. Past Surgical History (PSH)

4. Family History - Only relevant items

5. Social History - Tobacco, alcohol, drugs (if present)

6. Allergies - Medication + reaction

7. Current Medications
   Include: Active inpatient meds, pressors, insulin regimens, antibiotics, anticoagulation, steroids
   Exclude: Long outpatient lists unless directly relevant

8. Vitals - Most recent values, abnormal values, pressor/oxygen support

9. Physical Exam - Pertinent positives only, exclude normal boilerplate

10. Neurologic Exam (structured)
    - GCS, mental status, cranial nerve abnormalities, motor/sensory findings, new vs baseline deficits

11. Labs - Abnormal values, trending changes, clinically meaningful labs only

12. Imaging - Relevant imaging performed/pending + reason

13. Active Problems - Concise problem list, acute vs chronic

14. Assessment / Impression - Clinical reasoning summary, postoperative risks, differential if present

15. Plan - Actionable medical plans only:
    monitoring, imaging, medications, hemodynamic goals, glycemic management,
    infection management, DVT prophylaxis, consults, disposition planning

16. Orders - New orders only (imaging, meds, labs, consults); exclude routine nursing workflow orders

--------------------------------------------------
OUTPUT RULES
--------------------------------------------------

- Output clean JSON only. No markdown fences, no commentary.
- Do not include checklists or quality metrics.
- Do not include repetitive medication tables.
- Remove device inventories unless clinically relevant.
- Collapse redundant text.
- Preserve trends (e.g., Hgb 10.4 -> 8.5).
- Preserve numeric precision.
- If a section is not present, return null.

Return ONLY valid JSON in exactly this format, nothing else:

{{
  "history": null,
  "past_medical_history": null,
  "past_surgical_history": null,
  "family_history": null,
  "social_history": null,
  "allergies": null,
  "current_medications": null,
  "vitals": null,
  "exam": null,
  "neurologic_exam": null,
  "labs": null,
  "imaging": null,
  "active_problems": null,
  "assessment_impression": null,
  "plan": null,
  "orders": null
}}

--------------------------------------------------
TEXT TO PROCESS:
--------------------------------------------------

{note_text}
"""

# ─── Request / Response Models ────────────────────────────────────────────────

class ExtractionParam(BaseModel):
    extraction_class: str
    extraction_text: str
    attributes: Dict[str, Any]

class ExampleParam(BaseModel):
    text: str
    extractions: List[ExtractionParam]

class ExtractRequest(BaseModel):
    text: str
    prompt: str
    examples: List[ExampleParam]
    model_id: str = "gemini-2.5-flash"
    api_key: str

class ClinicalExtractRequest(BaseModel):
    note_text: str
    model_id: str = "gemini-2.5-flash"
    api_key: str

class SchemaField(BaseModel):
    name: str
    type: str # string, number, boolean, array, object
    description: str

class StructuredExtractRequest(BaseModel):
    text: str
    extraction_schema: List[SchemaField]
    model_id: str = "gemini-1.5-flash"
    api_key: str

# ─── Standard LangExtract Endpoint ────────────────────────────────────────────

@app.post("/api/extract")
async def extract_data(req: ExtractRequest):
    try:
        # Build examples
        lx_examples = []
        for ex in req.examples:
            extractions = []
            for ext in ex.extractions:
                extractions.append(lx.data.Extraction(
                    extraction_class=ext.extraction_class,
                    extraction_text=ext.extraction_text,
                    attributes=ext.attributes
                ))
            lx_examples.append(lx.data.ExampleData(
                text=ex.text,
                extractions=extractions
            ))

        # Run extraction
        result = lx.extract(
            text_or_documents=req.text,
            prompt_description=req.prompt,
            examples=lx_examples,
            model_id=req.model_id,
            api_key=req.api_key
        )

        # Save payload to JSONL temporarily to generate visualization
        with tempfile.TemporaryDirectory() as tmpdir:
            jsonl_path = os.path.join(tmpdir, "extract.jsonl")
            lx.io.save_annotated_documents([result], output_name="extract.jsonl", output_dir=tmpdir)
            html_content = lx.visualize(jsonl_path)
            html_str = html_content.data if hasattr(html_content, 'data') else html_content

        if hasattr(result, "model_dump"):
            raw_result = result.model_dump()
        else:
            raw_result = {"text": req.text, "success": True}

        return {
            "success": True,
            "raw_result": raw_result,
            "html": html_str
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ─── Clinical EMR Extraction Endpoint ─────────────────────────────────────────

@app.post("/api/clinical-extract")
async def clinical_extract(req: ClinicalExtractRequest):
    """
    Calls Gemini directly with the clinical EMR cleaning prompt,
    injects the raw note text, and returns structured JSON.
    """
    try:
        import google.generativeai as genai

        genai.configure(api_key=req.api_key)
        model = genai.GenerativeModel(req.model_id)

        prompt = CLINICAL_PROMPT_TEMPLATE.format(note_text=req.note_text)
        response = model.generate_content(prompt)
        raw_text = response.text.strip()

        # Strip any markdown fences the model might add despite instructions
        clean = re.sub(r'^```(?:json)?\s*', '', raw_text, flags=re.MULTILINE)
        clean = re.sub(r'\s*```$', '', clean, flags=re.MULTILINE)
        clean = clean.strip()

        try:
            structured = json.loads(clean)
        except json.JSONDecodeError:
            structured = {"raw_text": clean, "_parse_error": "Model did not return valid JSON"}

        return {
            "success": True,
            "structured": structured,
            "raw_llm_output": raw_text,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/extract-structured")
async def extract_structured(req: StructuredExtractRequest):
    """
    Dynamic schema extraction. Constructs a prompt based on user-defined fields
    and requests JSON output.
    """
    try:
        import google.generativeai as genai
        
        genai.configure(api_key=req.api_key)
        model = genai.GenerativeModel(req.model_id)

        # Build schema description
        schema_desc = "\n".join([
            f"- {f.name} ({f.type}): {f.description}"
            for f in req.extraction_schema
        ])

        system_prompt = f"""You are a precision data extraction engine.
Your goal is to extract specific fields from the text below and return them in a valid JSON object.

FIELDS TO EXTRACT:
{schema_desc}

RULES:
- Return ONLY valid JSON.
- No markdown fences (```json), no preamble, no commentary.
- If a field is missing or not found, use null.
- Ensure types match (e.g. if type is number, do not return a string).
"""

        full_prompt = f"{system_prompt}\n\nTEXT TO PROCESS:\n{req.text}"
        
        # We use a simple prompt for now, but could be enhanced with response_mime_type
        response = model.generate_content(
            full_prompt,
            generation_config={"response_mime_type": "application/json"}
        )
        
        raw_text = response.text.strip()
        
        try:
            structured = json.loads(raw_text)
        except json.JSONDecodeError:
            # Fallback for models that might still wrap in fences
            clean = re.sub(r'^```(?:json)?\s*', '', raw_text, flags=re.MULTILINE)
            clean = re.sub(r'\s*```$', '', clean, flags=re.MULTILINE)
            structured = json.loads(clean.strip())

        return {
            "success": True,
            "data": structured
        }

    except Exception as e:
        print(f"Extraction Error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/clinical-extract-stream")
async def clinical_extract_stream(req: ClinicalExtractRequest):
    """
    Streams Gemini response chunks as Server-Sent Events (SSE).
    """
    import google.generativeai as genai
    from fastapi.responses import StreamingResponse

    try:
        genai.configure(api_key=req.api_key)
        model = genai.GenerativeModel(req.model_id)
        prompt = CLINICAL_PROMPT_TEMPLATE.format(note_text=req.note_text)
        
        # Initiate streaming generation
        response = model.generate_content(prompt, stream=True)

        async def sse_generator():
            try:
                for chunk in response:
                    if chunk.text:
                        # Yield SSE data block
                        yield f"data: {json.dumps({'chunk': chunk.text})}\n\n"
                
                # Yield end event
                yield f"event: end\ndata: {json.dumps({'status': 'complete'})}\n\n"
            except Exception as e:
                yield f"event: error\ndata: {json.dumps({'error': str(e)})}\n\n"

        return StreamingResponse(sse_generator(), media_type="text/event-stream")

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Mount frontend
app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")
