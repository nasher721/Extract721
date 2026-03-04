# Copyright 2025 Google LLC.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

"""Tests for the web API endpoints."""

import pytest

# conftest.py ensures api/ and project root are on sys.path
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    """Create test client for the API."""
    from index import app  # noqa: E402
    return TestClient(app)


def test_get_providers(client):
    """GET /api/providers returns provider model list."""
    resp = client.get("/api/providers")
    assert resp.status_code == 200
    data = resp.json()
    assert "providers" in data
    assert "gemini" in data["providers"]
    assert "openai" in data["providers"]


def test_extract_validates_empty_text(client):
    """POST /api/extract rejects empty text."""
    payload = {
        "text": "   ",
        "prompt": "Extract entities",
        "examples": [],
        "model_id": "gemini-2.5-flash",
        "api_key": "fake-key",
        "provider": "gemini",
    }
    resp = client.post("/api/extract", json=payload)
    assert resp.status_code == 422


def test_extract_validates_invalid_provider(client):
    """POST /api/extract rejects invalid provider."""
    payload = {
        "text": "Some text to analyze",
        "prompt": "Extract entities",
        "examples": [],
        "model_id": "gemini-2.5-flash",
        "api_key": "fake-key",
        "provider": "invalid_provider",
    }
    resp = client.post("/api/extract", json=payload)
    assert resp.status_code == 422


def test_clinical_extract_validates_empty_note(client):
    """POST /api/clinical-extract rejects empty note."""
    payload = {
        "note_text": "",
        "model_id": "gemini-2.5-flash",
        "api_key": "fake-key",
        "provider": "gemini",
    }
    resp = client.post("/api/clinical-extract", json=payload)
    assert resp.status_code == 422


def test_extract_structured_validates_empty_schema(client):
    """POST /api/extract-structured rejects empty schema."""
    payload = {
        "text": "Patient John has diabetes.",
        "extraction_schema": [],
        "model_id": "gemini-2.5-flash",
        "api_key": "fake-key",
        "provider": "gemini",
    }
    resp = client.post("/api/extract-structured", json=payload)
    assert resp.status_code == 422


def test_export_csv_validates_empty_rows(client):
    """POST /api/export-csv rejects empty rows."""
    payload = {"rows": [], "filename": "test"}
    resp = client.post("/api/export-csv", json=payload)
    assert resp.status_code == 422


def test_export_csv_success(client):
    """POST /api/export-csv returns CSV for valid rows."""
    payload = {
        "rows": [{"name": "Alice", "age": 30}, {"name": "Bob", "age": 25}],
        "filename": "test_export",
    }
    resp = client.post("/api/export-csv", json=payload)
    assert resp.status_code == 200
    assert "text/csv" in resp.headers.get("content-type", "")
    assert "name" in resp.text and "age" in resp.text
