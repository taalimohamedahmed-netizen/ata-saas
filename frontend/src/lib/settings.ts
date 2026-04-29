import api from "./api";

export interface AISettings {
  provider: "openrouter" | "anthropic";
  ai_model: string | null;
  has_openrouter_key: boolean;
}

export interface AIModel {
  id: string;
  label: string;
}

export const getAISettings = async (): Promise<AISettings> => {
  const res = await api.get("/settings/ai");
  return res.data;
};

export const saveAISettings = async (data: {
  openrouter_api_key?: string;
  ai_model?: string;
}): Promise<AISettings> => {
  const res = await api.post("/settings/ai", data);
  return res.data;
};

export const getAIModels = async (): Promise<AIModel[]> => {
  const res = await api.get("/settings/ai/models");
  return res.data;
};

export const toggleConversationAI = async (
  conversationId: number
): Promise<{ id: number; ai_paused: boolean }> => {
  const res = await api.post(`/settings/conversations/${conversationId}/toggle-ai`);
  return res.data;
};

export const sendManualReply = async (
  conversationId: number,
  message: string
): Promise<{ sent: boolean; message: string }> => {
  const res = await api.post(`/settings/conversations/${conversationId}/reply`, { message });
  return res.data;
};
