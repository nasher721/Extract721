from pydantic import BaseModel, SecretStr, field_validator, model_validator
from typing import List, Dict, Any, Optional

PROVIDERS = frozenset({"gemini", "openai", "claude", "glm"})
SCHEMA_TYPES = frozenset({"string", "number", "boolean", "array", "object"})


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

    @field_validator("text")
    @classmethod
    def text_not_empty(cls, v: str) -> str:
        if not (v and v.strip()):
            raise ValueError("Text cannot be empty")
        return v.strip()

    @field_validator("provider")
    @classmethod
    def provider_valid(cls, v: str) -> str:
        p = v.lower().strip()
        if p not in PROVIDERS:
            raise ValueError(f"Provider must be one of: {', '.join(sorted(PROVIDERS))}")
        return p


class ClinicalExtractRequest(BaseModel):
    note_text: str
    model_id: str = "gemini-2.5-flash"
    api_key: SecretStr
    provider: str = "gemini"

    @field_validator("note_text")
    @classmethod
    def note_text_not_empty(cls, v: str) -> str:
        if not (v and v.strip()):
            raise ValueError("Note text cannot be empty")
        return v.strip()

    @field_validator("provider")
    @classmethod
    def provider_valid(cls, v: str) -> str:
        p = v.lower().strip()
        if p not in PROVIDERS:
            raise ValueError(f"Provider must be one of: {', '.join(sorted(PROVIDERS))}")
        return p


class SchemaField(BaseModel):
    name: str
    type: str  # string, number, boolean, array, object
    description: str

    @field_validator("name")
    @classmethod
    def name_not_empty(cls, v: str) -> str:
        if not (v and v.strip()):
            raise ValueError("Schema field name cannot be empty")
        return v.strip()

    @field_validator("type")
    @classmethod
    def type_valid(cls, v: str) -> str:
        t = v.lower().strip()
        if t not in SCHEMA_TYPES:
            raise ValueError(f"Type must be one of: {', '.join(sorted(SCHEMA_TYPES))}")
        return t


class StructuredExtractRequest(BaseModel):
    text: str
    extraction_schema: List[SchemaField]
    model_id: str = "gemini-2.5-flash"
    api_key: SecretStr
    provider: str = "gemini"

    @field_validator("text")
    @classmethod
    def text_not_empty(cls, v: str) -> str:
        if not (v and v.strip()):
            raise ValueError("Text cannot be empty")
        return v.strip()

    @field_validator("extraction_schema")
    @classmethod
    def schema_not_empty(cls, v: List[SchemaField]) -> List[SchemaField]:
        if not v:
            raise ValueError("Extraction schema must have at least one field")
        return v

    @field_validator("provider")
    @classmethod
    def provider_valid(cls, v: str) -> str:
        p = v.lower().strip()
        if p not in PROVIDERS:
            raise ValueError(f"Provider must be one of: {', '.join(sorted(PROVIDERS))}")
        return p


class BatchExtractItem(BaseModel):
    id: str
    text: str

    @field_validator("text")
    @classmethod
    def text_not_empty(cls, v: str) -> str:
        if not (v and v.strip()):
            raise ValueError("Item text cannot be empty")
        return v.strip()


class BatchExtractRequest(BaseModel):
    items: List[BatchExtractItem]
    prompt: str
    extraction_schema: List[SchemaField]
    model_id: str = "gemini-2.5-flash"
    api_key: SecretStr
    provider: str = "gemini"

    @field_validator("items")
    @classmethod
    def items_not_empty(cls, v: List[BatchExtractItem]) -> List[BatchExtractItem]:
        if not v:
            raise ValueError("Items list cannot be empty")
        return v

    @field_validator("extraction_schema")
    @classmethod
    def schema_not_empty(cls, v: List[SchemaField]) -> List[SchemaField]:
        if not v:
            raise ValueError("Extraction schema must have at least one field")
        return v

    @field_validator("provider")
    @classmethod
    def provider_valid(cls, v: str) -> str:
        p = v.lower().strip()
        if p not in PROVIDERS:
            raise ValueError(f"Provider must be one of: {', '.join(sorted(PROVIDERS))}")
        return p


class ExportCSVRequest(BaseModel):
    rows: List[Dict[str, Any]]
    filename: str = "langextract_export"

    @field_validator("rows")
    @classmethod
    def rows_not_empty(cls, v: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        if not v:
            raise ValueError("Rows cannot be empty")
        return v

    @field_validator("filename")
    @classmethod
    def filename_safe(cls, v: str) -> str:
        return (v or "langextract_export").strip()[:64]
