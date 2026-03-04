#!/usr/bin/env python3
"""
LangExtract MCP Server — Exposes extraction tools for AI agents.

Run: python mcp_server.py
Or:  python -m mcp_server

Requires: pip install mcp
"""

import json
import os
import urllib.request
import urllib.error
from typing import Any

try:
    from mcp.server.fastmcp import FastMCP
except ImportError:
    raise ImportError(
        "MCP SDK required. Install with: pip install mcp"
    ) from None

mcp = FastMCP(
    "LangExtract",
    instructions="Tools for structured text extraction using LLMs. Supports standard NER, clinical EMR, and schema-based extraction.",
)

_BASE_URL = os.getenv("LANGEXTRACT_API_URL", "http://localhost:8000")


def _post(path: str, payload: dict, api_key: str | None = None) -> dict:
    """POST to the LangExtract API."""
    url = f"{_BASE_URL.rstrip('/')}{path}"
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        body = e.read().decode() if e.fp else ""
        try:
            err = json.loads(body)
            msg = err.get("detail", body)
        except json.JSONDecodeError:
            msg = body or str(e)
        raise RuntimeError(f"API error ({e.code}): {msg}") from e


def _get(path: str) -> dict:
    """GET from the LangExtract API."""
    url = f"{_BASE_URL.rstrip('/')}{path}"
    req = urllib.request.Request(url, method="GET")
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode())


@mcp.tool()
def langextract_list_providers() -> dict:
    """List available LLM providers and their models."""
    return _get("/api/providers")


@mcp.tool()
def langextract_extract(
    text: str,
    prompt: str,
    examples: list[dict],
    provider: str = "gemini",
    model_id: str = "gemini-2.5-flash",
    api_key: str = "",
) -> dict:
    """
    Standard few-shot extraction. Provide text, a prompt, and examples with
    extraction_class, extraction_text, and attributes.
    """
    api_key = api_key or os.getenv("GEMINI_API_KEY", "")
    return _post(
        "/api/extract",
        {
            "text": text,
            "prompt": prompt,
            "examples": examples,
            "provider": provider,
            "model_id": model_id,
            "api_key": api_key,
        },
    )


@mcp.tool()
def langextract_clinical_extract(
    note_text: str,
    provider: str = "gemini",
    model_id: str = "gemini-2.5-flash",
    api_key: str = "",
) -> dict:
    """
    Extract structured clinical data from an EMR note (HPI, vitals, labs, plan, etc.).
    """
    api_key = api_key or os.getenv("GEMINI_API_KEY", "")
    return _post(
        "/api/clinical-extract",
        {
            "note_text": note_text,
            "provider": provider,
            "model_id": model_id,
            "api_key": api_key,
        },
    )


@mcp.tool()
def langextract_extract_structured(
    text: str,
    extraction_schema: list[dict],
    provider: str = "gemini",
    model_id: str = "gemini-2.5-flash",
    api_key: str = "",
) -> dict:
    """
    Schema-based extraction. extraction_schema: list of {name, type, description}.
    Types: string, number, boolean, array, object.
    """
    api_key = api_key or os.getenv("GEMINI_API_KEY", "")
    return _post(
        "/api/extract-structured",
        {
            "text": text,
            "extraction_schema": extraction_schema,
            "provider": provider,
            "model_id": model_id,
            "api_key": api_key,
        },
    )


@mcp.tool()
def langextract_extract_batch(
    items: list[dict],
    extraction_schema: list[dict],
    provider: str = "gemini",
    model_id: str = "gemini-2.5-flash",
    api_key: str = "",
) -> dict:
    """
    Batch schema extraction. items: list of {id, text}. extraction_schema: list of {name, type, description}.
    """
    api_key = api_key or os.getenv("GEMINI_API_KEY", "")
    return _post(
        "/api/extract-batch",
        {
            "items": items,
            "prompt": "",
            "extraction_schema": extraction_schema,
            "provider": provider,
            "model_id": model_id,
            "api_key": api_key,
        },
    )


@mcp.tool()
def langextract_export_csv(rows: list[dict], filename: str = "langextract_export") -> str:
    """
    Convert a list of dicts to CSV. Returns the CSV content as a string.
    """
    url = f"{_BASE_URL.rstrip('/')}/api/export-csv"
    data = json.dumps({"rows": rows, "filename": filename}).encode("utf-8")
    req = urllib.request.Request(
        url, data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.read().decode("utf-8")


@mcp.tool()
def langextract_parse_file(file_path: str) -> dict:
    """
    Extract text from a PDF, DOCX, or TXT file. Pass the local file path.
    Returns {text, filename, pages?}.
    """
    import mimetypes
    path = os.path.expanduser(file_path)
    if not os.path.isfile(path):
        raise FileNotFoundError(f"File not found: {path}")
    filename = os.path.basename(path)
    with open(path, "rb") as f:
        content = f.read()
    # Build multipart form
    boundary = "----WebKitFormBoundary" + os.urandom(16).hex()
    body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'
        f"Content-Type: {mimetypes.guess_type(filename)[0] or 'application/octet-stream'}\r\n\r\n"
    ).encode() + content + f"\r\n--{boundary}--\r\n".encode()
    url = f"{_BASE_URL.rstrip('/')}/api/parse-file"
    req = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode())


if __name__ == "__main__":
    mcp.run(transport="stdio")
