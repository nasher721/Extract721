# LangExtract Agent Guide

This document provides essential information for AI agents working with the LangExtract codebase.

## Project Overview

**LangExtract** is a Python library that uses Large Language Models (LLMs) to extract structured information from unstructured text documents. It provides precise source grounding (mapping extractions to exact text locations), reliable structured outputs, and optimized processing for long documents.

Key capabilities:
- Few-shot extraction with user-defined prompts and examples
- Interactive HTML visualization of extraction results
- Support for multiple LLM providers (Gemini, OpenAI, Ollama, Claude, GLM)
- Batch processing and parallel execution
- Clinical EMR note structuring
- Schema-based structured extraction
- Plugin system for custom providers

## Technology Stack

- **Language**: Python 3.10+
- **Core Dependencies**:
  - `google-genai` - Gemini API integration
  - `pydantic` - Data validation and serialization
  - `pandas`, `numpy` - Data processing
  - `absl-py` - Logging
  - `PyYAML` - Configuration parsing
  - `tqdm` - Progress bars
  - `regex` - Advanced text matching

- **API/Backend**:
  - `fastapi` - Web framework
  - `uvicorn` - ASGI server
  - `slowapi` - Rate limiting
  - `pydantic` v2 - Request/response models

- **Optional Dependencies**:
  - `openai` - OpenAI provider support (`pip install langextract[openai]`)
  - `mcp` - MCP server support (`pip install langextract[mcp]`)

- **Frontend**: Vanilla HTML/CSS/JavaScript (single-page application)

## Project Structure

```
langextractt/
├── langextract/              # Main library package
│   ├── __init__.py           # Package entry with lazy loading
│   ├── extraction.py         # Main extract() function
│   ├── factory.py            # Model factory for provider instantiation
│   ├── resolver.py           # Entity resolution and alignment
│   ├── annotation.py         # Annotation data structures
│   ├── chunking.py           # Text chunking strategies
│   ├── prompting.py          # Prompt construction
│   ├── visualization.py      # HTML visualization generation
│   ├── io.py                 # File I/O operations
│   ├── data.py               # Public data types
│   ├── schema.py             # Schema definitions
│   ├── registry.py           # Provider registry
│   ├── core/                 # Core abstractions
│   │   ├── base_model.py     # Base model classes
│   │   ├── data.py           # Core data types
│   │   ├── schema.py         # Schema validation
│   │   ├── tokenizer.py      # Text tokenization
│   │   ├── format_handler.py # Output format handling
│   │   └── exceptions.py     # Custom exceptions
│   ├── providers/            # LLM provider implementations
│   │   ├── gemini.py         # Google Gemini provider
│   │   ├── openai.py         # OpenAI provider
│   │   ├── ollama.py         # Ollama local models
│   │   ├── gemini_batch.py   # Gemini batch API
│   │   ├── router.py         # Provider routing/registry
│   │   ├── builtin_registry.py  # Built-in provider registration
│   │   └── schemas/          # Provider-specific schemas
│   └── _compat/              # Backward compatibility modules
├── api/                      # FastAPI application (Vercel deployment)
│   ├── index.py              # Main API entry point
│   ├── models.py             # Pydantic request/response models
│   ├── llm.py                # LLM calling utilities
│   ├── parsers.py            # File parsing (PDF, DOCX)
│   └── prompts.py            # Clinical prompt templates
├── backend/                  # Alternative backend (Render deployment)
│   └── main.py               # FastAPI app for Render
├── frontend/                 # Web UI
│   ├── index.html            # Main HTML page
│   ├── app.js                # JavaScript application
│   └── styles.css            # CSS styles
├── tests/                    # Test suite
│   ├── *_test.py             # Unit tests (pytest naming convention)
│   └── conftest.py           # Pytest configuration
├── mcp_server.py             # MCP server for AI agent integration
├── pyproject.toml            # Project configuration
├── tox.ini                   # Test environments configuration
├── .pylintrc                 # Pylint configuration
├── .pre-commit-config.yaml   # Pre-commit hooks
├── autoformat.sh             # Code formatting script
├── vercel.json               # Vercel deployment config
├── render.yaml               # Render deployment config
└── Dockerfile                # Docker build configuration
```

## Build and Development Commands

### Installation

```bash
# Basic installation
pip install -e .

# With all optional dependencies
pip install -e ".[all]"

# Development installation (includes linting tools)
pip install -e ".[dev]"

# Testing installation
pip install -e ".[test]"

# Full development setup
pip install -e ".[all,dev,test]"
```

### Code Formatting

The project uses Google's Python style guide with 80-character line limit and 2-space indentation.

```bash
# Run all formatters (isort + pyink + pre-commit hooks)
./autoformat.sh

# Format specific directories
./autoformat.sh langextract tests

# Run formatters individually
isort langextract tests
pyink langextract tests --config pyproject.toml
```

### Linting

```bash
# Run pylint on source code
pylint --rcfile=.pylintrc langextract

# Run pylint on tests
pylint --rcfile=tests/.pylintrc tests
```

### Testing

```bash
# Run all tests (excluding live API tests)
pytest tests

# Run specific test file
pytest tests/extraction_test.py

# Run with coverage
pytest tests --cov=langextract

# Run live API tests (requires API key)
pytest tests/test_live_api.py -v -m live_api

# Run Ollama integration tests
pytest tests/test_ollama_integration.py -v

# Run full test matrix (via tox)
tox

# Run specific tox environment
tox -e py311
tox -e lint-src
tox -e format
```

### Running the API Server

```bash
# Start the LangExtract API (required for MCP tools)
uvicorn api.index:app --reload --port 8000

# Or use the backend version
uvicorn backend.main:app --reload --port 8000
```

### MCP Server

```bash
# Run the MCP server (stdio transport for Cursor/Claude Desktop)
python mcp_server.py
```

## Code Style Guidelines

### Python Style

- **Line length**: 80 characters maximum
- **Indentation**: 2 spaces (not 4)
- **Quotes**: Use majority quotes (single or double based on file convention)
- **Imports**: Sorted by isort with Google profile, single-line imports preferred

### Import Organization

```python
from __future__ import annotations
# Copyright header

# Standard library imports
import json
import os
from typing import Any, List

# Third-party imports
from absl import logging
import pandas as pd

# Local imports
from langextract.core import data
from langextract import annotation
```

### Naming Conventions

- **Classes**: `PascalCase` (e.g., `AnnotatedDocument`, `GeminiLanguageModel`)
- **Functions/Methods**: `snake_case` (e.g., `extract`, `create_model`)
- **Constants**: `UPPER_CASE` (e.g., `DEFAULT_MODEL_ID`)
- **Private members**: Leading underscore (e.g., `_cache`, `_load_plugins`)
- **Type variables**: `T`, `T_co`, `K`, `V` or `^T[A-Z]` pattern

### File Organization

1. Copyright header
2. `from __future__ import annotations`
3. Docstring (module-level)
4. Imports (standard lib, third-party, local)
5. `__all__` definition for public API
6. Constants
7. Classes and functions

### Architecture Constraints

The project enforces architectural boundaries via import-linter:

- **Providers must not import inference**: `langextract.providers` → `langextract.inference` (forbidden)
- **Core must not import providers**: `langextract.core` → `langextract.providers` (forbidden)
- **Core must not import high-level modules**: `langextract.core` → `langextract.annotation`, `chunking`, `prompting`, `resolver` (forbidden)

## Testing Strategy

### Test Organization

- Tests use pytest with `*_test.py` naming convention
- Unit tests in `tests/` directory
- Test configuration in `pyproject.toml` under `[tool.pytest.ini_options]`

### Test Markers

- `live_api`: Tests requiring live API access (Gemini, OpenAI)
- `requires_pip`: Tests that perform pip install/uninstall operations
- `integration`: Integration tests testing multiple components

### Running Specific Test Categories

```bash
# Skip live API tests (default)
pytest -m "not live_api and not requires_pip"

# Run only live API tests
pytest -m live_api

# Run integration tests
pytest -m integration
```

### Test Environments (tox)

- `py310`, `py311`, `py312`: Unit tests on Python 3.10/3.11/3.12
- `format`: Import sorting and code formatting checks
- `lint-src`: Pylint on source code
- `lint-tests`: Pylint on tests
- `live-api`: Live API integration tests
- `ollama-integration`: Ollama integration tests
- `plugin-integration`: Plugin E2E tests

## Deployment Processes

### Vercel Deployment

Configured via `vercel.json`:
- `/api/*` routes to `/api/index.py`
- All other routes serve static files from `/frontend/`

```bash
# Deploy to Vercel
vercel --prod
```

### Render Deployment

Configured via `render.yaml`:
- Build command: `pip install --upgrade pip && pip install -r requirements.txt && pip install .`
- Start command: `uvicorn backend.main:app --host 0.0.0.0 --port $PORT`

### Docker

```bash
# Build Docker image
docker build -t langextract .

# Run with API key
docker run --rm -e LANGEXTRACT_API_KEY="your-api-key" langextract python your_script.py
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `LANGEXTRACT_API_KEY` | API key for Gemini (primary) | — |
| `GEMINI_API_KEY` | Alternative API key for Gemini | — |
| `OPENAI_API_KEY` | API key for OpenAI | — |
| `LANGEXTRACT_API_URL` | Base URL for LangExtract API | `http://localhost:8000` |
| `CORS_ORIGINS` | Allowed CORS origins | `http://localhost:8000,http://127.0.0.1:8000` |
| `RATE_LIMIT_EXTRACT` | Rate limit for extract endpoint | `30/minute` |
| `RATE_LIMIT_PARSE` | Rate limit for parse-file endpoint | `60/minute` |
| `LANGEXTRACT_DISABLE_PLUGINS` | Disable provider plugin loading | — |

## Provider System Architecture

LangExtract uses a plugin-based provider system for LLM support:

### Built-in Providers

1. **Gemini** (`langextract.providers.gemini`): Primary provider with full feature support
2. **Ollama** (`langextract.providers.ollama`): Local model support
3. **OpenAI** (`langextract.providers.openai`): Optional dependency (`pip install langextract[openai]`)

### Provider Registration

Providers are registered via entry points in `pyproject.toml`:

```toml
[project.entry-points."langextract.providers"]
gemini = "langextract.providers.gemini:GeminiLanguageModel"
ollama = "langextract.providers.ollama:OllamaLanguageModel"
openai = "langextract.providers.openai:OpenAILanguageModel"
```

Third-party providers can register using the same entry point group.

### Adding a New Provider

See `langextract/providers/README.md` and use the helper script:

```bash
python scripts/create_provider_plugin.py MyProvider --with-schema
```

## MCP Server (AI Agent Integration)

LangExtract exposes an MCP server for AI agent integration.

### Setup

```bash
# Install with MCP support
pip install -e ".[mcp]"

# Start the API server
uvicorn api.index:app --reload --port 8000

# Run MCP server
python mcp_server.py
```

### Available MCP Tools

| Tool | Description |
|------|-------------|
| `langextract_list_providers` | List available LLM providers and models |
| `langextract_extract` | Standard few-shot extraction |
| `langextract_clinical_extract` | Extract structured clinical data from EMR notes |
| `langextract_extract_structured` | Schema-based extraction |
| `langextract_extract_batch` | Batch schema extraction over multiple texts |
| `langextract_parse_file` | Extract text from PDF, DOCX, or TXT file |
| `langextract_export_csv` | Convert list of dicts to CSV string |

### REST API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/providers` | GET | List providers |
| `/api/extract` | POST | Standard extraction |
| `/api/clinical-extract` | POST | Clinical extraction |
| `/api/clinical-extract-stream` | POST | Clinical extraction (streaming) |
| `/api/extract-structured` | POST | Schema extraction |
| `/api/extract-batch` | POST | Batch extraction |
| `/api/parse-file` | POST | Parse PDF/DOCX/TXT |
| `/api/export-csv` | POST | Export to CSV |

## Security Considerations

### API Key Handling

- API keys should never be committed to version control
- Use environment variables or `.env` files for local development
- API keys in API requests use Pydantic `SecretStr` for masking
- Add `.env` to `.gitignore`

### CORS Configuration

- Default CORS only allows localhost origins
- Never use wildcard (`*`) with credentials enabled
- Configure `CORS_ORIGINS` environment variable for production

### Rate Limiting

- API endpoints have rate limiting via slowapi
- Default: 30 requests/minute for extract, 60/minute for parse-file
- Configurable via `RATE_LIMIT_EXTRACT` and `RATE_LIMIT_PARSE`

### Input Validation

- All API endpoints use Pydantic models for request validation
- File uploads are validated for allowed extensions (.txt, .pdf, .docx)
- Maximum file size enforced by hosting platform

## Common Development Tasks

### Adding a New Extraction Feature

1. Define data structures in `langextract/core/data.py` if needed
2. Implement logic in appropriate module (e.g., `extraction.py`)
3. Add tests in `tests/` following naming convention
4. Update public API in `langextract/__init__.py` if needed
5. Run `./autoformat.sh` and `pylint` before committing

### Modifying Provider Behavior

1. Edit provider class in `langextract/providers/`
2. Update provider schema in `langextract/providers/schemas/` if needed
3. Run provider-specific tests
4. Test with both Gemini and at least one other provider

### Adding API Endpoints

1. Add Pydantic models in `api/models.py`
2. Implement endpoint in `api/index.py`
3. Add corresponding tool in `mcp_server.py`
4. Update frontend JS in `frontend/app.js` if needed
5. Add tests in `tests/api_test.py`

### Pre-commit Checks

```bash
# Install pre-commit hooks
pre-commit install

# Run manually on all files
pre-commit run --all-files
```

## Debugging Tips

### Enable Debug Logging

```python
import logging
logging.basicConfig(level=logging.DEBUG)
```

### View Extraction Details

```python
import langextract as lx

result = lx.extract(
    text="...",
    prompt_description="...",
    examples=[...],
    debug=True  # Enables verbose output
)
```

### Test Provider Resolution

```python
import langextract as lx

# Check which provider will be used
config = lx.factory.ModelConfig(model_id="gemini-2.5-flash")
model = lx.factory.create_model(config)
print(type(model))
```

## Resources

- **Main Repository**: https://github.com/google/langextract
- **Documentation**: https://github.com/google/langextract/blob/main/README.md
- **Issue Tracker**: https://github.com/google/langextract/issues
- **Contributing Guide**: [CONTRIBUTING.md](./CONTRIBUTING.md)
- **Provider System**: [langextract/providers/README.md](./langextract/providers/README.md)
- **Community Providers**: [COMMUNITY_PROVIDERS.md](./COMMUNITY_PROVIDERS.md)
