# CLAUDE.md — LangExtract Codebase Guide

This file provides essential context for AI assistants (Claude, Gemini, etc.)
working with the LangExtract codebase. It covers structure, conventions,
workflows, and important constraints.

---

## Project Overview

**LangExtract** (`langextract` on PyPI, v1.1.1) is a Google-maintained Python
library for extracting structured information from unstructured text using LLMs.
Key capabilities:

- Few-shot extraction with user-defined prompts and examples
- Precise source grounding (maps extractions to exact text spans)
- Support for multiple LLM providers (Gemini, OpenAI, Ollama, Claude, GLM)
- Batch processing for long documents
- Clinical EMR note structuring
- Schema-based structured extraction (Pydantic models)
- Plugin system for third-party LLM providers
- LangExtract Studio — full-stack web app (FastAPI + Vanilla JS)
- MCP server for AI agent integration

**License**: Apache-2.0
**Python**: 3.10, 3.11, 3.12
**Upstream repo**: https://github.com/google/langextract

---

## Repository Layout

```
Extract721/
├── langextract/              # Main library package
│   ├── __init__.py           # Lazy-loading public API entry point
│   ├── extraction.py         # Core extract() function
│   ├── factory.py            # ModelConfig + create_model() factory
│   ├── resolver.py           # Entity resolution & text alignment
│   ├── annotation.py         # AnnotatedDocument data structures
│   ├── chunking.py           # Text chunking for long documents
│   ├── prompting.py          # Prompt construction helpers
│   ├── visualization.py      # HTML visualization generation
│   ├── io.py                 # JSONL file I/O
│   ├── data.py               # Public data type re-exports (compat shim)
│   ├── schema.py             # Schema definitions
│   ├── registry.py           # Provider registry shim
│   ├── progress.py           # Progress tracking
│   ├── prompt_validation.py  # Prompt validation utilities
│   ├── exceptions.py         # Public exception classes
│   ├── tokenizer.py          # Tokenizer interface shim
│   ├── plugins.py            # Plugin loading system
│   ├── data_lib.py           # Data library utilities
│   ├── inference.py          # Backward-compat shim
│   ├── py.typed              # PEP 561 marker
│   ├── core/                 # Core abstractions (no provider imports allowed)
│   │   ├── base_model.py     # Abstract base class for LLM providers
│   │   ├── data.py           # Extraction, AnnotatedDocument, core types
│   │   ├── schema.py         # Schema validation
│   │   ├── tokenizer.py      # Tokenization implementation
│   │   ├── format_handler.py # Output format handling
│   │   ├── types.py          # Core type definitions
│   │   ├── exceptions.py     # Core exception hierarchy
│   │   └── debug_utils.py    # Debug utilities
│   ├── providers/            # LLM provider implementations
│   │   ├── gemini.py         # Google Gemini (primary provider)
│   │   ├── gemini_batch.py   # Vertex AI Batch API
│   │   ├── openai.py         # OpenAI (optional dep)
│   │   ├── ollama.py         # Ollama local models
│   │   ├── router.py         # Provider routing and registry
│   │   ├── builtin_registry.py  # Registers built-in providers
│   │   ├── patterns.py       # Model ID pattern matching
│   │   ├── README.md         # Provider development guide
│   │   └── schemas/          # Provider-specific Pydantic schemas
│   │       └── gemini.py
│   └── _compat/              # Backward compatibility shims
│       ├── inference.py
│       ├── exceptions.py
│       ├── schema.py
│       └── registry.py
├── api/                      # FastAPI app — Vercel serverless deployment
│   ├── index.py              # Main FastAPI application entry point
│   ├── models.py             # Pydantic request/response models
│   ├── llm.py                # LLM calling utilities with retry logic
│   ├── parsers.py            # PDF / DOCX file parsing
│   ├── prompts.py            # Clinical prompt templates
│   └── requirements.txt      # API-specific dependencies
├── backend/                  # FastAPI app — Render deployment
│   ├── main.py               # FastAPI application for Render
│   └── test_stream.py        # Streaming test
├── frontend/                 # LangExtract Studio web UI (Vanilla JS SPA)
│   ├── index.html            # Single-page application entry
│   ├── app.js                # Main JavaScript application
│   ├── styles.css            # Application CSS
│   └── js/                   # Modular JavaScript
│       ├── constants.js      # Configuration constants
│       ├── state.js          # Application state
│       ├── utils.js          # Utility functions
│       ├── history.js        # History management
│       ├── prompts.js        # Prompt templates
│       └── modes/            # Extraction mode handlers
│           ├── standard.js
│           ├── structured.js
│           └── clinical.js
├── tests/                    # pytest test suite (26 test modules)
│   ├── conftest.py           # Shared fixtures and configuration
│   └── *_test.py             # Test files (naming: <module>_test.py)
├── examples/                 # Usage examples
│   ├── custom_provider_plugin/  # Full example provider plugin package
│   ├── notebooks/            # Jupyter notebooks
│   └── ollama/               # Ollama integration example
├── benchmarks/               # Benchmark suite (4 Python files)
├── docs/                     # Additional documentation
│   └── examples/             # Longer examples (Romeo & Juliet, batch, etc.)
├── .github/                  # GitHub Actions workflows + templates
│   ├── workflows/            # CI/CD pipelines (11 YAML files)
│   ├── scripts/              # Automation scripts
│   └── ISSUE_TEMPLATE/       # Bug and feature request templates
├── mcp_server.py             # MCP server for AI agent integration
├── quick_start.py            # Quick validation script
├── verify-installation.py    # Installation verification
├── autoformat.sh             # Code auto-formatter script
├── pyproject.toml            # Project config (deps, pytest, pyink, isort)
├── tox.ini                   # Multi-env test matrix
├── .pylintrc                 # Pylint configuration (Google style)
├── .pre-commit-config.yaml   # Pre-commit hooks
├── requirements.txt          # Render deployment dependencies
├── Dockerfile                # Docker build configuration
├── render.yaml               # Render.com deployment config
└── vercel.json               # Vercel deployment routing config
```

---

## Development Setup

```bash
# Editable install with all extras
pip install -e ".[all,dev,test]"

# Or just the basics
pip install -e .

# Optional extras
pip install -e ".[openai]"   # OpenAI provider
pip install -e ".[mcp]"      # MCP server support
pip install -e ".[notebook]" # Jupyter notebooks

# Install pre-commit hooks
pre-commit install
```

---

## Key Commands

### Formatting

The project uses **Google's Python style** (80-char lines, 2-space indent).

```bash
# Run both isort + pyink on langextract/ and tests/
./autoformat.sh

# Format specific directories
./autoformat.sh langextract tests

# Run individually
isort langextract tests
pyink langextract tests --config pyproject.toml
```

### Linting

```bash
# Lint source code
pylint --rcfile=.pylintrc langextract

# Lint tests
pylint --rcfile=tests/.pylintrc tests

# Check import architecture constraints
lint-imports
```

### Testing

```bash
# Run all unit tests (excludes live API + pip-install tests)
pytest tests

# Run specific test file
pytest tests/resolver_test.py

# Run with coverage
pytest tests --cov=langextract

# Run only tests with a specific marker
pytest -m live_api           # Requires live API keys
pytest -m integration        # Integration tests
pytest -m "not live_api and not requires_pip"  # Safe for CI

# Full matrix via tox
tox                          # All environments
tox -e py311                 # Specific Python version
tox -e format                # Formatting check
tox -e lint-src              # Pylint on source
tox -e lint-tests            # Pylint on tests
tox -e live-api              # Live API tests (needs API keys)
tox -e ollama-integration    # Ollama integration
tox -e plugin-integration    # Plugin E2E tests
```

### Running the Application

```bash
# Vercel-style API server
uvicorn api.index:app --reload --port 8000

# Render-style backend
uvicorn backend.main:app --reload --port 8000

# MCP server (stdio transport, for Claude Desktop / Cursor)
python mcp_server.py
```

### Docker

```bash
docker build -t langextract .
docker run --rm -e LANGEXTRACT_API_KEY="your-api-key" langextract python quick_start.py
```

---

## Code Style Conventions

### Python Style

| Convention | Rule |
|---|---|
| Line length | 80 characters max |
| Indentation | **2 spaces** (not 4) |
| Formatter | `pyink` (Google's Black fork) |
| Import sorter | `isort` with `profile = "google"` |
| Quotes | Majority-quote style (per file convention) |

### File Header

Every Python source file must begin with:

```python
# Copyright 2025 Google LLC.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# ...

from __future__ import annotations
"""Module docstring."""
```

### Import Order

```python
from __future__ import annotations

# 1. Standard library
import json
import os
from typing import Any

# 2. Third-party
from absl import logging
import pandas as pd

# 3. Local (langextract)
from langextract.core import data
from langextract import annotation
```

### Naming Conventions

| Item | Convention | Example |
|---|---|---|
| Classes | `PascalCase` | `GeminiLanguageModel` |
| Functions/Methods | `snake_case` | `create_model`, `extract` |
| Constants | `UPPER_CASE` | `DEFAULT_MODEL_ID` |
| Private members | Leading `_` | `_cache`, `_load_plugins` |
| Type variables | `T`, `K`, `V` or `^T[A-Z]` | `T_co` |

### File Organization Order

1. Copyright header
2. `from __future__ import annotations`
3. Module-level docstring
4. Imports (stdlib → third-party → local)
5. `__all__` (for public API modules)
6. Constants
7. Classes and functions

---

## Architecture Constraints

The project enforces import boundaries via **import-linter** (configured in
`pyproject.toml`). Violations will fail CI.

| Rule | Meaning |
|---|---|
| `langextract.providers` ❌→ `langextract.inference` | Providers must not import the inference shim |
| `langextract.core` ❌→ `langextract.providers` | Core must not depend on providers |
| `langextract.core` ❌→ `langextract.annotation`, `.chunking`, `.prompting`, `.resolver` | Core must not import high-level modules |

**Dependency direction**: `core` ← `langextract.*` ← `providers`

---

## Testing Strategy

### Test File Naming

- Files: `*_test.py` (e.g., `resolver_test.py`, `annotation_test.py`)
- Classes: `Test*`
- Functions: `test_*`
- Fixtures and shared setup: `tests/conftest.py`

### Test Markers

| Marker | Usage |
|---|---|
| `live_api` | Requires live API keys (Gemini, OpenAI); excluded from default CI |
| `requires_pip` | Performs `pip install`/`pip uninstall`; excluded from default CI |
| `integration` | Tests multiple components together |

### Test Environments (tox.ini)

| Environment | Purpose |
|---|---|
| `py310`, `py311`, `py312` | Unit tests on each Python version |
| `format` | `isort` + `pyink` formatting check |
| `lint-src` | Pylint on `langextract/` |
| `lint-tests` | Pylint on `tests/` |
| `live-api` | Live API integration tests |
| `ollama-integration` | Ollama local model tests |
| `plugin-integration` | Plugin end-to-end tests |
| `plugin-smoke` | Plugin smoke tests |

---

## Provider System

### Built-in Providers

| Provider | Module | Model examples | Dep |
|---|---|---|---|
| Gemini | `langextract.providers.gemini` | `gemini-2.5-flash`, `gemini-1.5-pro` | `google-genai` (core) |
| Gemini Batch | `langextract.providers.gemini_batch` | Vertex AI batch jobs | `google-genai` (core) |
| OpenAI | `langextract.providers.openai` | `gpt-4o`, `gpt-4o-mini` | `pip install langextract[openai]` |
| Ollama | `langextract.providers.ollama` | Any local Ollama model | none (uses HTTP) |

Providers are discovered via Python entry points (`langextract.providers` group
in `pyproject.toml`). Third-party providers register using the same mechanism.

### Adding a New Provider

1. Create a package with a class extending `langextract.core.base_model.LanguageModel`
2. Register via entry points in your package's `pyproject.toml`
3. See `examples/custom_provider_plugin/` and `langextract/providers/README.md`

---

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `LANGEXTRACT_API_KEY` | Gemini API key (primary) | — |
| `GEMINI_API_KEY` | Alternative Gemini API key | — |
| `OPENAI_API_KEY` | OpenAI API key | — |
| `LANGEXTRACT_API_URL` | LangExtract API base URL | `http://localhost:8000` |
| `CORS_ORIGINS` | Allowed CORS origins | localhost only |
| `RATE_LIMIT_EXTRACT` | Rate limit for `/api/extract` | `30/minute` |
| `RATE_LIMIT_PARSE` | Rate limit for `/api/parse-file` | `60/minute` |
| `LANGEXTRACT_DISABLE_PLUGINS` | Disable provider plugin loading | unset |

---

## REST API Endpoints

Both `api/index.py` (Vercel) and `backend/main.py` (Render) expose:

| Endpoint | Method | Description |
|---|---|---|
| `/api/providers` | GET | List available providers and models |
| `/api/extract` | POST | Standard few-shot extraction |
| `/api/clinical-extract` | POST | Clinical/EMR extraction |
| `/api/clinical-extract-stream` | POST | Streaming clinical extraction |
| `/api/extract-structured` | POST | Schema-based extraction |
| `/api/extract-batch` | POST | Batch extraction over multiple texts |
| `/api/parse-file` | POST | Parse PDF / DOCX / TXT |
| `/api/export-csv` | POST | Convert extraction results to CSV |

---

## MCP Server Tools

Run `python mcp_server.py` to expose LangExtract via the Model Context Protocol.

| MCP Tool | Description |
|---|---|
| `langextract_list_providers` | List available LLM providers and models |
| `langextract_extract` | Standard few-shot text extraction |
| `langextract_clinical_extract` | Extract structured clinical data from EMR notes |
| `langextract_extract_structured` | Schema-based extraction |
| `langextract_extract_batch` | Batch extraction over multiple texts |
| `langextract_parse_file` | Extract text from PDF, DOCX, or TXT |
| `langextract_export_csv` | Convert list of dicts to CSV string |

---

## Deployment

### Vercel (Serverless)

- Config: `vercel.json`
- `/api/*` → `api/index.py` (FastAPI serverless function)
- `/*` → `frontend/` (static files)
- Deploy: `vercel --prod`

### Render (Persistent)

- Config: `render.yaml`
- Build: `pip install -r requirements.txt && pip install .`
- Start: `uvicorn backend.main:app --host 0.0.0.0 --port $PORT`

### Docker

- Config: `Dockerfile` (python:3.10-slim)
- Installs `langextract` from PyPI

---

## Common Development Tasks

### Adding a New Extraction Feature

1. Define data structures in `langextract/core/data.py` if needed
2. Implement logic in the appropriate module (e.g., `extraction.py`)
3. Add tests in `tests/<module>_test.py`
4. Update public API in `langextract/__init__.py` if needed
5. Run `./autoformat.sh` and `pylint` before committing

### Modifying Provider Behavior

1. Edit the provider class in `langextract/providers/`
2. Update provider schemas in `langextract/providers/schemas/` if needed
3. Run provider-specific tests
4. Test with Gemini and at least one other provider

### Adding API Endpoints

1. Add Pydantic models in `api/models.py`
2. Implement endpoint in `api/index.py` (and `backend/main.py` if needed)
3. Add corresponding tool in `mcp_server.py`
4. Update frontend in `frontend/js/` if needed
5. Add tests in `tests/api_test.py`

### Pre-commit Workflow

```bash
# Install once
pre-commit install

# Run manually (runs isort, pyink, yaml checks, etc.)
pre-commit run --all-files
```

---

## Debugging Tips

```python
# Enable debug logging
import logging
logging.basicConfig(level=logging.DEBUG)

# Enable extraction debug output
import langextract as lx
result = lx.extract(
    text="...",
    prompt_description="...",
    examples=[...],
    debug=True,
)

# Check which provider will be used
config = lx.factory.ModelConfig(model_id="gemini-2.5-flash")
model = lx.factory.create_model(config)
print(type(model))
```

---

## CI/CD

GitHub Actions workflows (`.github/workflows/`):

| Workflow | Trigger | Purpose |
|---|---|---|
| `ci.yaml` | Push / PR | Format check, lint, pytest (py310/311/312) |
| `publish.yml` | Tag push | Publish to PyPI |
| `zenodo-publish.yml` | Release | Publish to Zenodo for DOI |
| `check-pr-size.yml` | PR | Auto-label by diff size |
| `check-linked-issue.yml` | PR | Enforce linked issue requirement |
| `validate_pr_template.yaml` | PR | Ensure PR template is filled |
| `validate-community-providers.yaml` | PR | Validate community provider submissions |
| `check-infrastructure-changes.yml` | PR | Block contributor infra changes |
| `auto-update-pr.yaml` | PR | Auto-sync with main |

### PR Size Labels

| Label | Lines changed |
|---|---|
| `size/XS` | < 50 |
| `size/S` | 50–150 |
| `size/M` | 150–600 |
| `size/L` | 600–1000 |
| `size/XL` | > 1000 |

---

## Security Notes

- **Never commit API keys** — use environment variables or `.env` (gitignored)
- API keys in request models use Pydantic `SecretStr` for masking in logs
- CORS default is localhost only; configure `CORS_ORIGINS` for production
- File uploads are validated for allowed extensions (`.txt`, `.pdf`, `.docx`)
- Rate limiting is enforced by `slowapi` on all extraction endpoints
- Infrastructure files (workflows, `pyproject.toml`, etc.) are protected — only maintainers may modify them

---

## Key Resources

- **README**: `README.md` — user-facing docs, quick start, installation
- **AGENTS.md**: `AGENTS.md` — detailed guide for AI agents (overlaps with this file)
- **Contributing**: `CONTRIBUTING.md` — contribution process, PR guidelines
- **Provider guide**: `langextract/providers/README.md` — how to build providers
- **Community providers**: `COMMUNITY_PROVIDERS.md` — registry of third-party plugins
- **Examples**: `examples/` and `docs/examples/`
