# ATA Constitution
<!-- Autonomous Trade Agent — Multi-tenant WhatsApp e-commerce automation SaaS -->

## Core Principles

### I. Multi-Tenant Isolation (NON-NEGOTIABLE)
Every database query MUST be scoped to `tenant_id`. No query may touch data across tenants. Middleware (`TenantMiddleware`) injects `request.state.tenant_id` — every route and service must use it. A data leak between tenants is a critical bug, not a warning.

### II. Async-First Backend
All backend I/O is async (FastAPI + asyncpg + aioredis). No blocking calls (`time.sleep`, synchronous DB drivers, synchronous HTTP). If a library doesn't support async, wrap it in `asyncio.run_in_executor`.

### III. WhatsApp Webhook Reliability
Incoming WhatsApp webhooks must respond within 5 seconds (Meta requirement). Heavy processing (AI, Shopify API calls) must be offloaded asynchronously. Webhook failures must be logged with full payload for replay — never silently dropped.

### IV. Shopify as Source of Truth
Products, orders, and customers originate in Shopify. ATA mirrors and enriches this data — it never contradicts Shopify. Bulk upserts must be chunked (max 32,767 params per asyncpg query). Shopify webhooks are idempotent — re-processing must be safe.

### V. Frontend/Backend Contract
The Next.js frontend communicates exclusively via the REST API (`/dashboard/*`, `/auth/*`). No direct DB access from frontend. API responses follow a consistent shape: `{ data: ... }` for success, `{ error: "...", detail: "..." }` for errors.

### VI. Security Defaults
- JWT tokens scoped per tenant, validated on every protected route
- Secrets (API keys, tokens) stored encrypted in DB via `core/encryption.py` — never plaintext
- CORS must be locked to known origins before production (currently `*` for dev only)
- Internal IDs never exposed in public-facing WhatsApp messages

### VII. Simplicity Over Abstraction
No new abstraction layer without a concrete, present need. Three similar routes is better than a premature base class. Every added complexity must be justified by an actual requirement, not a hypothetical future one.

## Stack Constraints

- **Backend**: Python 3.11+, FastAPI, SQLAlchemy (async), asyncpg, Redis
- **Frontend**: Next.js 14+ (App Router), TypeScript, Tailwind CSS, shadcn/ui
- **DB**: PostgreSQL — migrations are raw SQL files in `db/migrations/`
- **Integrations**: Shopify (webhooks + REST), WhatsApp Business API (Meta), InstaPay, Vodafone Cash
- **AI**: Claude API via `services/ai_service.py` — intent classification + response generation

## Development Workflow

1. New feature → spec first (user stories + acceptance criteria)
2. Plan → identify affected files in backend AND frontend
3. Tasks → ordered by user story, checkpointed
4. Implementation → backend route + frontend page together, not separately
5. No feature is done until it works end-to-end (webhook → DB → dashboard)

## AI Model Handoff

The constitution alone is not enough for another AI model to work correctly. It defines the rules but not the current state. For a model to pick up a feature safely, three documents must exist together:

| Document | Provides |
|----------|----------|
| `constitution.md` | Rules and constraints (this file) |
| `specs/[feature]/spec.md` | What the feature must do (user stories, acceptance criteria) |
| `specs/[feature]/plan.md` + `tasks.md` | Technical details and ordered steps |

Without spec + plan + tasks, any model must read all the code from scratch and may violate the constitution unintentionally.

**Areas not yet documented outside the code** (highest risk for a new model):
- WhatsApp intent classification flow (`core/intent_classifier.py` + `handlers/`)
- Order confirmation state machine (PENDING → AWAITING_PAYMENT → CONFIRMED)
- Tenant session management (`core/session_manager.py`)

When a feature is complete, create a `spec.md` for it. This is more valuable than any other documentation.

## Governance

This constitution supersedes all other practices. Any deviation requires explicit justification in the PR description. The multi-tenant isolation principle (I) and webhook reliability principle (III) are absolute — no exceptions.

**Version**: 1.1.0 | **Ratified**: 2026-04-30 | **Last Amended**: 2026-04-30
