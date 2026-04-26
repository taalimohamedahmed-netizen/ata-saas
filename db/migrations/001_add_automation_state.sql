-- Add automation state machine to whatsapp_conversations
ALTER TABLE whatsapp_conversations
  ADD COLUMN IF NOT EXISTS state   TEXT    DEFAULT 'idle',
  ADD COLUMN IF NOT EXISTS context JSONB   DEFAULT '{}';

-- states: idle | new_order | awaiting_confirmation | awaiting_payment_method
--         awaiting_payment_screenshot | completed | cancelled | manual_review

CREATE INDEX IF NOT EXISTS idx_wa_conv_state ON whatsapp_conversations(state);

SELECT 'Automation state columns added ✅' AS status;
