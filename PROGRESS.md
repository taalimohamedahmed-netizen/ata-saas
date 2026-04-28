# ATA — سجل التقدم والذاكرة

> **آخر تحديث:** 2026-04-28
> هذا الملف يوثق كل ما تم بناؤه في المشروع خطوة بخطوة. يُحدَّث مع كل تغيير جوهري.

---

## نظرة عامة على المشروع

**ATA (Autonomous Trade Agent)** — منصة SaaS متعدد المستأجرين (multi-tenant) تربط متجر Shopify بـ WhatsApp Business وتستخدم Claude AI للرد التلقائي على العملاء وإدارة الطلبات.

**الرابط المباشر:**
- Frontend: `https://saas.ataproject.cloud`
- Backend API: `https://api.ataproject.cloud`
- GitHub: `https://github.com/taalimohamedahmed-netizen/ata-saas`
- Hosting: EasyPanel VPS

---

## المكدس التقني (Tech Stack)

| الطبقة | التقنية |
|--------|---------|
| Backend | FastAPI (Python 3.12) + SQLAlchemy async |
| Database | PostgreSQL (asyncpg) / SQLite (dev) |
| Cache | Redis |
| Frontend | Next.js 15 (App Router) + TypeScript + Tailwind |
| AI | Anthropic Claude (anthropic SDK) |
| Auth | JWT (python-jose) + bcrypt |
| Encryption | Fernet symmetric (cryptography lib) |
| HTTP Client | httpx (async) |
| Deployment | EasyPanel + Docker |

---

## هيكل الملفات

```
ataproject/
├── backend/
│   ├── main.py                    # FastAPI entrypoint + routers
│   ├── requirements.txt
│   ├── core/
│   │   ├── auth.py                # JWT + TenantMiddleware + get_current_tenant
│   │   ├── database.py            # DB engine + migrations + Redis
│   │   ├── encryption.py          # Fernet encrypt/decrypt
│   │   ├── brand_guardrails.py
│   │   ├── intent_classifier.py
│   │   └── session_manager.py
│   ├── models/
│   │   ├── tenant.py              # جدول tenants (الرئيسي)
│   │   ├── customer.py
│   │   ├── order.py
│   │   └── conversation.py
│   ├── routes/
│   │   ├── auth.py                # /auth/register + /auth/login
│   │   ├── integrations.py        # /integrations/shopify/* + /integrations/whatsapp/*
│   │   ├── webhook.py             # /webhook/shopify/{tenant_id}/...
│   │   ├── whatsapp.py            # /webhook/whatsapp/{tenant_id}
│   │   └── dashboard.py           # /dashboard/*
│   ├── services/
│   │   ├── shopify_service.py     # Shopify API calls + webhook management
│   │   ├── whatsapp_service.py    # WhatsApp Business API
│   │   ├── ai_service.py          # Claude integration
│   │   └── payment_service.py
│   └── handlers/
│       └── order_handler.py       # منطق معالجة الطلبات الجديدة
│
└── frontend/
    └── src/
        ├── app/
        │   ├── (auth)/            # /login + /register
        │   └── (dashboard)/
        │       └── dashboard/
        │           ├── page.tsx                        # /dashboard (الرئيسية)
        │           └── settings/
        │               ├── layout.tsx                  # sidebar الإعدادات
        │               └── integrations/
        │                   └── page.tsx                # /dashboard/settings/integrations
        ├── lib/
        │   ├── api.ts             # axios instance
        │   ├── auth.ts            # login/register API calls
        │   ├── integrations.ts    # Shopify + WhatsApp API calls
        │   └── utils.ts
        └── store/
            └── auth-store.ts      # Zustand auth state
```

---

## قاعدة البيانات — جدول `tenants`

| العمود | النوع | الوصف |
|--------|-------|-------|
| `id` | INT PK | |
| `name` | VARCHAR(120) | اسم التاجر |
| `email` | VARCHAR(180) UNIQUE | |
| `password_hash` | VARCHAR(255) | bcrypt |
| `plan` | ENUM | basic / pro / enterprise |
| `shopify_token` | TEXT | access token (Fernet encrypted) |
| `shopify_domain` | VARCHAR(180) | e.g. `mystore.myshopify.com` |
| `shopify_client_id` | VARCHAR(100) | Client ID من Shopify Partners |
| `shopify_client_secret` | TEXT | Client Secret (Fernet encrypted) |
| `shopify_webhook_secret` | VARCHAR(255) | |
| `shopify_webhook_orders_id` | VARCHAR(50) | Shopify webhook ID |
| `shopify_webhook_products_id` | VARCHAR(50) | |
| `shopify_webhook_customers_id` | VARCHAR(50) | |
| `shopify_connected_at` | TIMESTAMPTZ | |
| `whatsapp_token` | TEXT | (Fernet encrypted) |
| `whatsapp_phone_id` | VARCHAR(120) | Phone Number ID |
| `whatsapp_phone_number` | VARCHAR(30) | |
| `whatsapp_waba_id` | VARCHAR(50) | WhatsApp Business Account ID |
| `whatsapp_verify_token` | VARCHAR(120) | للـ webhook verification |
| `whatsapp_connected_at` | TIMESTAMPTZ | |
| `brand_name` | VARCHAR(120) | |
| `brand_tone` | VARCHAR(255) | |
| `brand_policies` | TEXT | |
| `instapay_number` | VARCHAR(40) | |
| `vodafone_number` | VARCHAR(40) | |
| `is_active` | BOOLEAN | |
| `created_at` | TIMESTAMPTZ | |

---

## API Endpoints

### Auth — `/auth`
| Method | Path | Auth | الوصف |
|--------|------|------|-------|
| POST | `/auth/register` | Public | تسجيل تاجر جديد |
| POST | `/auth/login` | Public | تسجيل دخول → JWT |

### Shopify — `/integrations/shopify`
| Method | Path | Auth | الوصف |
|--------|------|------|-------|
| POST | `/shopify/oauth/start` | JWT | احفظ Client ID+Secret → أرجع redirect URL |
| GET | `/shopify/oauth/callback` | Public | Shopify يبعت هنا بعد الموافقة |
| GET | `/shopify/status` | JWT | حالة الاتصال والـ webhooks |
| POST | `/shopify/webhooks/retry` | JWT | إعادة تسجيل الـ webhooks |

### WhatsApp — `/integrations/whatsapp`
| Method | Path | Auth | الوصف |
|--------|------|------|-------|
| POST | `/whatsapp/connect` | JWT | حفظ WABA ID + Phone ID + Token |
| GET | `/whatsapp/status` | JWT | حالة الاتصال |
| POST | `/whatsapp/verify` | JWT | إرسال رسالة اختبار |

### Webhooks — `/webhook`
| Method | Path | Auth | الوصف |
|--------|------|------|-------|
| POST | `/webhook/shopify/{tenant_id}/orders` | HMAC | طلب جديد |
| POST | `/webhook/shopify/{tenant_id}/products` | HMAC | منتج جديد |
| POST | `/webhook/shopify/{tenant_id}/customers` | HMAC | عميل جديد |
| POST | `/webhook/shopify/{tenant_id}` | HMAC | legacy catch-all |
| POST | `/webhook/whatsapp/{tenant_id}` | — | رسائل WhatsApp الواردة |
| GET | `/webhook/whatsapp/{tenant_id}` | — | webhook verification |

---

## فلو Shopify OAuth (لكل تاجر)

```
التاجر يفتح /dashboard/settings/integrations
        ↓
يدخل: shop_domain + client_id + client_secret
(من Shopify Partners App)
        ↓
POST /integrations/shopify/oauth/start
  → يحفظ client_id و encrypt(client_secret) في DB
  → يُنشئ state JWT (tenant_id + nonce + exp 10min)
  → يُرجع redirect_url
        ↓
المتصفح يتحول إلى Shopify consent screen
        ↓
التاجر يوافق
        ↓
GET /integrations/shopify/oauth/callback?code=&state=&shop=&hmac=
  → يفك state JWT → يجيب tenant_id
  → يحمل tenant من DB → يجيب client_secret
  → يتحقق من HMAC بـ tenant's client_secret
  → يبادل code بـ access_token
  → يحفظ encrypt(access_token) + shopify_domain
  → يسجل 3 webhooks (orders/products/customers)
  → يحول المتصفح لـ /dashboard/settings/integrations?shopify=success
        ↓
الصفحة تعرض toast "تم الربط بنجاح ✅"
```

---

## فلو WhatsApp Business (لكل تاجر)

```
التاجر يدخل:
  WABA ID + Phone Number ID + رقم الهاتف + Access Token
        ↓
POST /integrations/whatsapp/connect
  → يحفظ encrypt(access_token)
  → يُنشئ verify_token عشوائي (secrets.token_hex(24))
        ↓
الصفحة تعرض:
  Webhook URL:   https://api.ataproject.cloud/webhook/whatsapp/{tenant_id}
  Verify Token:  xxxxxxxxxxxx
        ↓
التاجر يحطهم في Meta Business Manager → WhatsApp → Webhook
ويشترك في: messages, message_status
        ↓
اختبار: يدخل رقم هاتف → POST /integrations/whatsapp/verify
  → يُرسل رسالة اختبار بـ WhatsApp API
```

---

## فلو الطلب الجديد (End-to-End)

```
Shopify: POST /webhook/shopify/{tenant_id}/orders
        ↓
يتحقق من HMAC
        ↓
يحفظ Order في DB + يُنشئ Customer إذا جديد
        ↓
إذا كان للتاجر WhatsApp متصل:
  OrderHandler.start_from_shopify_order()
        ↓
Claude AI يُصنف النية → يرد على العميل بـ WhatsApp
```

---

## المصادقة والأمان

- **JWT:** كل request محمي يحتاج `Authorization: Bearer <token>`
- **TenantMiddleware:** يتحقق من الـ JWT ويحقن `request.state.tenant_id` في كل request
- **PUBLIC_PREFIXES:** المسارات العامة (لا تحتاج JWT):
  - `/`, `/health`, `/docs`, `/redoc`, `/openapi.json`
  - `/auth/register`, `/auth/login`
  - `/webhook/` (التحقق عبر HMAC)
  - `/integrations/shopify/oauth/callback` (Shopify يبعت بدون JWT)
- **Fernet Encryption:** كل الـ tokens المحساسة (Shopify, WhatsApp) مشفرة في DB
- **Multi-tenancy:** كل query في DB فيها `WHERE tenant_id = ?`

---

## متغيرات البيئة (EasyPanel)

### Backend
```env
APP_ENV=production
APP_BASE_URL=https://api.ataproject.cloud
FRONTEND_URL=https://saas.ataproject.cloud
DATABASE_URL=postgresql+asyncpg://user:pass@host:5432/dbname
REDIS_URL=redis://localhost:6379/0
JWT_SECRET=<random 64 chars>
FERNET_KEY=<generated by Fernet.generate_key()>
CREATE_TABLES=true
LOG_LEVEL=INFO
CORS_ORIGINS=https://saas.ataproject.cloud
```

### Frontend
```env
NEXT_PUBLIC_API_URL=https://api.ataproject.cloud
```

---

## الـ Deployment على EasyPanel

- **Backend:** Dockerfile في `backend/` — uvicorn على port 8000
- **Frontend:** Dockerfile في `frontend/` — Next.js على port 3000
  - `NEXT_PUBLIC_API_URL` لازم يكون **Build Arg** في Dockerfile (مش runtime env)
- **Database:** PostgreSQL service داخل EasyPanel
- **الـ migrations:** تشتغل تلقائياً عند startup عبر `_run_column_migrations()` في `database.py`

---

## ما تم بناؤه حتى الآن ✅

- [x] Backend FastAPI كامل مع multi-tenancy
- [x] Auth (register / login / JWT / middleware)
- [x] Fernet encryption لكل الـ tokens
- [x] Shopify OAuth flow (per-tenant Client ID + Secret)
- [x] Shopify webhooks: 3 endpoints منفصلة (orders/products/customers)
- [x] WhatsApp Business setup + test message
- [x] Webhook handler: order → customer → WhatsApp notification
- [x] Frontend Next.js (App Router) مع RTL Arabic UI
- [x] Dashboard layout مع sidebar
- [x] صفحة التكاملات كاملة
- [x] Deployment على EasyPanel (backend + frontend + PostgreSQL)
- [x] Column migrations تلقائية عند startup

## ما لم يُبنَ بعد ⏳

- [ ] صفحة المحادثات (`/dashboard/conversations`)
- [ ] صفحة الطلبات (`/dashboard/orders`)
- [ ] صفحة العملاء (`/dashboard/customers`)
- [ ] لوحة التحكم الرئيسية (إحصائيات)
- [ ] منطق products/create و customers/create في webhook handler
- [ ] Alembic migrations رسمية (حالياً ALTER TABLE IF NOT EXISTS)
- [ ] إعدادات Brand Voice في الداشبورد

---

## ملاحظات مهمة

1. **Shopify Partner App:** كل تاجر يعمل Custom App في [partners.shopify.com](https://partners.shopify.com) ويضع Redirect URL:
   `https://api.ataproject.cloud/integrations/shopify/oauth/callback`

2. **NEXT_PUBLIC_API_URL:** يُخبَز (baked) في وقت الـ build مش runtime — لازم Build Arg في EasyPanel.

3. **Next.js Route Groups:** `(dashboard)` مش جزء من الـ URL — الصفحات داخل `(dashboard)/dashboard/` تُفتح على `/dashboard/`.

4. **SQLite في dev:** عند عدم وجود `DATABASE_URL`، يستخدم SQLite تلقائياً.

5. **Redis اختياري:** إذا مش موجود، يشتغل بدونه (graceful degradation).
