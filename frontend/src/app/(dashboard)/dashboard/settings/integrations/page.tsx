"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ShoppingBag, MessageCircle, CheckCircle2, XCircle, RefreshCw, Eye, EyeOff, ChevronDown, ChevronUp, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import {
  getShopifyStatus, connectShopify, retryShopifyWebhooks,
  getWhatsAppStatus, connectWhatsApp, verifyWhatsApp,
  type ShopifyStatus, type WhatsAppStatus,
} from "@/lib/integrations";

// ─── Tiny helpers ──────────────────────────────────────────

function StatusBadge({ connected }: { connected: boolean }) {
  return connected ? (
    <span className="flex items-center gap-1.5 rounded-full bg-success/15 px-3 py-1 text-xs font-medium text-success">
      <CheckCircle2 className="h-3.5 w-3.5" /> متصل
    </span>
  ) : (
    <span className="flex items-center gap-1.5 rounded-full bg-danger/15 px-3 py-1 text-xs font-medium text-danger">
      <XCircle className="h-3.5 w-3.5" /> غير متصل
    </span>
  );
}

function WebhookRow({ topic, status, id, onRetry }: {
  topic: string; status: string; id: string | null; onRetry?: () => void;
}) {
  const ok = status === "connected";
  return (
    <div className="flex items-center justify-between py-2 text-sm">
      <span className="text-muted font-mono">{topic}</span>
      <div className="flex items-center gap-2">
        {ok ? (
          <span className="flex items-center gap-1 text-success"><CheckCircle2 className="h-4 w-4" /> متصل</span>
        ) : (
          <>
            <span className="flex items-center gap-1 text-danger"><XCircle className="h-4 w-4" /> فشل</span>
            {onRetry && (
              <button onClick={onRetry} className="flex items-center gap-1 rounded px-2 py-0.5 text-xs bg-white/5 hover:bg-white/10 text-muted hover:text-white transition-colors">
                <RefreshCw className="h-3 w-3" /> إعادة المحاولة
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function SecretInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-border bg-navy px-3 py-2.5 pr-10 text-sm text-white placeholder:text-muted focus:border-accent focus:outline-none"
        dir="ltr"
      />
      <button type="button" onClick={() => setShow(!show)} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted hover:text-white">
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

function HelpBox({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-xs text-accent hover:text-accent/80 transition-colors"
      >
        {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        كيف أجد هذا؟
      </button>
      {open && (
        <div className="mt-2 rounded-lg border border-border bg-navy p-3 text-xs text-muted leading-relaxed whitespace-pre-line">
          {children}
        </div>
      )}
    </div>
  );
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={copy} className="ml-2 shrink-0 rounded p-1 text-muted hover:text-white hover:bg-white/10 transition-colors">
      {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
    </button>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-sm font-medium text-slate-300 mb-1.5" style={{ fontFamily: '"IBM Plex Sans Arabic", sans-serif' }}>
      {children}
    </label>
  );
}

function TextInput({ value, onChange, placeholder, dir = "ltr" }: { value: string; onChange: (v: string) => void; placeholder?: string; dir?: "ltr" | "rtl" }) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      dir={dir}
      className="w-full rounded-lg border border-border bg-navy px-3 py-2.5 text-sm text-white placeholder:text-muted focus:border-accent focus:outline-none"
    />
  );
}

// ─── Shopify Section ───────────────────────────────────────

function ShopifySection() {
  const [status, setStatus] = useState<ShopifyStatus | null>(null);
  const [domain, setDomain] = useState("");
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    getShopifyStatus().then(setStatus).catch(() => {});
  }, []);

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!domain || !token) return;
    setLoading(true);
    try {
      const result = await connectShopify({ shop_domain: domain.trim(), access_token: token.trim() });
      toast.success("تم ربط Shopify بنجاح! ✅");
      setStatus({ connected: result.connected, domain: result.domain, connected_at: null, webhooks: result.webhooks });
      setToken("");
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || "فشل الاتصال بـ Shopify";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleRetry = async () => {
    setRetrying(true);
    try {
      const result = await retryShopifyWebhooks();
      toast.success("تم إعادة تسجيل الـ webhooks");
      if (status) setStatus({ ...status, webhooks: result.webhooks });
    } catch {
      toast.error("فشلت إعادة المحاولة");
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-surface p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#96BF48]/15">
            <ShoppingBag className="h-5 w-5 text-[#96BF48]" />
          </div>
          <div>
            <h3 className="font-semibold text-white" style={{ fontFamily: '"IBM Plex Sans Arabic", sans-serif' }}>Shopify</h3>
            {status?.domain && <p className="text-xs text-muted">{status.domain}</p>}
          </div>
        </div>
        <StatusBadge connected={!!status?.connected} />
      </div>

      {/* Webhooks status */}
      {status?.connected && status.webhooks && (
        <div className="rounded-xl border border-border bg-navy p-4 space-y-1">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-muted uppercase tracking-wide" style={{ fontFamily: '"IBM Plex Sans Arabic", sans-serif' }}>حالة الـ Webhooks</p>
            <button
              onClick={handleRetry}
              disabled={retrying}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs bg-white/5 hover:bg-white/10 text-muted hover:text-white transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`h-3 w-3 ${retrying ? "animate-spin" : ""}`} />
              إعادة المحاولة
            </button>
          </div>
          {Object.entries(status.webhooks).map(([topic, wh]) => (
            <WebhookRow key={topic} topic={topic} status={wh.status} id={wh.id} />
          ))}
        </div>
      )}

      {/* Connect form */}
      <form onSubmit={handleConnect} className="space-y-4">
        <div>
          <FieldLabel>نطاق المتجر (Shopify Domain)</FieldLabel>
          <TextInput value={domain} onChange={setDomain} placeholder="mystore.myshopify.com" />
          <HelpBox>{`الرابط في متصفحك عند فتح Shopify Admin
مثال: https://mystore.myshopify.com/admin
انسخ الجزء: mystore.myshopify.com`}</HelpBox>
        </div>

        <div>
          <FieldLabel>Admin API Access Token</FieldLabel>
          <SecretInput value={token} onChange={setToken} placeholder="shpat_xxxxxxxxxxxxxxxxxxxx" />
          <HelpBox>{`في Shopify Admin الخاص بمتجرك:
١. Settings → Apps and sales channels
٢. Develop apps → Allow custom app development
٣. Create an app → أدخل اسم التطبيق
٤. Configuration → Admin API scopes → اختر:
   ✓ read_orders   ✓ write_orders
   ✓ read_products ✓ read_customers
٥. Save → Install app
٦. انسخ Admin API access token (يظهر مرة واحدة فقط!)`}</HelpBox>
        </div>

        <button
          type="submit"
          disabled={loading || !domain || !token}
          className="w-full rounded-xl bg-accent py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ fontFamily: '"IBM Plex Sans Arabic", sans-serif' }}
        >
          {loading ? "جاري الاتصال..." : status?.connected ? "تحديث الاتصال" : "ربط المتجر"}
        </button>
      </form>
    </div>
  );
}

// ─── WhatsApp Section ──────────────────────────────────────

function WhatsAppSection() {
  const [status, setStatus] = useState<WhatsAppStatus | null>(null);
  const [form, setForm] = useState({ waba_id: "", phone_number_id: "", phone_number: "", access_token: "" });
  const [testPhone, setTestPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    getWhatsAppStatus().then(setStatus).catch(() => {});
  }, []);

  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    const { waba_id, phone_number_id, phone_number, access_token } = form;
    if (!waba_id || !phone_number_id || !phone_number || !access_token) return;
    setLoading(true);
    try {
      const result = await connectWhatsApp(form);
      toast.success("تم حفظ بيانات WhatsApp!");
      setStatus({
        connected: result.connected,
        phone_number: result.phone_number,
        waba_id: form.waba_id,
        webhook_url: result.webhook_url,
        verify_token: result.verify_token,
        connected_at: result.connected_at,
      });
      setForm({ waba_id: "", phone_number_id: "", phone_number: "", access_token: "" });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || "فشل الحفظ";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (!testPhone) return;
    setVerifying(true);
    try {
      await verifyWhatsApp(testPhone);
      toast.success("تم إرسال رسالة الاختبار بنجاح! ✅");
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || "فشل التحقق";
      toast.error(msg);
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-surface p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#25D366]/15">
            <MessageCircle className="h-5 w-5 text-[#25D366]" />
          </div>
          <div>
            <h3 className="font-semibold text-white" style={{ fontFamily: '"IBM Plex Sans Arabic", sans-serif' }}>WhatsApp Business</h3>
            {status?.phone_number && <p className="text-xs text-muted">{status.phone_number}</p>}
          </div>
        </div>
        <StatusBadge connected={!!status?.connected} />
      </div>

      {/* Webhook info (shown after connecting) */}
      {status?.connected && status.webhook_url && (
        <div className="rounded-xl border border-border bg-navy p-4 space-y-3">
          <p className="text-xs font-medium text-muted uppercase tracking-wide mb-3" style={{ fontFamily: '"IBM Plex Sans Arabic", sans-serif' }}>
            بيانات الـ Webhook — الصقها في Meta Business Manager
          </p>
          <div>
            <p className="text-xs text-muted mb-1">Webhook URL</p>
            <div className="flex items-center rounded-lg border border-border bg-navy-light px-3 py-2">
              <span className="flex-1 text-xs font-mono text-white break-all" dir="ltr">{status.webhook_url}</span>
              <CopyButton value={status.webhook_url} />
            </div>
          </div>
          <div>
            <p className="text-xs text-muted mb-1">Verify Token</p>
            <div className="flex items-center rounded-lg border border-border bg-navy-light px-3 py-2">
              <span className="flex-1 text-xs font-mono text-white" dir="ltr">{status.verify_token}</span>
              <CopyButton value={status.verify_token!} />
            </div>
          </div>
          <p className="text-xs text-muted leading-relaxed" style={{ fontFamily: '"IBM Plex Sans Arabic", sans-serif' }}>
            اذهب إلى Meta Business Manager → WhatsApp → Configuration → Webhook → Edit
            والصق الرابط والـ Verify Token أعلاه، ثم اشترك في: messages, message_status
          </p>

          {/* Test message */}
          <div className="border-t border-border pt-3 space-y-2">
            <p className="text-xs font-medium text-slate-300" style={{ fontFamily: '"IBM Plex Sans Arabic", sans-serif' }}>
              التحقق من الاتصال — أرسل رسالة اختبار
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
                placeholder="201001234567"
                dir="ltr"
                className="flex-1 rounded-lg border border-border bg-navy px-3 py-2 text-sm text-white placeholder:text-muted focus:border-accent focus:outline-none"
              />
              <button
                onClick={handleVerify}
                disabled={verifying || !testPhone}
                className="rounded-lg bg-[#25D366]/20 px-4 py-2 text-sm font-medium text-[#25D366] hover:bg-[#25D366]/30 transition-colors disabled:opacity-50"
                style={{ fontFamily: '"IBM Plex Sans Arabic", sans-serif' }}
              >
                {verifying ? "جاري الإرسال..." : "تحقق"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Connect form */}
      <form onSubmit={handleConnect} className="space-y-4">
        <div className="rounded-xl border border-border bg-navy px-4 py-3 text-xs text-muted" style={{ fontFamily: '"IBM Plex Sans Arabic", sans-serif' }}>
          <span className="font-semibold text-slate-300">الخطوات الأربع:</span> WABA ID → Phone Number ID → رقم الهاتف → Access Token
        </div>

        {/* Step 1 */}
        <div>
          <FieldLabel>① WhatsApp Business Account ID (WABA ID)</FieldLabel>
          <TextInput value={form.waba_id} onChange={set("waba_id")} placeholder="123456789012345" />
          <HelpBox>{`اذهب إلى business.facebook.com
→ Settings (الإعدادات)
→ WhatsApp Accounts
→ انسخ الـ Account ID`}</HelpBox>
        </div>

        {/* Step 2 */}
        <div>
          <FieldLabel>② Phone Number ID</FieldLabel>
          <TextInput value={form.phone_number_id} onChange={set("phone_number_id")} placeholder="123456789012345" />
          <HelpBox>{`في Meta Business Manager:
→ WhatsApp → Phone Numbers
→ اختر رقمك → انسخ الـ Phone Number ID`}</HelpBox>
        </div>

        <div>
          <FieldLabel>رقم الهاتف المعروض</FieldLabel>
          <TextInput value={form.phone_number} onChange={set("phone_number")} placeholder="+201XXXXXXXXX" />
        </div>

        {/* Step 3 */}
        <div>
          <FieldLabel>③ Permanent Access Token</FieldLabel>
          <SecretInput value={form.access_token} onChange={set("access_token")} placeholder="EAAxxxxxxxxxxxxxxxx..." />
          <HelpBox>{`في business.facebook.com:
→ Settings → System Users
→ Add → أنشئ System User بصلاحية Admin
→ Generate Token
→ اختر تطبيقك
→ فعّل: whatsapp_business_messaging + whatsapp_business_management
→ انسخ التوكن (لن يظهر مرة أخرى!)`}</HelpBox>
        </div>

        <button
          type="submit"
          disabled={loading || !form.waba_id || !form.phone_number_id || !form.phone_number || !form.access_token}
          className="w-full rounded-xl bg-[#25D366]/20 py-2.5 text-sm font-semibold text-[#25D366] hover:bg-[#25D366]/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-[#25D366]/30"
          style={{ fontFamily: '"IBM Plex Sans Arabic", sans-serif' }}
        >
          {loading ? "جاري الحفظ..." : status?.connected ? "تحديث البيانات" : "ربط WhatsApp Business"}
        </button>
      </form>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────

export default function IntegrationsPage() {
  const searchParams = useSearchParams();

  useEffect(() => {
    // Clean any stale query params from previous OAuth attempts
    if (searchParams.get("shopify")) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [searchParams]);

  return (
    <div className="max-w-2xl space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold text-white" style={{ fontFamily: '"IBM Plex Sans Arabic", sans-serif' }}>
          التكاملات
        </h1>
        <p className="mt-1 text-sm text-muted" style={{ fontFamily: '"IBM Plex Sans Arabic", sans-serif' }}>
          اربط متجرك وحساب WhatsApp Business لتفعيل الذكاء الاصطناعي.
        </p>
      </div>

      <ShopifySection />
      <WhatsAppSection />
    </div>
  );
}
