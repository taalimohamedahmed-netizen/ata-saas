-- ============================================
-- ATA SaaS — WhatsApp Inbox Tables
-- Run this in Supabase SQL Editor
-- ============================================

-- Conversations: one row per customer per platform
CREATE TABLE IF NOT EXISTS whatsapp_conversations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform_id     UUID NOT NULL REFERENCES platforms(id) ON DELETE CASCADE,
    customer_phone  TEXT NOT NULL,
    customer_name   TEXT,
    last_message    TEXT,
    last_message_at TIMESTAMPTZ DEFAULT now(),
    created_at      TIMESTAMPTZ DEFAULT now(),
    UNIQUE (platform_id, customer_phone)
);

-- Messages: one row per message in a conversation
CREATE TABLE IF NOT EXISTS whatsapp_messages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES whatsapp_conversations(id) ON DELETE CASCADE,
    direction       TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
    body            TEXT NOT NULL,
    wa_message_id   TEXT,
    status          TEXT DEFAULT 'sent',
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_wa_conv_platform    ON whatsapp_conversations(platform_id);
CREATE INDEX IF NOT EXISTS idx_wa_conv_phone       ON whatsapp_conversations(customer_phone);
CREATE INDEX IF NOT EXISTS idx_wa_conv_last_msg    ON whatsapp_conversations(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_msg_conv         ON whatsapp_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_wa_msg_created      ON whatsapp_messages(created_at);

-- Disable RLS (backend uses service_role key)
ALTER TABLE whatsapp_conversations DISABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_messages      DISABLE ROW LEVEL SECURITY;

SELECT 'WhatsApp inbox tables created ✅' AS status;
