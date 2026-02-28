import os
import json
import tempfile
import re
import time
import asyncio
from pathlib import Path
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import StreamingResponse, FileResponse
from pydantic import BaseModel, SecretStr
from typing import List, Dict, Any, Optional

import langextract as lx

# Resolve paths relative to this file so the server works from any CWD
BASE_DIR = Path(__file__).resolve().parent.parent
FRONTEND_DIR = BASE_DIR / "frontend"

app = FastAPI()

# CORS: allow same-origin + localhost dev. Never wildcard with credentials.
_ALLOWED_ORIGINS = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:8000,http://127.0.0.1:8000"
).split(",")

_ALLOW_CREDENTIALS = "*" not in _ALLOWED_ORIGINS

app.add_middleware(
    CORSMiddleware,
    allow_origins=_ALLOWED_ORIGINS,
    allow_credentials=_ALLOW_CREDENTIALS,
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
    try:
        return json.loads(clean.strip())
    except json.JSONDecodeError as e:
        raise HTTPException(
            status_code=422,
            detail=f"Model returned invalid JSON — could not parse response: {e}"
        )


def call_llm_with_retry(prompt: str, provider: str, model_id: str, api_key: str,
                        json_mode: bool = False, max_retries: int = 3) -> str:
    """call_llm wrapper with exponential backoff on 429/503."""
    delay = 2.0
    last_err = None
    for attempt in range(max_retries):
        try:
            return call_llm(prompt, provider, model_id, api_key, json_mode=json_mode)
        except Exception as e:
            msg = str(e).lower()
            if any(code in msg for code in ("429", "rate", "503", "overloaded")):
                last_err = e
                if attempt < max_retries - 1:
                    time.sleep(delay)
                    delay *= 2
            else:
                raise
    raise HTTPException(status_code=429, detail=f"Provider rate-limited after {max_retries} retries: {last_err}")


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
    api_key: SecretStr
    provider: str = "gemini"

class ClinicalExtractRequest(BaseModel):
    note_text: str
    model_id: str = "gemini-2.5-flash"
    api_key: SecretStr
    provider: str = "gemini"

class SchemaField(BaseModel):
    name: str
    type: str  # string, number, boolean, array, object
    description: str

class StructuredExtractRequest(BaseModel):
    text: str
    extraction_schema: List[SchemaField]
    model_id: str = "gemini-2.5-flash"
    api_key: SecretStr
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
                api_key=req.api_key.get_secret_value()
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

            ex_prefix = 'Examples:\n'
            prompt = f"""{req.prompt}

Return a JSON object with an "extractions" array. Each item must have:
- "extraction_class": string
- "extraction_text": exact quote from source
- "attributes": object

{(ex_prefix + examples_text) if examples_text.strip() else ''}


TEXT TO ANALYZE:
{req.text}

Return ONLY valid JSON, no markdown fences."""


            raw = call_llm_with_retry(prompt, req.provider, req.model_id, req.api_key.get_secret_value(), json_mode=True)
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
        raw_text = call_llm_with_retry(prompt, req.provider, req.model_id, req.api_key.get_secret_value())

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
            genai.configure(api_key=req.api_key.get_secret_value())
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
            full_text = call_llm_with_retry(prompt, req.provider, req.model_id, req.api_key.get_secret_value())

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

        use_json_mode = req.provider in ("gemini", "openai")
        raw = call_llm_with_retry(full_prompt, req.provider, req.model_id, req.api_key.get_secret_value(), json_mode=use_json_mode)

        try:
            structured = json.loads(raw) if isinstance(raw, str) else raw
        except json.JSONDecodeError:
            structured = clean_json_response(raw)

        return {"success": True, "data": structured}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─── File Parse Endpoint (PDF / DOCX / TXT) ────────────────────────────────────

@app.post("/api/parse-file")
async def parse_file(file: UploadFile = File(...)):
    """Extract plain text from an uploaded PDF, DOCX, or TXT file."""
    filename = (file.filename or "").lower()
    try:
        content = await file.read()
        if filename.endswith(".txt"):
            return {"text": content.decode("utf-8", errors="replace"), "filename": file.filename}

        elif filename.endswith(".pdf"):
            try:
                import pdfplumber
            except ImportError:
                raise HTTPException(status_code=422, detail="pdfplumber not installed. Run: pip install pdfplumber")
            with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
                tmp.write(content)
                tmp_path = tmp.name
            pages = []
            with pdfplumber.open(tmp_path) as pdf:
                for page in pdf.pages:
                    pages.append(page.extract_text() or "")
            os.unlink(tmp_path)
            return {"text": "\n\n".join(pages), "filename": file.filename, "pages": len(pages)}

        elif filename.endswith(".docx"):
            try:
                from docx import Document as DocxDocument
            except ImportError:
                raise HTTPException(status_code=422, detail="python-docx not installed. Run: pip install python-docx")
            with tempfile.NamedTemporaryFile(suffix=".docx", delete=False) as tmp:
                tmp.write(content)
                tmp_path = tmp.name
            doc = DocxDocument(tmp_path)
            os.unlink(tmp_path)
            paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
            return {"text": "\n\n".join(paragraphs), "filename": file.filename}

        else:
            raise HTTPException(status_code=415, detail=f"Unsupported file type: {file.filename}. Supported: .txt, .pdf, .docx")

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to parse file: {e}")


# ─── Batch Extraction Endpoint ─────────────────────────────────────────────────

class BatchExtractItem(BaseModel):
    id: str
    text: str

class BatchExtractRequest(BaseModel):
    items: List[BatchExtractItem]
    prompt: str
    extraction_schema: List[SchemaField]
    model_id: str = "gemini-2.5-flash"
    api_key: SecretStr
    provider: str = "gemini"

@app.post("/api/extract-batch")
async def extract_batch(req: BatchExtractRequest):
    """Run schema-based extraction over multiple texts in parallel."""
    schema_desc = "\n".join(
        f"- {f.name} ({f.type}): {f.description}"
        for f in req.extraction_schema
    )
    system_prompt = f"""You are a precision data extraction engine.
Extract the following fields from the text and return ONLY valid JSON (no markdown fences).
If a field is not found, use null.

FIELDS:
{schema_desc}
"""

    key = req.api_key.get_secret_value()
    use_json = req.provider in ("gemini", "openai")

    async def process_one(item: BatchExtractItem) -> dict:
        full_prompt = f"{system_prompt}\n\nTEXT:\n{item.text}"
        try:
            raw = await asyncio.get_event_loop().run_in_executor(
                None,
                lambda: call_llm_with_retry(full_prompt, req.provider, req.model_id, key, json_mode=use_json)
            )
            try:
                data = json.loads(raw) if isinstance(raw, str) else raw
            except json.JSONDecodeError:
                data = clean_json_response(raw)
            return {"id": item.id, "success": True, "data": data}
        except Exception as e:
            return {"id": item.id, "success": False, "error": str(e), "data": {}}

    tasks = [process_one(item) for item in req.items]
    results = await asyncio.gather(*tasks)
    return {"results": list(results)}


# ─── CSV Export Helper ─────────────────────────────────────────────────────────

class ExportCSVRequest(BaseModel):
    rows: List[Dict[str, Any]]
    filename: str = "langextract_export"

@app.post("/api/export-csv")
async def export_csv(req: ExportCSVRequest):
    """Convert a list of dicts to a CSV file download."""
    import csv
    import io
    if not req.rows:
        raise HTTPException(status_code=400, detail="No rows to export")
    buf = io.StringIO()
    fieldnames = list(req.rows[0].keys())
    writer = csv.DictWriter(buf, fieldnames=fieldnames, extrasaction='ignore')
    writer.writeheader()
    writer.writerows(req.rows)
    buf.seek(0)
    safe_name = re.sub(r'[^\w\-]', '_', req.filename)
    return StreamingResponse(
        iter([buf.read()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{safe_name}.csv"'}
    )


# Serve explicit index.html on root
@app.get("/")
async def serve_index():
    index_path = FRONTEND_DIR / "index.html"
    if not index_path.exists():
        raise HTTPException(status_code=404, detail="index.html not found.")
    return FileResponse(index_path)

# Mount frontend
app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")
