# Agent-Native Architecture Review: LangExtract Studio

**Audit Date:** March 4, 2025  
**Codebase:** langextractt (LangExtract web app with Standard, Clinical, and Schema modes)

---

## Overall Score Summary

| Core Principle | Score | Percentage | Status |
|----------------|-------|------------|--------|
| Action Parity | 0/9 | 0% | ❌ |
| Tools as Primitives | 0/0 | N/A | ❌ |
| Context Injection | 0/6 | 0% | ❌ |
| Shared Workspace | 4/4 | 100% | ✅ |
| CRUD Completeness | 3/6 | 50% | ⚠️ |
| UI Integration | 5/6 | 83% | ✅ |
| Capability Discovery | 3/7 | 43% | ❌ |
| Prompt-Native Features | 10/12 | 83% | ✅ |

**Overall Agent-Native Score: 45%**

*(Excluding N/A Tools: 52% across 7 principles)*

### Status Legend
- ✅ Excellent (80%+)
- ⚠️ Partial (50–79%)
- ❌ Needs Work (<50%)

---

## Executive Summary

LangExtract Studio is a **user-initiated LLM extraction tool** with no autonomous agent. It excels at **Shared Workspace** (user and API share the same data), **UI Integration** (API responses update the UI immediately, including streaming for clinical mode), and **Prompt-Native Features** (most extraction behavior is defined in prompts). It lacks **Action Parity** and **Tools** (no agent tools or MCP), **Context Injection** (stateless, no app-state in prompts), and has partial **CRUD** and **Capability Discovery**.

---

## Top 10 Recommendations by Impact

| Priority | Action | Principle | Effort |
|----------|--------|-----------|--------|
| 1 | Add MCP server with tools: `extract`, `clinical_extract`, `parse_file`, `extract_structured`, `extract_batch`, `export_csv`, `list_providers` | Action Parity | High |
| 2 | Add in-app onboarding or "What you can do" section explaining Standard/Clinical/Schema modes | Capability Discovery | Medium |
| 3 | Expose schema templates (invoice, resume, contract, etc.) in Schema mode UI | Capability Discovery | Low |
| 4 | Add Update for History items, Prompts, and Structured batch files | CRUD Completeness | Medium |
| 5 | Derive `CLIN_SECTIONS` from prompt/schema to avoid duplication | Prompt-Native | Medium |
| 6 | Add in-app help link (docs, "How it works") | Capability Discovery | Low |
| 7 | Persist examples and schema fields to localStorage | CRUD Completeness | Low |
| 8 | Make non-Gemini extraction output format configurable | Prompt-Native | Medium |
| 9 | Add streaming for standard extraction (like clinical mode) | UI Integration | Medium |
| 10 | Remove redundant clinical call—parse streamed JSON instead of second API call | UI Integration | Low |

---

## What's Working Excellently

1. **Shared Workspace (100%)** – User and API operate on the same data. No sandbox isolation; results flow directly into state and DOM.

2. **Prompt-Native Features (83%)** – Clinical extraction, schema extraction, templates, and most behavior are defined in prompts. Changing behavior usually requires prompt edits, not code changes.

3. **UI Integration (83%)** – All API responses update the UI immediately. Clinical mode uses streaming (SSE-style) for incremental updates. No silent actions.

4. **Data Flow** – Clear path: User → state → API → LLM → response → state + DOM. Stateless API with ephemeral temp files.

5. **Full CRUD for Core Entities** – Examples, extractions, and schema fields have complete Create/Read/Update/Delete in the frontend.

---

## Detailed Findings by Principle

### 1. Action Parity (0/9 – 0%)

**User actions with no agent tools:**
- Standard extraction, Clinical extraction (stream + final), Parse file, Structured extraction, Batch extraction, Export CSV, Get providers

**Recommendation:** Add an MCP server or CLI so agents can invoke these actions via structured tools.

---

### 2. Tools as Primitives (N/A)

No agent tools exist. The codebase is a REST API + frontend, not an agent framework.

**Recommendation:** When adding tools, prefer primitives (`read`, `write`, `list`, `store`) over workflow tools.

---

### 3. Context Injection (0/6 – 0%)

No app-state context is injected into prompts:
- Available resources, user preferences, recent activity, capabilities, session history, workspace state – none injected

**Note:** The app is stateless and extraction-focused; each request is independent. This is appropriate for the current design.

---

### 4. Shared Workspace (4/4 – 100%)

All data stores are shared: localStorage, in-memory state, API request/response, DOM. No isolated agent data space.

---

### 5. CRUD Completeness (3/6 – 50%)

**Full CRUD:** Examples, Extractions, Schema fields  
**Missing Update:** History items, Prompts, Structured batch files  
**Read-only:** Providers

---

### 6. UI Integration (5/6 – 83%)

Backend responses propagate to the UI immediately. Clinical mode streams. No silent actions. Minor gap: standard extraction could stream like clinical.

---

### 7. Capability Discovery (3/7 – 43%)

**Present:** Capability hints (API key links, extract hints, info boxes), suggested prompts/templates, empty state guidance  
**Missing:** Onboarding, in-app help, schema templates in UI, slash commands (N/A for form-based app)

---

### 8. Prompt-Native Features (10/12 – 83%)

**Prompt-defined:** Clinical extraction, schema extraction, templates, LangExtract core  
**Code-defined:** Non-Gemini extraction format, `CLIN_SECTIONS` keys (duplicated from prompt)

---

## Appendix: Sub-Agent Audit IDs

- Action Parity: fa1a87aa-fa30-464d-bbf8-65f74af52ae4
- Tools as Primitives: 5febebb6-5c81-42d4-a40f-69297dcf2579
- Context Injection: 467d0c53-1a1e-49e7-a700-585594419125
- Shared Workspace: 9110a2ee-cad7-49cb-a500-a2ee33b488fd
- CRUD Completeness: e34b788c-2444-425e-bf3b-11289b95832f
- UI Integration: eb5929af-e2a4-4c35-9a2f-0d1134b2baa0
- Capability Discovery: 5827a812-8324-4d48-b41f-a9b5482cd72f
- Prompt-Native Features: 06b44031-32f4-42fe-99e8-1a01d2aa0cf6
