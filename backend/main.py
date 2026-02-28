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

# ─── Model Catalogues ──────────────────────────────────────────────────────────

PROVIDER_MODELS = {
    "gemini": ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-1.5-flash", "gemini-1.5-pro"],
    "openai": ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"],
    "claude": ["claude-3-5-sonnet-20241022", "claude-3-opus-20240229", "claude-3-haiku-20240307"],
    "glm": ["glm-4", "glm-4-flash", "glm-4-air", "glm-4-plus"],
}

# ─── Unified LLM Caller ───────────────────────────────────────────────────────

def call_llm(prompt: str, provider: str, model_id: str, api_key: str,
             json_mode: bool = False, stream: bool = False):
    """
    Route a prompt to the correct LLM provider and return the response text.
    For streaming (Gemini only for now) returns the raw response object.
    Raises ValueError for unsupported providers.
    """
    provider = provider.lower().strip()

    if provider == "gemini":
        import google.generativeai as genai
        genai.configure(api_key=api_key)
        gen_config = {}
        if json_mode:
            gen_config["response_mime_type"] = "application/json"
        model = genai.GenerativeModel(model_id)
        if stream:
            return model.generate_content(prompt, stream=True, generation_config=gen_config)
        response = model.generate_content(prompt, generation_config=gen_config)
        return response.text.strip()

    elif provider == "openai":
        from openai import OpenAI
        client = OpenAI(api_key=api_key)
        messages = [{"role": "user", "content": prompt}]
        kwargs = {
            "model": model_id,
            "messages": messages,
        }
        if json_mode:
            kwargs["response_format"] = {"type": "json_object"}
        response = client.chat.completions.create(**kwargs)
        return response.choices[0].message.content.strip()

    elif provider == "claude":
        import anthropic
        client = anthropic.Anthropic(api_key=api_key)
        response = client.messages.create(
            model=model_id,
            max_tokens=4096,
            messages=[{"role": "user", "content": prompt}]
        )
        return response.content[0].text.strip()

    elif provider == "glm":
        from zhipuai import ZhipuAI
        client = ZhipuAI(api_key=api_key)
        response = client.chat.completions.create(
            model=model_id,
            messages=[{"role": "user", "content": prompt}]
        )
        return response.choices[0].message.content.strip()

    else:
        raise ValueError(f"Unsupported provider: '{provider}'. Choose from: gemini, openai, claude, glm")


def clean_json_response(raw: str) -> dict:
    """Strip markdown fences and parse JSON from LLM output."""
    clean = re.sub(r'^```(?:json)?\s*', '', raw, flags=re.MULTILINE)
    clean = re.sub(r'\s*```$', '', clean, flags=re.MULTILINE)
    return json.loads(clean.strip())


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
    provider: str = "gemini"

class ClinicalExtractRequest(BaseModel):
    note_text: str
    model_id: str = "gemini-2.5-flash"
    api_key: str
    provider: str = "gemini"

class SchemaField(BaseModel):
    name: str
    type: str  # string, number, boolean, array, object
    description: str

class StructuredExtractRequest(BaseModel):
    text: str
    extraction_schema: List[SchemaField]
    model_id: str = "gemini-2.5-flash"
    api_key: str
    provider: str = "gemini"

# ─── Provider Catalogue Endpoint ──────────────────────────────────────────────

@app.get("/api/providers")
async def get_providers():
    return {"providers": PROVIDER_MODELS}

# ─── Standard LangExtract Endpoint ────────────────────────────────────────────

@app.post("/api/extract")
async def extract_data(req: ExtractRequest):
    try:
        # LangExtract only supports Gemini natively; for other providers we
        # fall back to a direct LLM prompt that mimics extraction output.
        if req.provider == "gemini":
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

            result = lx.extract(
                text_or_documents=req.text,
                prompt_description=req.prompt,
                examples=lx_examples,
                model_id=req.model_id,
                api_key=req.api_key
            )

            with tempfile.TemporaryDirectory() as tmpdir:
                jsonl_path = os.path.join(tmpdir, "extract.jsonl")
                lx.io.save_annotated_documents([result], output_name="extract.jsonl", output_dir=tmpdir)
                html_content = lx.visualize(jsonl_path)
                html_str = html_content.data if hasattr(html_content, 'data') else html_content

            raw_result = result.model_dump() if hasattr(result, "model_dump") else {"text": req.text, "success": True}
            return {"success": True, "raw_result": raw_result, "html": html_str}

        else:
            # Non-Gemini: construct a descriptive prompt and return raw extractions as JSON
            examples_text = ""
            for i, ex in enumerate(req.examples, 1):
                exts = json.dumps([{"class": e.extraction_class, "text": e.extraction_text, "attributes": e.attributes} for e in ex.extractions], indent=2)
                examples_text += f"\nExample {i}:\nText: {ex.text}\nExtractions: {exts}\n"

            prompt = f"""{req.prompt}

Return a JSON object with an "extractions" array. Each item must have:
- "extraction_class": string
- "extraction_text": exact quote from source
- "attributes": object

{('Examples:\n' + examples_text) if examples_text.strip() else ''}

TEXT TO ANALYZE:
{req.text}

Return ONLY valid JSON, no markdown fences."""

            raw = call_llm(prompt, req.provider, req.model_id, req.api_key, json_mode=True)
            try:
                parsed = json.loads(raw) if isinstance(raw, str) else raw
            except Exception:
                parsed = clean_json_response(raw)

            return {
                "success": True,
                "raw_result": parsed,
                "html": "<p style='color:#aaa;font-style:italic'>HTML visualization is only available for Gemini provider.</p>"
            }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─── Clinical EMR Extraction Endpoint ─────────────────────────────────────────

@app.post("/api/clinical-extract")
async def clinical_extract(req: ClinicalExtractRequest):
    try:
        prompt = CLINICAL_PROMPT_TEMPLATE.format(note_text=req.note_text)
        raw_text = call_llm(prompt, req.provider, req.model_id, req.api_key)

        try:
            structured = clean_json_response(raw_text)
        except json.JSONDecodeError:
            structured = {"raw_text": raw_text, "_parse_error": "Model did not return valid JSON"}

        return {
            "success": True,
            "structured": structured,
            "raw_llm_output": raw_text,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/clinical-extract-stream")
async def clinical_extract_stream(req: ClinicalExtractRequest):
    """
    Streams response chunks as Server-Sent Events (SSE).
    Full streaming is only supported for Gemini; other providers return a single chunk.
    """
    from fastapi.responses import StreamingResponse
    import google.generativeai as genai

    try:
        prompt = CLINICAL_PROMPT_TEMPLATE.format(note_text=req.note_text)

        if req.provider == "gemini":
            genai.configure(api_key=req.api_key)
            model = genai.GenerativeModel(req.model_id)
            response = model.generate_content(prompt, stream=True)

            async def sse_generator():
                try:
                    for chunk in response:
                        if chunk.text:
                            yield f"data: {json.dumps({'chunk': chunk.text})}\n\n"
                    yield f"event: end\ndata: {json.dumps({'status': 'complete'})}\n\n"
                except Exception as e:
                    yield f"event: error\ndata: {json.dumps({'error': str(e)})}\n\n"

        else:
            # Non-Gemini: get full response then emit as one chunk
            full_text = call_llm(prompt, req.provider, req.model_id, req.api_key)

            async def sse_generator():
                yield f"data: {json.dumps({'chunk': full_text})}\n\n"
                yield f"event: end\ndata: {json.dumps({'status': 'complete'})}\n\n"

        return StreamingResponse(sse_generator(), media_type="text/event-stream")

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─── Structured Schema Extraction ─────────────────────────────────────────────

@app.post("/api/extract-structured")
async def extract_structured(req: StructuredExtractRequest):
    try:
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

        use_json_mode = req.provider == "gemini"
        raw = call_llm(full_prompt, req.provider, req.model_id, req.api_key, json_mode=use_json_mode)

        try:
            structured = json.loads(raw) if isinstance(raw, str) else raw
        except json.JSONDecodeError:
            structured = clean_json_response(raw)

        return {"success": True, "data": structured}

    except Exception as e:
        print(f"Extraction Error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# Mount frontend
app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")
