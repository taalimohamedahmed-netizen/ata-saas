"use client";

import { useEffect, useState } from "react";
import { Bot, Eye, EyeOff, Save, CheckCircle2, Cpu, Sparkles, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { getAISettings as getProviderSettings, getAIModels, saveAISettings as saveProviderSettings, type AISettings as ProviderSettings, type AIModel } from "@/lib/settings";
import { getAISettings as getIntegrationAI, updateAISettings as updateIntegrationAI, type AISettings as IntegrationAISettings } from "@/lib/integrations";
import { useI18n } from "@/context/i18n-context";

const DEFAULT_AI_PROMPT = `أنت المساعد الذكي الرسمي والوحيد للمتجر. مهمتك هي تقديم تجربة خدمة عملاء مذهلة وزيادة المبيعات من خلال ترشيح المنتجات المناسبة.

أولاً: أسلوب التحدث:
- تحدث باللهجة المصرية العامية الودودة.
- خليك حلال مشاكل، وردودك قصيرة ومباشرة (ماتزودش عن 3 جمل).
- استخدم الإيموجيز بشكل خفيف.

ثانياً: التعامل مع البيانات:
- [AVAILABLE PRODUCTS]: رشح منها بالأرقام والأسعار فقط.
- [CUSTOMER RECENT ORDERS]: أخبر العميل بحالة طلبه مباشرة.

ثالثاً: قواعد ممنوعة:
- ممنوع تألف أسعار غير موجودة في البيانات.
- ممنوع تقول "أنا نموذج لغوي".`;

export default function AISettingsPage() {
  const { t, dir, fontFamily } = useI18n();

  const [providerSettings, setProviderSettings] = useState<ProviderSettings | null>(null);
  const [models, setModels] = useState<AIModel[]>([]);
  const [apiKey, setApiKey] = useState("");
  const [selectedModel, setSelectedModel] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [savingProvider, setSavingProvider] = useState(false);

  const [integrationAI, setIntegrationAI] = useState<IntegrationAISettings | null>(null);
  const [prompt, setPrompt] = useState("");
  const [aiModel, setAiModel] = useState("");
  const [savingBehaviour, setSavingBehaviour] = useState(false);
  const [loadingBehaviour, setLoadingBehaviour] = useState(true);

  useEffect(() => {
    Promise.all([getProviderSettings(), getAIModels()]).then(([s, m]) => {
      setProviderSettings(s); setModels(m); setSelectedModel(s.ai_model || "openai/gpt-4o-mini");
    });
    getIntegrationAI()
      .then((data) => { setIntegrationAI(data); setPrompt(data.ai_system_prompt || DEFAULT_AI_PROMPT); setAiModel(data.ai_model); })
      .catch(() => toast.error(t("common", "error")))
      .finally(() => setLoadingBehaviour(false));
  }, []);

  const handleSaveProvider = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProvider(true);
    try {
      const updated = await saveProviderSettings({ openrouter_api_key: apiKey || undefined, ai_model: selectedModel || undefined });
      setProviderSettings(updated); setApiKey("");
      toast.success(t("ai", "connected") + " ✅");
    } catch { toast.error(t("common", "error")); } finally { setSavingProvider(false); }
  };

  const handleSaveBehaviour = async () => {
    setSavingBehaviour(true);
    try {
      await updateIntegrationAI({ ai_model: aiModel, ai_system_prompt: prompt });
      toast.success(t("ai", "connected") + " ✅");
    } catch { toast.error(t("common", "error")); } finally { setSavingBehaviour(false); }
  };

  return (
    <div className="max-w-2xl space-y-6 pb-10" dir={dir}>
      <div>
        <h1 className="text-2xl font-bold text-[var(--c-text)]" style={{ fontFamily }}>{t("ai", "title")}</h1>
        <p className="mt-1 text-sm text-muted" style={{ fontFamily }}>{t("ai", "subtitle")}</p>
      </div>

      {!loadingBehaviour && (
        <div className="rounded-2xl border border-border bg-surface p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/15">
                <Sparkles className="h-5 w-5 text-accent" />
              </div>
              <div>
                <h3 className="font-semibold text-[var(--c-text)]" style={{ fontFamily }}>{t("ai", "cardBehaviourTitle")}</h3>
                <p className="text-xs text-muted" style={{ fontFamily }}>{t("ai", "cardBehaviourSub")}</p>
              </div>
            </div>
            <button onClick={handleSaveBehaviour} disabled={savingBehaviour}
              className="flex h-9 items-center gap-2 rounded-lg bg-accent px-4 text-xs font-bold text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
              style={{ fontFamily }}>
              {savingBehaviour ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              {savingBehaviour ? t("ai", "saving") : t("ai", "save")}
            </button>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[var(--c-text-sub)] mb-1.5" style={{ fontFamily }}>{t("ai", "modelLabel")}</label>
              <select value={aiModel} onChange={(e) => setAiModel(e.target.value)}
                className="w-full rounded-lg border border-border bg-navy px-3 py-2.5 text-sm text-[var(--c-text)] focus:border-accent focus:outline-none"
                dir="ltr">
                {integrationAI?.available_models.map((m) => (<option key={m.id} value={m.id}>{m.label}</option>))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--c-text-sub)] mb-1.5" style={{ fontFamily }}>{t("ai", "promptLabel")}</label>
              <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)}
                className="w-full h-40 rounded-lg border border-border bg-navy px-3 py-2.5 text-sm text-[var(--c-text)] placeholder:text-muted focus:border-accent focus:outline-none resize-none"
                dir="rtl" />
              <p className="mt-2 text-[10px] text-muted leading-relaxed" style={{ fontFamily }}>{t("ai", "promptHint")}</p>
            </div>
          </div>
        </div>
      )}

      {providerSettings && (
        <div className="rounded-2xl border border-border bg-surface p-5 flex items-center gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/15">
            <Bot className="h-5 w-5 text-accent" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-[var(--c-text)]" style={{ fontFamily }}>{t("ai", "currentProvider")}</p>
            <p className="text-xs text-muted mt-0.5" dir="ltr">
              {providerSettings.provider === "openrouter" ? `OpenRouter — ${providerSettings.ai_model || "—"}` : "Anthropic Claude"}
            </p>
          </div>
          {providerSettings.has_openrouter_key && (
            <span className="flex items-center gap-1 rounded-full bg-success/15 px-3 py-1 text-xs font-medium text-success">
              <CheckCircle2 className="h-3.5 w-3.5" /> {t("ai", "connected")}
            </span>
          )}
        </div>
      )}

      <form onSubmit={handleSaveProvider} className="rounded-2xl border border-border bg-surface p-6 space-y-5">
        <div className="flex items-center gap-2 mb-1">
          <Cpu className="h-4 w-4 text-accent" />
          <h2 className="text-sm font-semibold text-[var(--c-text)]" style={{ fontFamily }}>{t("ai", "setupOpenRouter")}</h2>
        </div>
        <div className="rounded-xl border border-border bg-navy px-4 py-3 text-xs text-muted leading-relaxed" style={{ fontFamily }}>
          <span className="font-semibold text-[var(--c-text-sub)]">{t("ai", "howTo")}</span>{" "}
          openrouter.ai → Sign in → Keys → Create Key
        </div>
        <div>
          <label className="block text-sm font-medium text-[var(--c-text-sub)] mb-1.5" style={{ fontFamily }}>{t("ai", "apiKeyLabel")}</label>
          <div className="relative">
            <input type={showKey ? "text" : "password"} value={apiKey} onChange={(e) => setApiKey(e.target.value)}
              placeholder={providerSettings?.has_openrouter_key ? t("ai", "apiKeyPlaceholderSet") : "sk-or-v1-..."}
              dir="ltr"
              className="w-full rounded-lg border border-border bg-navy px-3 py-2.5 pe-10 text-sm text-[var(--c-text)] placeholder:text-muted focus:border-accent focus:outline-none" />
            <button type="button" onClick={() => setShowKey(!showKey)}
              className="absolute end-3 top-1/2 -translate-y-1/2 text-muted hover:text-[var(--c-text)]">
              {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-[var(--c-text-sub)] mb-1.5" style={{ fontFamily }}>{t("ai", "modelSelectLabel")}</label>
          <select value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)}
            className="w-full rounded-lg border border-border bg-navy px-3 py-2.5 text-sm text-[var(--c-text)] focus:border-accent focus:outline-none"
            dir="ltr">
            {models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
          <p className="mt-1 text-xs text-muted" dir="ltr">{selectedModel}</p>
        </div>
        <button type="submit" disabled={savingProvider || (!apiKey && !selectedModel)}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-accent py-2.5 text-sm font-semibold text-white hover:bg-accent/90 transition-colors disabled:opacity-50"
          style={{ fontFamily }}>
          <Save className="h-4 w-4" />
          {savingProvider ? t("ai", "saving") : t("ai", "saveSettings")}
        </button>
        {providerSettings?.has_openrouter_key && (
          <button type="button"
            onClick={async () => {
              if (!confirm(t("integrations", "disconnectConfirm"))) return;
              setSavingProvider(true);
              try { const u = await saveProviderSettings({ openrouter_api_key: "" }); setProviderSettings(u); toast.success("Done"); }
              catch { toast.error(t("common", "error")); } finally { setSavingProvider(false); }
            }}
            className="w-full rounded-xl border border-danger/30 py-2 text-xs text-danger hover:bg-danger/10 transition-colors"
            style={{ fontFamily }}>
            {t("ai", "removeOpenRouter")}
          </button>
        )}
      </form>
    </div>
  );
}
