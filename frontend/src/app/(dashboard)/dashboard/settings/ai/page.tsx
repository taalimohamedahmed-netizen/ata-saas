"use client";

import { useEffect, useState } from "react";
import { Bot, Eye, EyeOff, Save, CheckCircle2, Cpu, Sparkles, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { getAISettings as getProviderSettings, getAIModels, saveAISettings as saveProviderSettings, type AISettings as ProviderSettings, type AIModel } from "@/lib/settings";
import { getAISettings as getIntegrationAI, updateAISettings as updateIntegrationAI, type AISettings as IntegrationAISettings } from "@/lib/integrations";

// ─── Tiny helpers ──────────────────────────────────────────

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-sm font-medium text-slate-300 mb-1.5" style={{ fontFamily: '"IBM Plex Sans Arabic", sans-serif' }}>
      {children}
    </label>
  );
}

// ─── Default prompt ────────────────────────────────────────

const DEFAULT_AI_PROMPT = `أنت المساعد الذكي الرسمي والوحيد للمتجر. مهمتك هي تقديم تجربة خدمة عملاء مذهلة وزيادة المبيعات من خلال ترشيح المنتجات المناسبة.

أولاً: أسلوب التحدث:
- تحدث باللهجة المصرية العامية الودودة (زي ما بنكلم صحابنا بس باحترام).
- خليك "جدع" وحلال مشاكل، وردودك تكون قصيرة ومباشرة (ماتزودش عن 3 جمل إلا لو العميل طلب تفاصيل أكتر).
- استخدم الإيموجيز (Emojis) بشكل خفيف عشان تخلي المحادثة لطيفة.

ثانياً: التعامل مع البيانات (Database):
- أمامك قسم اسمه [AVAILABLE PRODUCTS]: دي المنتجات اللي عندنا. لو العميل سأل عن حاجة، رشح له منها بالأرقام والأسعار الموجودة فقط. لو المنتج خلصان (Stock: 0)، قوله إنه هيتوفر قريباً ورشح له بديل.
- أمامك قسم اسمه [CUSTOMER RECENT ORDERS]: دي طلبات العميل الحالية. لو سأل "فين الأوردر؟"، قوله حالته إيه فوراً (مثلاً: "أوردرك رقم 123 حالته حالياً Pending وجاري تجهيزه").

ثالثاً: قواعد ممنوعة (Hard Rules):
- ممنوع تماماً تألف أسعار أو مواصفات مش موجودة في البيانات اللي قدامك. لو مش عارف، قوله: "ثواني أتأكد لك من الفريق البشري وهرد عليك".
- ممنوع تقول "أنا نموذج لغوي" أو "أنا ذكاء اصطناعي". قوله "أنا مساعد [اسم البراند] وبخدمك".
- لو العميل عايز يرجع منتج، اسأله عن "رقم الطلب" و"سبب الإرجاع" بكل ذوق.

رابعاً: استراتيجية البيع:
- لو العميل بيسأل عن منتج معين، حاول تقترح عليه منتج تاني يكمل الطقم (Cross-sell) من القائمة المتاحة عندك.
- لو العميل جديد، رحب بيه وقدم له "أجدد العروض" اللي موجودة في وصف المنتجات.

خامساً: الدفع:
- لو العميل سأل يدفع إزاي، وضح له إن عندنا دفع عند الاستلام أو تحويل (فودافون كاش / إنستا باي) حسب المتاح في سياسة المتجر.`;

// ============================================================
// Page
// ============================================================

export default function AISettingsPage() {
  // ── OpenRouter provider state ────────────────────────────
  const [providerSettings, setProviderSettings] = useState<ProviderSettings | null>(null);
  const [models, setModels] = useState<AIModel[]>([]);
  const [apiKey, setApiKey] = useState("");
  const [selectedModel, setSelectedModel] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [savingProvider, setSavingProvider] = useState(false);

  // ── AI behaviour (model + prompt) state ──────────────────
  const [integrationAI, setIntegrationAI] = useState<IntegrationAISettings | null>(null);
  const [prompt, setPrompt] = useState("");
  const [aiModel, setAiModel] = useState("");
  const [savingBehaviour, setSavingBehaviour] = useState(false);
  const [loadingBehaviour, setLoadingBehaviour] = useState(true);

  // ── Load everything on mount ─────────────────────────────
  useEffect(() => {
    // Provider settings (OpenRouter)
    Promise.all([getProviderSettings(), getAIModels()]).then(([s, m]) => {
      setProviderSettings(s);
      setModels(m);
      setSelectedModel(s.ai_model || "openai/gpt-4o-mini");
    });

    // AI behaviour (model + prompt from integrations API)
    getIntegrationAI()
      .then((data) => {
        setIntegrationAI(data);
        setPrompt(data.ai_system_prompt || DEFAULT_AI_PROMPT);
        setAiModel(data.ai_model);
      })
      .catch(() => toast.error("فشل تحميل إعدادات الذكاء الاصطناعي"))
      .finally(() => setLoadingBehaviour(false));
  }, []);

  // ── Save OpenRouter ──────────────────────────────────────
  const handleSaveProvider = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProvider(true);
    try {
      const updated = await saveProviderSettings({
        openrouter_api_key: apiKey || undefined,
        ai_model: selectedModel || undefined,
      });
      setProviderSettings(updated);
      setApiKey("");
      toast.success("تم حفظ إعدادات الذكاء الاصطناعي ✅");
    } catch {
      toast.error("فشل الحفظ — تأكد من الـ API Key");
    } finally {
      setSavingProvider(false);
    }
  };

  // ── Save AI Behaviour ────────────────────────────────────
  const handleSaveBehaviour = async () => {
    setSavingBehaviour(true);
    try {
      await updateIntegrationAI({ ai_model: aiModel, ai_system_prompt: prompt });
      toast.success("تم حفظ إعدادات الذكاء الاصطناعي بنجاح! ✨");
    } catch {
      toast.error("فشل حفظ الإعدادات");
    } finally {
      setSavingBehaviour(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6 pb-10" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold text-white" style={{ fontFamily: '"IBM Plex Sans Arabic", sans-serif' }}>
          إعدادات الذكاء الاصطناعي
        </h1>
        <p className="mt-1 text-sm text-muted" style={{ fontFamily: '"IBM Plex Sans Arabic", sans-serif' }}>
          تحكم في المزود، الموديل، وشخصية المساعد الذكي.
        </p>
      </div>

      {/* ═══════════════════════════════════════════════════════
          Card 1 — AI Behaviour (Model + Custom Prompt)
          ═══════════════════════════════════════════════════════ */}
      {!loadingBehaviour && (
        <div className="rounded-2xl border border-border bg-surface p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/15">
                <Sparkles className="h-5 w-5 text-accent" />
              </div>
              <div>
                <h3 className="font-semibold text-white" style={{ fontFamily: '"IBM Plex Sans Arabic", sans-serif' }}>إعدادات المساعد الذكي</h3>
                <p className="text-xs text-muted">تحكم في شخصية وأوامر المساعد الآلي</p>
              </div>
            </div>
            <button
              onClick={handleSaveBehaviour}
              disabled={savingBehaviour}
              className="flex h-9 items-center gap-2 rounded-lg bg-accent px-4 text-xs font-bold text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
              style={{ fontFamily: '"IBM Plex Sans Arabic", sans-serif' }}
            >
              {savingBehaviour ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              حفظ التغييرات
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <FieldLabel>نموذج الذكاء الاصطناعي (Model)</FieldLabel>
              <select
                value={aiModel}
                onChange={(e) => setAiModel(e.target.value)}
                className="w-full rounded-lg border border-border bg-navy px-3 py-2.5 text-sm text-white focus:border-accent focus:outline-none"
                dir="ltr"
              >
                {integrationAI?.available_models.map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
            </div>

            <div>
              <FieldLabel>البرومبت المخصص (Custom Instructions)</FieldLabel>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="اكتب هنا التعليمات التي تريد من المساعد اتباعها... مثال: كن مرحاً، قدم خصم 10% للعملاء الجدد، ركز على جودة المنتجات."
                className="w-full h-40 rounded-lg border border-border bg-navy px-3 py-2.5 text-sm text-white placeholder:text-muted focus:border-accent focus:outline-none resize-none"
                dir="rtl"
              />
              <p className="mt-2 text-[10px] text-muted leading-relaxed">
                * هذا البرومبت سيتم دمجه مع سياسات العلامة التجارية وسيكون للمساعد رؤية كاملة لآخر 10 منتجات وآخر 3 طلبات للعميل الحالي.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════
          Card 2 — OpenRouter Provider Setup
          ═══════════════════════════════════════════════════════ */}
      {/* Current status */}
      {providerSettings && (
        <div className="rounded-2xl border border-border bg-surface p-5 flex items-center gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/15">
            <Bot className="h-5 w-5 text-accent" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-white" style={{ fontFamily: '"IBM Plex Sans Arabic", sans-serif' }}>
              المزود الحالي
            </p>
            <p className="text-xs text-muted mt-0.5">
              {providerSettings.provider === "openrouter"
                ? `OpenRouter — ${providerSettings.ai_model || "لم يُحدد"}`
                : "Anthropic Claude (الافتراضي)"}
            </p>
          </div>
          {providerSettings.has_openrouter_key && (
            <span className="flex items-center gap-1 rounded-full bg-success/15 px-3 py-1 text-xs font-medium text-success">
              <CheckCircle2 className="h-3.5 w-3.5" /> متصل
            </span>
          )}
        </div>
      )}

      {/* Setup form */}
      <form onSubmit={handleSaveProvider} className="rounded-2xl border border-border bg-surface p-6 space-y-5">
        <div className="flex items-center gap-2 mb-1">
          <Cpu className="h-4 w-4 text-accent" />
          <h2 className="text-sm font-semibold text-white" style={{ fontFamily: '"IBM Plex Sans Arabic", sans-serif' }}>
            إعداد OpenRouter
          </h2>
        </div>

        <div className="rounded-xl border border-border bg-navy px-4 py-3 text-xs text-muted leading-relaxed" style={{ fontFamily: '"IBM Plex Sans Arabic", sans-serif' }}>
          <span className="font-semibold text-slate-300">كيف؟</span> اذهب إلى{" "}
          <span className="font-mono text-accent">openrouter.ai</span> → سجّل دخول → Keys → Create Key
          — ثم الصق الـ Key أدناه واختر الموديل.
        </div>

        {/* API Key */}
        <div>
          <FieldLabel>OpenRouter API Key</FieldLabel>
          <div className="relative">
            <input
              type={showKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={providerSettings?.has_openrouter_key ? "••••••••••• (مُعيَّن — اتركه فارغاً للاحتفاظ)" : "sk-or-v1-..."}
              dir="ltr"
              className="w-full rounded-lg border border-border bg-navy px-3 py-2.5 pr-10 text-sm text-white placeholder:text-muted focus:border-accent focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted hover:text-white"
            >
              {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Model selector */}
        <div>
          <FieldLabel>الموديل</FieldLabel>
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            className="w-full rounded-lg border border-border bg-navy px-3 py-2.5 text-sm text-white focus:border-accent focus:outline-none"
            dir="rtl"
          >
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-muted" dir="ltr">{selectedModel}</p>
        </div>

        <button
          type="submit"
          disabled={savingProvider || (!apiKey && !selectedModel)}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-accent py-2.5 text-sm font-semibold text-white hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ fontFamily: '"IBM Plex Sans Arabic", sans-serif' }}
        >
          <Save className="h-4 w-4" />
          {savingProvider ? "جاري الحفظ..." : "حفظ الإعدادات"}
        </button>

        {providerSettings?.has_openrouter_key && (
          <button
            type="button"
            onClick={async () => {
              if (!confirm("هل تريد إزالة OpenRouter والرجوع لـ Anthropic؟")) return;
              setSavingProvider(true);
              try {
                const updated = await saveProviderSettings({ openrouter_api_key: "" });
                setProviderSettings(updated);
                toast.success("تم الرجوع لـ Anthropic Claude");
              } catch {
                toast.error("فشل الحذف");
              } finally {
                setSavingProvider(false);
              }
            }}
            className="w-full rounded-xl border border-danger/30 py-2 text-xs text-danger hover:bg-danger/10 transition-colors"
            style={{ fontFamily: '"IBM Plex Sans Arabic", sans-serif' }}
          >
            إزالة OpenRouter والرجوع للافتراضي (Anthropic)
          </button>
        )}
      </form>
    </div>
  );
}
