"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ShoppingBag, MessageCircle, CheckCircle2, XCircle, RefreshCw, Eye, EyeOff, ChevronDown, ChevronUp, Copy, Check, ExternalLink, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  getShopifyStatus, startShopifyOAuth, retryShopifyWebhooks, syncShopify, disconnectShopify,
  getWhatsAppStatus, connectWhatsApp, verifyWhatsApp,
  type ShopifyStatus, type WhatsAppStatus,
} from "@/lib/integrations";
import { useI18n } from "@/context/i18n-context";

// ─── Tiny helpers ──────────────────────────────────────────

function StatusBadge({ connected }: { connected: boolean }) {
  const { t } = useI18n();
  return connected ? (
    <span className="flex items-center gap-1.5 rounded-full bg-success/15 px-3 py-1 text-xs font-medium text-success">
      <CheckCircle2 className="h-3.5 w-3.5" /> {t("integrations", "connected")}
    </span>
  ) : (
    <span className="flex items-center gap-1.5 rounded-full bg-danger/15 px-3 py-1 text-xs font-medium text-danger">
      <XCircle className="h-3.5 w-3.5" /> {t("integrations", "disconnected")}
    </span>
  );
}

function WebhookRow({ topic, status, onRetry }: {
  topic: string; status: string; id: string | null; onRetry?: () => void;
}) {
  const { t } = useI18n();
  const ok = status === "connected";
  return (
    <div className="flex items-center justify-between py-2 text-sm">
      <span className="text-muted font-mono">{topic}</span>
      <div className="flex items-center gap-2">
        {ok ? (
          <span className="flex items-center gap-1 text-success"><CheckCircle2 className="h-4 w-4" /> {t("integrations", "connected")}</span>
        ) : (
          <>
            <span className="flex items-center gap-1 text-danger"><XCircle className="h-4 w-4" /> {t("integrations", "webhookFailed")}</span>
            {onRetry && (
              <button onClick={onRetry} className="flex items-center gap-1 rounded px-2 py-0.5 text-xs bg-white/5 hover:bg-white/10 text-muted hover:text-[var(--c-text)] transition-colors">
                <RefreshCw className="h-3 w-3" /> {t("integrations", "retry")}
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
        className="w-full rounded-lg border border-border bg-navy px-3 py-2.5 pe-10 text-sm text-[var(--c-text)] placeholder:text-muted focus:border-accent focus:outline-none"
        dir="ltr"
      />
      <button type="button" onClick={() => setShow(!show)} className="absolute end-3 top-1/2 -translate-y-1/2 text-muted hover:text-[var(--c-text)]">
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

function HelpBox({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-xs text-accent hover:text-accent/80 transition-colors"
      >
        {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        {t("integrations", "howToFind")}
      </button>
      {open && (
        <div className="mt-2 rounded-lg border border-border bg-navy p-3 text-xs text-muted leading-relaxed whitespace-pre-line" dir="ltr">
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
    <button onClick={copy} className="ms-2 shrink-0 rounded p-1 text-muted hover:text-[var(--c-text)] hover:bg-white/10 transition-colors">
      {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
    </button>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  const { fontFamily } = useI18n();
  return (
    <label className="block text-sm font-medium text-[var(--c-text-sub)] mb-1.5" style={{ fontFamily }}>
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
      className="w-full rounded-lg border border-border bg-navy px-3 py-2.5 text-sm text-[var(--c-text)] placeholder:text-muted focus:border-accent focus:outline-none"
    />
  );
}

// ─── Shopify Section ───────────────────────────────────────

function ShopifySection() {
  const { t, fontFamily } = useI18n();
  const [status, setStatus] = useState<ShopifyStatus | null>(null);
  const [domain, setDomain] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [loading, setLoading] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  useEffect(() => {
    getShopifyStatus().then(setStatus).catch(() => {});
  }, []);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type !== "shopify_oauth") return;
      setLoading(false);
      if (e.data.result === "success") {
        toast.success(t("integrations", "shopifyConnectSuccess"));
        getShopifyStatus().then(setStatus).catch(() => {});
      } else {
        const msgs: Record<string, string> = {
          missing_params: "Missing parameters — please try again",
          invalid_hmac: "Invalid signature — check your Client Secret",
          bad_state: "Session expired — please try again",
          token_exchange_failed: "Shopify connection failed — check your credentials",
          no_token: "No token received from Shopify",
          missing_credentials: "Client ID or Secret missing",
          tenant_not_found: "Account not found",
        };
        toast.error(msgs[e.data.reason] || "Shopify connection failed — please try again");
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [t]);

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!domain || !clientId || !clientSecret) return;
    setLoading(true);
    try {
      const { redirect_url } = await startShopifyOAuth({
        shop_domain: domain.trim(),
        client_id: clientId.trim(),
        client_secret: clientSecret.trim(),
      });

      const w = 600, h = 700;
      const left = Math.round(window.screenX + (window.outerWidth - w) / 2);
      const top = Math.round(window.screenY + (window.outerHeight - h) / 2);
      const popup = window.open(
        redirect_url,
        "shopify_oauth",
        `width=${w},height=${h},left=${left},top=${top},scrollbars=yes`
      );

      if (!popup) {
        window.location.href = redirect_url;
        return;
      }

      const timer = setInterval(() => {
        if (popup.closed) { clearInterval(timer); setLoading(false); }
      }, 500);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || t("common", "error");
      toast.error(msg);
      setLoading(false);
    }
  };

  const handleRetry = async () => {
    setRetrying(true);
    try {
      const result = await retryShopifyWebhooks();
      toast.success(t("integrations", "retrySuccess"));
      if (status) setStatus({ ...status, webhooks: result.webhooks });
    } catch {
      toast.error(t("integrations", "retryFailed"));
    } finally {
      setRetrying(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const result = await syncShopify();
      if (result.status === "queued") {
        toast.success(result.message || t("integrations", "syncing"));
      } else if (result.synced) {
        const { orders, customers, products } = result.synced as Record<string, number>;
        toast.success(`${orders} orders, ${customers} customers, ${products || 0} products synced ✅`);
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string; error?: string }; statusText?: string }; message?: string })
        ?.response?.data?.detail
        || (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        || t("common", "error");
      toast.error(msg);
    } finally {
      setSyncing(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm(t("integrations", "shopifyDisconnectConfirm"))) return;
    setDisconnecting(true);
    try {
      await disconnectShopify();
      toast.success(t("integrations", "removeStoreSuccess"));
      setStatus(prev => prev ? { ...prev, connected: false, domain: null, webhooks: {}, webhook_urls: {} } : null);
      getShopifyStatus().then(setStatus).catch(() => {});
    } catch {
      toast.error(t("integrations", "removeStoreFailed"));
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-surface p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#96BF48]/15">
            <ShoppingBag className="h-5 w-5 text-[#96BF48]" />
          </div>
          <div>
            <h3 className="font-semibold text-[var(--c-text)]" style={{ fontFamily }}>Shopify</h3>
            {status?.domain && <p className="text-xs text-muted">{status.domain}</p>}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {status?.connected && (
            <button
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="flex h-8 items-center gap-1.5 rounded-lg border border-danger/30 bg-danger/10 px-2.5 text-xs font-medium text-danger hover:bg-danger/20 transition-colors disabled:opacity-50"
              style={{ fontFamily }}
            >
              {disconnecting ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
              {t("integrations", "removeStore")}
            </button>
          )}
          <StatusBadge connected={!!status?.connected} />
        </div>
      </div>

      {status?.connected && status.webhooks && (
        <div className="rounded-xl border border-border bg-navy p-4 space-y-1">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-muted uppercase tracking-wide" style={{ fontFamily }}>{t("integrations", "webhookStatus")}</p>
            <button onClick={handleRetry} disabled={retrying}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs bg-white/5 hover:bg-white/10 text-muted hover:text-[var(--c-text)] transition-colors disabled:opacity-50">
              <RefreshCw className={`h-3 w-3 ${retrying ? "animate-spin" : ""}`} /> {t("integrations", "retry")}
            </button>
          </div>
          {Object.entries(status.webhooks).map(([topic, wh]) => (
            <WebhookRow key={topic} topic={topic} status={wh.status} id={wh.id} />
          ))}
        </div>
      )}

      {status?.connected && status.webhook_urls && Object.keys(status.webhook_urls).length > 0 && (
        <div className="rounded-xl border border-border bg-navy p-4 space-y-3">
          <p className="text-xs font-medium text-muted uppercase tracking-wide" style={{ fontFamily }}>
            {t("integrations", "webhookManualUrls")}
          </p>
          {Object.entries(status.webhook_urls).map(([slug, url]) => (
            <div key={slug}>
              <p className="text-xs text-muted mb-1 font-mono">{slug}</p>
              <div className="flex items-center rounded-lg border border-border bg-navy-light px-3 py-2">
                <span className="flex-1 text-xs font-mono text-[var(--c-text)] break-all" dir="ltr">{url}</span>
                <CopyButton value={url} />
              </div>
            </div>
          ))}
        </div>
      )}

      {status?.connected && (
        <button
          onClick={handleSync}
          disabled={syncing}
          className="w-full flex items-center justify-center gap-2 rounded-xl border border-border bg-navy py-2.5 text-sm font-semibold text-[var(--c-text)] hover:bg-white/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ fontFamily }}
        >
          <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? t("integrations", "syncing") : t("integrations", "syncButton")}
        </button>
      )}

      <form onSubmit={handleConnect} className="space-y-4">
        <div className="rounded-xl border border-border bg-navy px-4 py-3 text-xs text-muted" style={{ fontFamily }}>
          <span className="font-semibold text-[var(--c-text-sub)]">{t("integrations", "shopifyFormHint")}</span>{" "}
          Domain + Client ID + Client Secret
        </div>

        <div>
          <FieldLabel>{t("integrations", "shopifyDomain")}</FieldLabel>
          <TextInput value={domain} onChange={setDomain} placeholder="mystore.myshopify.com" />
          <HelpBox>{`Open your store on Shopify — the URL in the browser
Example: https://mystore.myshopify.com/admin
Copy the part: mystore.myshopify.com`}</HelpBox>
        </div>

        <div>
          <FieldLabel>{t("integrations", "clientId")}</FieldLabel>
          <TextInput value={clientId} onChange={setClientId} placeholder="d25b3250c99c5da4..." />
          <HelpBox>{`Shopify Partners → Apps → select your app
→ App setup → Client credentials
Copy the Client ID`}</HelpBox>
        </div>

        <div>
          <FieldLabel>{t("integrations", "clientSecret")}</FieldLabel>
          <SecretInput value={clientSecret} onChange={setClientSecret} placeholder="shpss_xxxxxxxxxxxxxxxx..." />
          <HelpBox>{`Shopify Partners → Apps → select your app
→ App setup → Client credentials
Copy the Client Secret`}</HelpBox>
        </div>

        <button
          type="submit"
          disabled={loading || !domain || !clientId || !clientSecret}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-accent py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ fontFamily }}
        >
          <ExternalLink className="h-4 w-4" />
          {loading
            ? t("integrations", "shopifyConnecting")
            : status?.connected
              ? t("integrations", "shopifyReconnect")
              : t("integrations", "shopifyConnect")}
        </button>
      </form>
    </div>
  );
}

// ─── WhatsApp Section ──────────────────────────────────────

function WhatsAppSection() {
  const { t, fontFamily } = useI18n();
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
      toast.success(t("integrations", "whatsappSaved"));
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
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || t("common", "error");
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
      toast.success(t("integrations", "whatsappTestSuccess"));
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || t("common", "error");
      toast.error(msg);
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-surface p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#25D366]/15">
            <MessageCircle className="h-5 w-5 text-[#25D366]" />
          </div>
          <div>
            <h3 className="font-semibold text-[var(--c-text)]" style={{ fontFamily }}>WhatsApp Business</h3>
            {status?.phone_number && <p className="text-xs text-muted">{status.phone_number}</p>}
          </div>
        </div>
        <StatusBadge connected={!!status?.connected} />
      </div>

      {status?.connected && status.webhook_url && (
        <div className="rounded-xl border border-border bg-navy p-4 space-y-3">
          <p className="text-xs font-medium text-muted uppercase tracking-wide mb-3" style={{ fontFamily }}>
            {t("integrations", "webhookPasteInfo")}
          </p>
          <div>
            <p className="text-xs text-muted mb-1">Webhook URL</p>
            <div className="flex items-center rounded-lg border border-border bg-navy-light px-3 py-2">
              <span className="flex-1 text-xs font-mono text-[var(--c-text)] break-all" dir="ltr">{status.webhook_url}</span>
              <CopyButton value={status.webhook_url} />
            </div>
          </div>
          <div>
            <p className="text-xs text-muted mb-1">Verify Token</p>
            <div className="flex items-center rounded-lg border border-border bg-navy-light px-3 py-2">
              <span className="flex-1 text-xs font-mono text-[var(--c-text)]" dir="ltr">{status.verify_token}</span>
              <CopyButton value={status.verify_token!} />
            </div>
          </div>
          <p className="text-xs text-muted leading-relaxed" style={{ fontFamily }}>
            {t("integrations", "webhookPasteHint")}
          </p>

          <div className="border-t border-border pt-3 space-y-2">
            <p className="text-xs font-medium text-[var(--c-text-sub)]" style={{ fontFamily }}>
              {t("integrations", "verifyConnection")}
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
                placeholder="201001234567"
                dir="ltr"
                className="flex-1 rounded-lg border border-border bg-navy px-3 py-2 text-sm text-[var(--c-text)] placeholder:text-muted focus:border-accent focus:outline-none"
              />
              <button
                onClick={handleVerify}
                disabled={verifying || !testPhone}
                className="rounded-lg bg-[#25D366]/20 px-4 py-2 text-sm font-medium text-[#25D366] hover:bg-[#25D366]/30 transition-colors disabled:opacity-50"
                style={{ fontFamily }}
              >
                {verifying ? t("integrations", "sending") : t("integrations", "verifyBtn")}
              </button>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleConnect} className="space-y-4">
        <div className="rounded-xl border border-border bg-navy px-4 py-3 text-xs text-muted" style={{ fontFamily }}>
          <span className="font-semibold text-[var(--c-text-sub)]">{t("integrations", "wabaSteps")}</span>{" "}
          WABA ID → Phone Number ID → Phone → Access Token
        </div>

        <div>
          <FieldLabel>① WhatsApp Business Account ID (WABA ID)</FieldLabel>
          <TextInput value={form.waba_id} onChange={set("waba_id")} placeholder="123456789012345" />
          <HelpBox>{`Go to business.facebook.com
→ Settings → WhatsApp Accounts
→ Copy the Account ID`}</HelpBox>
        </div>

        <div>
          <FieldLabel>② Phone Number ID</FieldLabel>
          <TextInput value={form.phone_number_id} onChange={set("phone_number_id")} placeholder="123456789012345" />
          <HelpBox>{`In Meta Business Manager:
→ WhatsApp → Phone Numbers
→ Select your number → Copy the Phone Number ID`}</HelpBox>
        </div>

        <div>
          <FieldLabel>{t("integrations", "displayPhoneNumber")}</FieldLabel>
          <TextInput value={form.phone_number} onChange={set("phone_number")} placeholder="+201XXXXXXXXX" />
        </div>

        <div>
          <FieldLabel>③ Permanent Access Token</FieldLabel>
          <SecretInput value={form.access_token} onChange={set("access_token")} placeholder="EAAxxxxxxxxxxxxxxxx..." />
          <HelpBox>{`In business.facebook.com:
→ Settings → System Users
→ Add → Create System User (Admin)
→ Generate Token → select your app
→ Enable: whatsapp_business_messaging + whatsapp_business_management
→ Copy the token (won't show again!)`}</HelpBox>
        </div>

        <button
          type="submit"
          disabled={loading || !form.waba_id || !form.phone_number_id || !form.phone_number || !form.access_token}
          className="w-full rounded-xl bg-[#25D366]/20 py-2.5 text-sm font-semibold text-[#25D366] hover:bg-[#25D366]/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-[#25D366]/30"
          style={{ fontFamily }}
        >
          {loading
            ? t("integrations", "saving")
            : status?.connected
              ? t("integrations", "whatsappUpdate")
              : t("integrations", "whatsappConnect")}
        </button>
      </form>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────

export default function IntegrationsPage() {
  const { t, dir, fontFamily } = useI18n();
  const searchParams = useSearchParams();

  useEffect(() => {
    const shopify = searchParams.get("shopify");
    const reason = searchParams.get("reason");
    if (!shopify) return;
    window.history.replaceState({}, "", window.location.pathname);

    if (window.opener) {
      window.opener.postMessage({ type: "shopify_oauth", result: shopify, reason }, "*");
      window.close();
      return;
    }

    if (shopify === "success") {
      toast.success(t("integrations", "shopifyConnectSuccess"));
    } else {
      const msgs: Record<string, string> = {
        missing_params: "Missing parameters — please try again",
        invalid_hmac: "Invalid Shopify signature — check your Client Secret",
        bad_state: "Session expired — please try again",
        token_exchange_failed: "Shopify connection failed — check your credentials",
        no_token: "No token received from Shopify",
        tenant_not_found: "Account not found",
        missing_credentials: "Client ID or Client Secret missing — please try again",
      };
      toast.error(msgs[reason ?? ""] || "Shopify connection failed — please try again");
    }
  }, [searchParams, t]);

  return (
    <div className="max-w-2xl space-y-6 pb-10" dir={dir}>
      <div>
        <h1 className="text-2xl font-bold text-[var(--c-text)]" style={{ fontFamily }}>
          {t("integrations", "title")}
        </h1>
        <p className="mt-1 text-sm text-muted" style={{ fontFamily }}>
          {t("integrations", "subtitle")}
        </p>
      </div>

      <ShopifySection />
      <WhatsAppSection />
    </div>
  );
}
