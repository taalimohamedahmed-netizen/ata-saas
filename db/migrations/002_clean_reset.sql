-- ============================================
-- ATA Shopify SaaS — FULL RESET & CLEAN SETUP
-- Run this in Supabase SQL Editor
-- ============================================

-- STEP 1: DROP everything old (our tables + any leftover from old projects)
-- ============================================
DROP TRIGGER IF EXISTS trigger_platforms_updated_at ON platforms;
DROP TRIGGER IF EXISTS trigger_products_updated_at ON products;
DROP TRIGGER IF EXISTS trigger_orders_updated_at ON orders;
DROP TRIGGER IF EXISTS trigger_customers_updated_at ON customers;

DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;

-- Our tables
DROP TABLE IF EXISTS customers    CASCADE;
DROP TABLE IF EXISTS orders       CASCADE;
DROP TABLE IF EXISTS products     CASCADE;
DROP TABLE IF EXISTS platforms    CASCADE;

-- Old leftover tables from previous projects
DROP TABLE IF EXISTS webhook_logs  CASCADE;
DROP TABLE IF EXISTS messages      CASCADE;
DROP TABLE IF EXISTS conversations CASCADE;
DROP TABLE IF EXISTS stores        CASCADE;

-- STEP 2: Enable UUID extension
-- ============================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================
-- STEP 3: PLATFORMS TABLE
-- One row per connected Shopify store
-- ============================================
CREATE TABLE platforms (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_domain     TEXT UNIQUE NOT NULL,       -- e.g. mystore.myshopify.com
    access_token    TEXT NOT NULL,              -- Shopify Admin API Access Token (shpat_...)
    owner_id        TEXT NOT NULL,              -- Owner identifier (email or user id)
    is_active       BOOLEAN DEFAULT true,
    installed_at    TIMESTAMPTZ DEFAULT now(),
    last_synced_at  TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- STEP 4: PRODUCTS TABLE
-- ============================================
CREATE TABLE products (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform_id     UUID NOT NULL REFERENCES platforms(id) ON DELETE CASCADE,
    shopify_id      BIGINT NOT NULL,
    title           TEXT,
    vendor          TEXT,
    product_type    TEXT,
    status          TEXT,                       -- active, archived, draft
    price           NUMERIC(10, 2),
    inventory_qty   INTEGER DEFAULT 0,
    image_url       TEXT,
    shopify_data    JSONB,                      -- Full raw JSON from Shopify API
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now(),
    UNIQUE (platform_id, shopify_id)
);

-- ============================================
-- STEP 5: ORDERS TABLE
-- ============================================
CREATE TABLE orders (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform_id     UUID NOT NULL REFERENCES platforms(id) ON DELETE CASCADE,
    shopify_id      BIGINT NOT NULL,
    order_number    TEXT,
    email           TEXT,
    total_price     NUMERIC(10, 2),
    currency        TEXT DEFAULT 'USD',
    financial_status TEXT,                     -- paid, pending, refunded
    fulfillment_status TEXT,                   -- fulfilled, unfulfilled, partial
    customer_name   TEXT,
    shopify_data    JSONB,                      -- Full raw JSON from Shopify API
    ordered_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now(),
    UNIQUE (platform_id, shopify_id)
);

-- ============================================
-- STEP 6: CUSTOMERS TABLE
-- ============================================
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
    shopify_data    JSONB,                      -- Full raw JSON from Shopify API
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now(),
    UNIQUE (platform_id, shopify_id)
);

-- ============================================
-- STEP 7: INDEXES for fast queries
-- ============================================
CREATE INDEX idx_products_platform_id    ON products(platform_id);
CREATE INDEX idx_products_shopify_id     ON products(shopify_id);
CREATE INDEX idx_orders_platform_id      ON orders(platform_id);
CREATE INDEX idx_orders_shopify_id       ON orders(shopify_id);
CREATE INDEX idx_orders_email            ON orders(email);
CREATE INDEX idx_customers_platform_id   ON customers(platform_id);
CREATE INDEX idx_customers_shopify_id    ON customers(shopify_id);
CREATE INDEX idx_customers_email         ON customers(email);

-- ============================================
-- STEP 8: AUTO updated_at TRIGGER
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_platforms_updated_at
    BEFORE UPDATE ON platforms
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_products_updated_at
    BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_orders_updated_at
    BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_customers_updated_at
    BEFORE UPDATE ON customers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- STEP 9: DISABLE RLS (we use service_role key on backend)
-- ============================================
ALTER TABLE platforms  DISABLE ROW LEVEL SECURITY;
ALTER TABLE products   DISABLE ROW LEVEL SECURITY;
ALTER TABLE orders     DISABLE ROW LEVEL SECURITY;
ALTER TABLE customers  DISABLE ROW LEVEL SECURITY;

-- ============================================
-- DONE! Tables: platforms, products, orders, customers
-- ============================================
SELECT 'ATA SaaS database setup complete ✅' AS status;
