from pydantic import BaseModel, SecretStr
from typing import List, Dict, Any, Optional

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

class ExportCSVRequest(BaseModel):
    rows: List[Dict[str, Any]]
    filename: str = "langextract_export"
