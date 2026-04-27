# ATA — Autonomous Trade Agent

Multi-tenant SaaS that automates e-commerce customer service and grows revenue with AI.

Each merchant (tenant) gets:
- Their own Shopify + WhatsApp Business connection
- Unique webhook URLs (`/webhook/shopify/{tenant_id}`, `/webhook/whatsapp/{tenant_id}`)
- An isolated, brand-aware AI assistant powered by Claude
- InstaPay + Vodafone Cash receipt verification

## Repo layout

```
ataproject/
├── backend/        FastAPI service (Python 3.11+)
├── frontend/       Reserved for the merchant dashboard (TBD)
└── db/migrations/  Alembic migrations (TBD)
```

## Backend quick start

```bash
cd backend
python -m venv .venv
source .venv/Scripts/activate     # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env              # then fill in real values
uvicorn main:app --reload
```

The API will be on `http://localhost:8000`. Interactive docs at `/docs`.

## Tech stack

- FastAPI + Uvicorn
- SQLAlchemy 2.x async + asyncpg + Alembic
- PostgreSQL + Redis
- Anthropic Claude (`claude-sonnet-4-20250514`)
- WhatsApp Business Cloud API
- Shopify REST Admin API

## Multi-tenancy invariants

- Every table has a `tenant_id` column
- Every request is JWT-authenticated and the middleware injects `request.state.tenant_id`
- Webhook URLs are tenant-scoped and HMAC-verified
- Redis session keys are namespaced: `sessions:{tenant_id}:{customer_phone}`
