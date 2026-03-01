import os
import tempfile
from fastapi import HTTPException, UploadFile

async def parse_upload_file(file: UploadFile) -> dict:
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
