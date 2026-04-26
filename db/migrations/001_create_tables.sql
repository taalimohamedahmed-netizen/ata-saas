-- ============================================
-- ATA Shopify SaaS — Database Migration 001
-- Multi-Tenant Schema: platforms, products, orders, customers
-- ============================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================
-- 1. PLATFORMS TABLE
-- Stores Shopify store credentials & ownership
-- ============================================
CREATE TABLE IF NOT EXISTS platforms (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id        UUID NOT NULL,                              -- Supabase Auth user ID
    shop_domain     TEXT UNIQUE NOT NULL,                       -- e.g. mystore.myshopify.com
    access_token    TEXT,                                       -- Shopify permanent access token
    scopes          TEXT,                                       -- Granted OAuth scopes
    installed_at    TIMESTAMPTZ DEFAULT now(),
    last_synced_at  TIMESTAMPTZ,                                -- NULL until first sync
    is_active       BOOLEAN DEFAULT true,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE platforms IS 'Shopify store connections — one row per installed store';
COMMENT ON COLUMN platforms.owner_id IS 'Maps to auth.users.id in Supabase Auth';

-- ============================================
-- 2. PRODUCTS TABLE
-- Synced Shopify products scoped to a platform
-- ============================================
CREATE TABLE IF NOT EXISTS products (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform_id         UUID NOT NULL REFERENCES platforms(id) ON DELETE CASCADE,
    shopify_product_id  BIGINT NOT NULL,
    title               TEXT,
    body_html           TEXT,
    vendor              TEXT,
    product_type        TEXT,
    handle              TEXT,
    status              TEXT,                                   -- active, draft, archived
    tags                TEXT,
    variants            JSONB DEFAULT '[]'::jsonb,              -- Full variant objects
    images              JSONB DEFAULT '[]'::jsonb,              -- Full image objects
    published_at        TIMESTAMPTZ,
    created_at_shopify  TIMESTAMPTZ,
    synced_at           TIMESTAMPTZ DEFAULT now(),

    CONSTRAINT uq_platform_product UNIQUE (platform_id, shopify_product_id)
);

COMMENT ON TABLE products IS 'Shopify products — multi-tenant via platform_id';

-- ============================================
-- 3. ORDERS TABLE
-- Synced Shopify orders scoped to a platform
-- ============================================
CREATE TABLE IF NOT EXISTS orders (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform_id         UUID NOT NULL REFERENCES platforms(id) ON DELETE CASCADE,
    shopify_order_id    BIGINT NOT NULL,
    order_number        INTEGER,
    email               TEXT,
    financial_status    TEXT,                                   -- paid, pending, refunded, etc.
    fulfillment_status  TEXT,                                   -- fulfilled, partial, null
    total_price         NUMERIC(10, 2),
    subtotal_price      NUMERIC(10, 2),
    total_tax           NUMERIC(10, 2),
    currency            TEXT DEFAULT 'USD',
    line_items          JSONB DEFAULT '[]'::jsonb,              -- Order line items
    customer_data       JSONB DEFAULT '{}'::jsonb,              -- Customer snapshot at order time
    shipping_address    JSONB DEFAULT '{}'::jsonb,
    billing_address     JSONB DEFAULT '{}'::jsonb,
    note                TEXT,
    tags                TEXT,
    cancelled_at        TIMESTAMPTZ,
    created_at_shopify  TIMESTAMPTZ,
    updated_at_shopify  TIMESTAMPTZ,
    synced_at           TIMESTAMPTZ DEFAULT now(),

    CONSTRAINT uq_platform_order UNIQUE (platform_id, shopify_order_id)
);

COMMENT ON TABLE orders IS 'Shopify orders — multi-tenant via platform_id';

-- ============================================
-- 4. CUSTOMERS TABLE
-- Synced Shopify customers scoped to a platform
-- ============================================
CREATE TABLE IF NOT EXISTS customers (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform_id             UUID NOT NULL REFERENCES platforms(id) ON DELETE CASCADE,
    shopify_customer_id     BIGINT NOT NULL,
    email                   TEXT,
    first_name              TEXT,
    last_name               TEXT,
    phone                   TEXT,
    orders_count            INTEGER DEFAULT 0,
    total_spent             NUMERIC(10, 2) DEFAULT 0.00,
    tags                    TEXT,
    verified_email          BOOLEAN DEFAULT false,
    accepts_marketing       BOOLEAN DEFAULT false,
    default_address         JSONB DEFAULT '{}'::jsonb,
    created_at_shopify      TIMESTAMPTZ,
    updated_at_shopify      TIMESTAMPTZ,
    synced_at               TIMESTAMPTZ DEFAULT now(),

    CONSTRAINT uq_platform_customer UNIQUE (platform_id, shopify_customer_id)
);

COMMENT ON TABLE customers IS 'Shopify customers — multi-tenant via platform_id';

-- ============================================
-- 5. INDEXES — Performance for multi-tenant queries
-- ============================================

-- Platforms
CREATE INDEX IF NOT EXISTS idx_platforms_owner_id     ON platforms(owner_id);
CREATE INDEX IF NOT EXISTS idx_platforms_shop_domain   ON platforms(shop_domain);
CREATE INDEX IF NOT EXISTS idx_platforms_is_active      ON platforms(is_active);

-- Products
CREATE INDEX IF NOT EXISTS idx_products_platform_id    ON products(platform_id);
CREATE INDEX IF NOT EXISTS idx_products_status         ON products(platform_id, status);
CREATE INDEX IF NOT EXISTS idx_products_vendor         ON products(platform_id, vendor);
CREATE INDEX IF NOT EXISTS idx_products_synced_at      ON products(synced_at);

-- Orders
CREATE INDEX IF NOT EXISTS idx_orders_platform_id      ON orders(platform_id);
CREATE INDEX IF NOT EXISTS idx_orders_email            ON orders(platform_id, email);
CREATE INDEX IF NOT EXISTS idx_orders_financial_status  ON orders(platform_id, financial_status);
CREATE INDEX IF NOT EXISTS idx_orders_created_shopify   ON orders(platform_id, created_at_shopify DESC);
CREATE INDEX IF NOT EXISTS idx_orders_synced_at         ON orders(synced_at);

-- Customers
CREATE INDEX IF NOT EXISTS idx_customers_platform_id   ON customers(platform_id);
CREATE INDEX IF NOT EXISTS idx_customers_email         ON customers(platform_id, email);
CREATE INDEX IF NOT EXISTS idx_customers_synced_at     ON customers(synced_at);

-- ============================================
-- 6. ROW LEVEL SECURITY (RLS)
-- Every query is scoped to the platform owner
-- ============================================

-- Enable RLS on all tables
ALTER TABLE platforms  ENABLE ROW LEVEL SECURITY;
ALTER TABLE products   ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders     ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers  ENABLE ROW LEVEL SECURITY;

-- PLATFORMS: Owner can only see their own platforms
CREATE POLICY "platforms_owner_isolation" ON platforms
    FOR ALL
    USING (owner_id = auth.uid())
    WITH CHECK (owner_id = auth.uid());

-- PRODUCTS: User can only see products belonging to their platforms
CREATE POLICY "products_tenant_isolation" ON products
    FOR ALL
    USING (
        platform_id IN (
            SELECT id FROM platforms WHERE owner_id = auth.uid()
        )
    )
    WITH CHECK (
        platform_id IN (
            SELECT id FROM platforms WHERE owner_id = auth.uid()
        )
    );

-- ORDERS: User can only see orders belonging to their platforms
CREATE POLICY "orders_tenant_isolation" ON orders
    FOR ALL
    USING (
        platform_id IN (
            SELECT id FROM platforms WHERE owner_id = auth.uid()
        )
    )
    WITH CHECK (
        platform_id IN (
            SELECT id FROM platforms WHERE owner_id = auth.uid()
        )
    );

-- CUSTOMERS: User can only see customers belonging to their platforms
CREATE POLICY "customers_tenant_isolation" ON customers
    FOR ALL
    USING (
        platform_id IN (
            SELECT id FROM platforms WHERE owner_id = auth.uid()
        )
    )
    WITH CHECK (
        platform_id IN (
            SELECT id FROM platforms WHERE owner_id = auth.uid()
        )
    );

-- ============================================
-- 7. UPDATED_AT TRIGGER (auto-update timestamp)
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
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
