# Agent Integration Guide

This document describes how AI agents can interact with LangExtract Studio.

## MCP Server (Recommended)

LangExtract exposes an **MCP (Model Context Protocol) server** so agents can invoke extraction tools.

### Setup

1. **Install with MCP support:**
   ```bash
   pip install -e ".[mcp]"
   ```

2. **Start the LangExtract API** (required for tools to work):
   ```bash
   uvicorn api.index:app --reload --port 8000
   ```

3. **Run the MCP server** (stdio transport for Cursor/Claude Desktop):
   ```bash
   python mcp_server.py
   ```

4. **Configure your agent** to use the MCP server. For Cursor, add to `.cursor/mcp.json`:
   ```json
   {
     "mcpServers": {
       "langextract": {
         "command": "python",
         "args": ["/path/to/langextractt/mcp_server.py"],
         "env": {
           "LANGEXTRACT_API_URL": "http://localhost:8000"
         }
       }
     }
   }
   ```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `LANGEXTRACT_API_URL` | `http://localhost:8000` | Base URL of the LangExtract API |
| `GEMINI_API_KEY` | — | API key for Gemini (or pass per-call) |

### Available Tools

| Tool | Description |
|------|-------------|
| `langextract_list_providers` | List available LLM providers and models |
| `langextract_extract` | Standard few-shot extraction (prompt + examples) |
| `langextract_clinical_extract` | Extract structured clinical data from EMR notes |
| `langextract_extract_structured` | Schema-based extraction (custom fields) |
| `langextract_extract_batch` | Batch schema extraction over multiple texts |
| `langextract_parse_file` | Extract text from PDF, DOCX, or TXT file (local path) |
| `langextract_export_csv` | Convert list of dicts to CSV string |

## REST API

Agents can also call the REST API directly:

- `GET /api/providers` — List providers
- `POST /api/extract` — Standard extraction
- `POST /api/clinical-extract` — Clinical extraction
- `POST /api/clinical-extract-stream` — Clinical (streaming)
- `POST /api/extract-structured` — Schema extraction
- `POST /api/extract-batch` — Batch extraction
- `POST /api/parse-file` — Parse PDF/DOCX/TXT (multipart)
- `POST /api/export-csv` — Export to CSV

See the API request models in `api/models.py` for payload shapes.
