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
import sys

# Resolve paths relative to this file
API_DIR = Path(__file__).resolve().parent
BASE_DIR = API_DIR.parent
FRONTEND_DIR = BASE_DIR / "frontend"

# Ensure local package can be imported
if str(BASE_DIR) not in sys.path:
    sys.path.append(str(BASE_DIR))
if str(API_DIR) not in sys.path:
    sys.path.append(str(API_DIR))

import langextract as lx
from models import (
    ExtractRequest, ClinicalExtractRequest, StructuredExtractRequest,
    BatchExtractItem, BatchExtractRequest, ExportCSVRequest, SchemaField
)
from prompts import CLINICAL_PROMPT_TEMPLATE
from llm import PROVIDER_MODELS, call_llm_with_retry, clean_json_response
from parsers import parse_upload_file

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
    return await parse_upload_file(file)


# ─── Batch Extraction Endpoint ─────────────────────────────────────────────────

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
