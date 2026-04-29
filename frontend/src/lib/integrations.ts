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
  webhook_urls: Record<string, string>;
}


export const getShopifyStatus = async (): Promise<ShopifyStatus> => {
  const res = await api.get("/integrations/shopify/status");
  return res.data;
};

export const startShopifyOAuth = async (data: {
  shop_domain: string;
  client_id: string;
  client_secret: string;
}): Promise<{ redirect_url: string }> => {
  const res = await api.post("/integrations/shopify/oauth/start", data);
  return res.data;
};

export const retryShopifyWebhooks = async (): Promise<{ webhooks: Record<string, WebhookStatus> }> => {
  const res = await api.post("/integrations/shopify/webhooks/retry");
  return res.data;
};

export const syncShopify = async (): Promise<{ status?: string; message?: string; synced?: { orders: number; customers: number; products?: number } }> => {
  const res = await api.post("/integrations/shopify/sync");
  return res.data;
};

export const disconnectShopify = async (): Promise<{ success: boolean }> => {
  const res = await api.post("/integrations/shopify/disconnect");
  return res.data;
};

export interface AISettings {
  ai_model: string;
  ai_system_prompt: string | null;
  available_models: Array<{ id: string; label: string }>;
}

export const getAISettings = async (): Promise<AISettings> => {
  const res = await api.get("/integrations/ai/settings");
  return res.data;
};

export const updateAISettings = async (data: {
  ai_model?: string;
  ai_system_prompt?: string | null;
}): Promise<{ success: boolean }> => {
  const res = await api.post("/integrations/ai/settings", data);
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
