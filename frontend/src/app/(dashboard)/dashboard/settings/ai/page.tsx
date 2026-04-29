"use client";

import { useEffect, useState } from "react";
import { Bot, Eye, EyeOff, Save, CheckCircle2, Cpu } from "lucide-react";
import { toast } from "sonner";
import { getAISettings, getAIModels, saveAISettings, type AISettings, type AIModel } from "@/lib/settings";

export default function AISettingsPage() {
  const [settings, setSettings] = useState<AISettings | null>(null);
  const [models, setModels] = useState<AIModel[]>([]);
  const [apiKey, setApiKey] = useState("");
  const [selectedModel, setSelectedModel] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([getAISettings(), getAIModels()]).then(([s, m]) => {
      setSettings(s);
      setModels(m);
      setSelectedModel(s.ai_model || "openai/gpt-4o-mini");
    });
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await saveAISettings({
        openrouter_api_key: apiKey || undefined,
        ai_model: selectedModel || undefined,
      });
      setSettings(updated);
      setApiKey("");
      toast.success("تم حفظ إعدادات الذكاء الاصطناعي ✅");
    } catch {
      toast.error("فشل الحفظ — تأكد من الـ API Key");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-xl space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold text-white" style={{ fontFamily: '"IBM Plex Sans Arabic", sans-serif' }}>
          إعدادات الذكاء الاصطناعي
        </h1>
        <p className="mt-1 text-sm text-muted" style={{ fontFamily: '"IBM Plex Sans Arabic", sans-serif' }}>
          اربط OpenRouter لاستخدام أي موديل AI مع المحادثات.
        </p>
      </div>

      {/* Current status */}
      {settings && (
        <div className="rounded-2xl border border-border bg-surface p-5 flex items-center gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/15">
            <Bot className="h-5 w-5 text-accent" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-white" style={{ fontFamily: '"IBM Plex Sans Arabic", sans-serif' }}>
              المزود الحالي
            </p>
            <p className="text-xs text-muted mt-0.5">
              {settings.provider === "openrouter"
                ? `OpenRouter — ${settings.ai_model || "لم يُحدد"}`
                : "Anthropic Claude (الافتراضي)"}
            </p>
          </div>
          {settings.has_openrouter_key && (
            <span className="flex items-center gap-1 rounded-full bg-success/15 px-3 py-1 text-xs font-medium text-success">
              <CheckCircle2 className="h-3.5 w-3.5" /> متصل
            </span>
          )}
        </div>
      )}

      {/* Setup form */}
      <form onSubmit={handleSave} className="rounded-2xl border border-border bg-surface p-6 space-y-5">
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
          <label className="block text-sm font-medium text-slate-300 mb-1.5" style={{ fontFamily: '"IBM Plex Sans Arabic", sans-serif' }}>
            OpenRouter API Key
          </label>
          <div className="relative">
            <input
              type={showKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={settings?.has_openrouter_key ? "••••••••••• (مُعيَّن — اتركه فارغاً للاحتفاظ)" : "sk-or-v1-..."}
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
          <label className="block text-sm font-medium text-slate-300 mb-1.5" style={{ fontFamily: '"IBM Plex Sans Arabic", sans-serif' }}>
            الموديل
          </label>
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
          disabled={saving || (!apiKey && !selectedModel)}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-accent py-2.5 text-sm font-semibold text-white hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ fontFamily: '"IBM Plex Sans Arabic", sans-serif' }}
        >
          <Save className="h-4 w-4" />
          {saving ? "جاري الحفظ..." : "حفظ الإعدادات"}
        </button>

        {settings?.has_openrouter_key && (
          <button
            type="button"
            onClick={async () => {
              if (!confirm("هل تريد إزالة OpenRouter والرجوع لـ Anthropic؟")) return;
              setSaving(true);
              try {
                const updated = await saveAISettings({ openrouter_api_key: "" });
                setSettings(updated);
                toast.success("تم الرجوع لـ Anthropic Claude");
              } catch {
                toast.error("فشل الحذف");
              } finally {
                setSaving(false);
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
