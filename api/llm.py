import json
import os
import re
import time
from fastapi import HTTPException

# ─── API Key Resolution ───────────────────────────────────────────────────────

_PROVIDER_ENV_KEYS = {
    "gemini": "GEMINI_API_KEY",
    "openai": "OPENAI_API_KEY",
    "claude": "ANTHROPIC_API_KEY",
    "glm": "ZHIPUAI_API_KEY",
}


def resolve_api_key(provider: str, client_key: str) -> str:
    """
    Resolve API key: use client-provided key if non-empty, else fall back to env.
    Useful for production when keys are stored server-side.
    """
    key = (client_key or "").strip()
    if key:
        return key
    env_key = _PROVIDER_ENV_KEYS.get(provider.lower())
    if env_key:
        return (os.getenv(env_key) or "").strip()
    return ""


# ─── Model Catalogues ──────────────────────────────────────────────────────────

PROVIDER_MODELS = {
    "gemini": ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-1.5-flash", "gemini-1.5-pro"],
    "openai": ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"],
    "claude": ["claude-3-5-sonnet-20241022", "claude-3-opus-20240229", "claude-3-haiku-20240307"],
    "glm": ["glm-4", "glm-4-flash", "glm-4-air", "glm-4-plus"],
}

# ─── Unified LLM Caller ───────────────────────────────────────────────────────

def call_llm(prompt: str, provider: str, model_id: str, api_key: str,
             json_mode: bool = False, stream: bool = False):
    """
    Route a prompt to the correct LLM provider and return the response text.
    For streaming (Gemini only for now) returns the raw response object.
    Raises ValueError for unsupported providers.
    """
    provider = provider.lower().strip()

    if provider == "gemini":
        import google.generativeai as genai
        genai.configure(api_key=api_key)
        gen_config = {}
        if json_mode:
            gen_config["response_mime_type"] = "application/json"
        model = genai.GenerativeModel(model_id)
        if stream:
            return model.generate_content(prompt, stream=True, generation_config=gen_config)
        response = model.generate_content(prompt, generation_config=gen_config)
        text = (response.text or "").strip()
        if not text:
            raise ValueError("Gemini returned an empty response")
        return text

    elif provider == "openai":
        from openai import OpenAI
        client = OpenAI(api_key=api_key)
        messages = [{"role": "user", "content": prompt}]
        kwargs = {
            "model": model_id,
            "messages": messages,
        }
        if json_mode:
            kwargs["response_format"] = {"type": "json_object"}
        response = client.chat.completions.create(**kwargs)
        text = response.choices[0].message.content.strip() if response.choices else ""
        if not text:
            raise ValueError("OpenAI returned an empty response")
        return text

    elif provider == "claude":
        import anthropic
        client = anthropic.Anthropic(api_key=api_key)
        response = client.messages.create(
            model=model_id,
            max_tokens=4096,
            messages=[{"role": "user", "content": prompt}],
        )
        text = response.content[0].text.strip() if response.content else ""
        if not text:
            raise ValueError("Claude returned an empty response")
        return text

    elif provider == "glm":
        from zhipuai import ZhipuAI
        client = ZhipuAI(api_key=api_key)
        response = client.chat.completions.create(
            model=model_id,
            messages=[{"role": "user", "content": prompt}],
        )
        text = response.choices[0].message.content.strip() if response.choices else ""
        if not text:
            raise ValueError("GLM returned an empty response")
        return text

    else:
        raise ValueError(f"Unsupported provider: '{provider}'. Choose from: gemini, openai, claude, glm")


def clean_json_response(raw: str) -> dict:
    """Strip markdown fences and parse JSON from LLM output."""
    clean = re.sub(r'^```(?:json)?\s*', '', raw, flags=re.MULTILINE)
    clean = re.sub(r'\s*```$', '', clean, flags=re.MULTILINE)
    try:
        return json.loads(clean.strip())
    except json.JSONDecodeError as e:
        raise HTTPException(
            status_code=422,
            detail=f"Model returned invalid JSON — could not parse response: {e}"
        )


def require_api_key(provider: str, api_key: str) -> None:
    """Raise HTTPException if API key is missing after resolution."""
    if not api_key:
        raise HTTPException(
            status_code=400,
            detail=f"API key required for {provider}. Set it in the UI or via {_PROVIDER_ENV_KEYS.get(provider, 'provider env var')}.",
        )


def call_llm_with_retry(prompt: str, provider: str, model_id: str, api_key: str,
                        json_mode: bool = False, max_retries: int = 3) -> str:
    """call_llm wrapper with exponential backoff on 429/503."""
    delay = 2.0
    last_err = None
    for attempt in range(max_retries):
        try:
            return call_llm(prompt, provider, model_id, api_key, json_mode=json_mode)
        except Exception as e:
            msg = str(e).lower()
            if any(code in msg for code in ("429", "rate", "503", "overloaded")):
                last_err = e
                if attempt < max_retries - 1:
                    time.sleep(delay)
                    delay *= 2
            else:
                raise
    raise HTTPException(status_code=429, detail=f"Provider rate-limited after {max_retries} retries: {last_err}")
