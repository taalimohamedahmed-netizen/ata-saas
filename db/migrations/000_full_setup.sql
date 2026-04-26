-- ============================================
-- ATA SaaS — COMPLETE DATABASE SETUP
-- Copy & paste this entire file into Supabase SQL Editor
-- ============================================

-- STEP 1: DROP old tables if they exist
DROP TRIGGER IF EXISTS trigger_platforms_updated_at  ON platforms;
DROP TRIGGER IF EXISTS trigger_products_updated_at   ON products;
DROP TRIGGER IF EXISTS trigger_orders_updated_at     ON orders;
DROP TRIGGER IF EXISTS trigger_customers_updated_at  ON customers;
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;

DROP TABLE IF EXISTS whatsapp_messages      CASCADE;
DROP TABLE IF EXISTS whatsapp_conversations CASCADE;
DROP TABLE IF EXISTS customers              CASCADE;
DROP TABLE IF EXISTS orders                 CASCADE;
DROP TABLE IF EXISTS products               CASCADE;
DROP TABLE IF EXISTS platforms              CASCADE;
DROP TABLE IF EXISTS webhook_logs           CASCADE;
DROP TABLE IF EXISTS messages               CASCADE;
DROP TABLE IF EXISTS conversations          CASCADE;
DROP TABLE IF EXISTS stores                 CASCADE;

-- STEP 2: UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- STEP 3: PLATFORMS
CREATE TABLE platforms (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_domain     TEXT UNIQUE NOT NULL,
    access_token    TEXT NOT NULL,
    owner_id        TEXT NOT NULL,
    is_active       BOOLEAN DEFAULT true,
    installed_at    TIMESTAMPTZ DEFAULT now(),
    last_synced_at  TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

-- STEP 4: PRODUCTS
CREATE TABLE products (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform_id     UUID NOT NULL REFERENCES platforms(id) ON DELETE CASCADE,
    shopify_id      BIGINT NOT NULL,
    title           TEXT,
    vendor          TEXT,
    product_type    TEXT,
    status          TEXT,
    price           NUMERIC(10, 2),
    inventory_qty   INTEGER DEFAULT 0,
    image_url       TEXT,
    shopify_data    JSONB,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now(),
    UNIQUE (platform_id, shopify_id)
);

-- STEP 5: ORDERS
CREATE TABLE orders (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform_id         UUID NOT NULL REFERENCES platforms(id) ON DELETE CASCADE,
    shopify_id          BIGINT NOT NULL,
    order_number        TEXT,
    email               TEXT,
    total_price         NUMERIC(10, 2),
    currency            TEXT DEFAULT 'USD',
    financial_status    TEXT,
    fulfillment_status  TEXT,
    customer_name       TEXT,
    shopify_data        JSONB,
    ordered_at          TIMESTAMPTZ,
    created_at          TIMESTAMPTZ DEFAULT now(),
    updated_at          TIMESTAMPTZ DEFAULT now(),
    UNIQUE (platform_id, shopify_id)
);

-- STEP 6: CUSTOMERS
CREATE TABLE customers (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform_id     UUID NOT NULL REFERENCES platforms(id) ON DELETE CASCADE,
    shopify_id      BIGINT NOT NULL,
    email           TEXT,
    first_name      TEXT,
    last_name       TEXT,
    phone           TEXT,
    orders_count    INTEGER DEFAULT 0,
    total_spent     NUMERIC(10, 2) DEFAULT 0,
    shopify_data    JSONB,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now(),
    UNIQUE (platform_id, shopify_id)
);

-- STEP 7: WHATSAPP CONVERSATIONS
CREATE TABLE whatsapp_conversations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform_id     UUID NOT NULL REFERENCES platforms(id) ON DELETE CASCADE,
    customer_phone  TEXT NOT NULL,
    customer_name   TEXT,
    last_message    TEXT,
    last_message_at TIMESTAMPTZ DEFAULT now(),
    created_at      TIMESTAMPTZ DEFAULT now(),
    UNIQUE (platform_id, customer_phone)
);

-- STEP 8: WHATSAPP MESSAGES
CREATE TABLE whatsapp_messages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES whatsapp_conversations(id) ON DELETE CASCADE,
    direction       TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
    body            TEXT NOT NULL,
    wa_message_id   TEXT,
    status          TEXT DEFAULT 'sent',
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- STEP 9: INDEXES
CREATE INDEX idx_products_platform_id    ON products(platform_id);
CREATE INDEX idx_products_shopify_id     ON products(shopify_id);
CREATE INDEX idx_orders_platform_id      ON orders(platform_id);
CREATE INDEX idx_orders_shopify_id       ON orders(shopify_id);
CREATE INDEX idx_orders_email            ON orders(email);
CREATE INDEX idx_customers_platform_id   ON customers(platform_id);
CREATE INDEX idx_customers_shopify_id    ON customers(shopify_id);
CREATE INDEX idx_customers_email         ON customers(email);
CREATE INDEX idx_wa_conv_platform        ON whatsapp_conversations(platform_id);
CREATE INDEX idx_wa_conv_phone           ON whatsapp_conversations(customer_phone);
CREATE INDEX idx_wa_conv_last_msg        ON whatsapp_conversations(last_message_at DESC);
CREATE INDEX idx_wa_msg_conv             ON whatsapp_messages(conversation_id);
CREATE INDEX idx_wa_msg_created          ON whatsapp_messages(created_at);

-- STEP 10: AUTO updated_at TRIGGER
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_platforms_updated_at
    BEFORE UPDATE ON platforms FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trigger_products_updated_at
    BEFORE UPDATE ON products  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trigger_orders_updated_at
    BEFORE UPDATE ON orders    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trigger_customers_updated_at
    BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- STEP 11: DISABLE RLS
ALTER TABLE platforms              DISABLE ROW LEVEL SECURITY;
ALTER TABLE products               DISABLE ROW LEVEL SECURITY;
ALTER TABLE orders                 DISABLE ROW LEVEL SECURITY;
ALTER TABLE customers              DISABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_conversations DISABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_messages      DISABLE ROW LEVEL SECURITY;

SELECT 'ATA SaaS — All tables created successfully ✅' AS status;
