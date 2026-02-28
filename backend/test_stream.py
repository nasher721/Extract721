import asyncio
import httpx
import json
import os
from dotenv import load_dotenv

load_dotenv(dotenv_path="/Users/nickasher/langextractt/backend/.env")
api_key = os.getenv("GEMINI_API_KEY")

async def test_stream():
    async with httpx.AsyncClient() as client:
        try:
            async with client.stream("POST", "http://127.0.0.1:8000/api/clinical-extract-stream", json={
                "note_text": "Patient is a 45 yo male with HTN.",
                "model_id": "gemini-2.5-flash",
                "api_key": api_key
            }) as response:
                print(f"Status: {response.status_code}")
                async for chunk in response.aiter_text():
                    print("Received:", repr(chunk))
                    if "event: end" in chunk:
                        break
        except Exception as e:
            print("Error:", e)

asyncio.run(test_stream())
