# extract-equatorial vE3-refined

**Endpoints**
- `GET /health`
- `GET /logs`
- `POST /extract-hybrid` (multipart/form-data, campo **fatura** com o PDF)

**Ambiente (Render)**
- PORT: 10000
- USE_GPT: true|false (default false)
- OPENAI_API_KEY: sua chave, se usar GPT
- PRIMARY_MODEL: gpt-4o-mini
- FALLBACK_MODEL: gpt-5-mini
