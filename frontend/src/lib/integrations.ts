import api from "./api";

// ─── Shopify ───────────────────────────────────────────────

export interface WebhookStatus {
  status: "connected" | "not_registered" | "failed";
  id: string | null;
  error?: string;
}

export interface ShopifyStatus {
  connected: boolean;
  domain: string | null;
  connected_at: string | null;
  webhooks: Record<string, WebhookStatus>;
}

export interface ShopifyConnectResult {
  connected: boolean;
  domain: string;
  webhooks: Record<string, WebhookStatus>;
}

export const getShopifyStatus = async (): Promise<ShopifyStatus> => {
  const res = await api.get("/integrations/shopify/status");
  return res.data;
};

export const connectShopify = async (
  shopify_domain: string,
  shopify_token: string,
): Promise<ShopifyConnectResult> => {
  const res = await api.post("/integrations/shopify/connect", {
    shopify_domain,
    shopify_token,
  });
  return res.data;
};

export const retryShopifyWebhooks = async (): Promise<{ webhooks: Record<string, WebhookStatus> }> => {
  const res = await api.post("/integrations/shopify/webhooks/retry");
  return res.data;
};

// ─── WhatsApp ──────────────────────────────────────────────

export interface WhatsAppStatus {
  connected: boolean;
  phone_number: string | null;
  waba_id: string | null;
  webhook_url: string | null;
  verify_token: string | null;
  connected_at: string | null;
}

export interface WhatsAppConnectResult {
  connected: boolean;
  phone_number: string;
  webhook_url: string;
  verify_token: string;
  connected_at: string;
}

export const getWhatsAppStatus = async (): Promise<WhatsAppStatus> => {
  const res = await api.get("/integrations/whatsapp/status");
  return res.data;
};

export const connectWhatsApp = async (data: {
  waba_id: string;
  phone_number_id: string;
  phone_number: string;
  access_token: string;
}): Promise<WhatsAppConnectResult> => {
  const res = await api.post("/integrations/whatsapp/connect", data);
  return res.data;
};

export const verifyWhatsApp = async (test_phone: string): Promise<{ verified: boolean; message: string }> => {
  const res = await api.post("/integrations/whatsapp/verify", { test_phone });
  return res.data;
};
