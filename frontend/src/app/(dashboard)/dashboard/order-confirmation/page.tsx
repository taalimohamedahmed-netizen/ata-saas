"use client";

import { useEffect, useState } from "react";
import {
  ClipboardCheck, RefreshCw, Save, ChevronRight, ChevronLeft,
  Banknote, Smartphone, Link2, Phone,
} from "lucide-react";
import {
  getPaymentSettings, savePaymentSettings, getPendingOrders,
  type PaymentSettings, type PendingOrder,
} from "@/lib/dashboard";
import { useI18n } from "@/context/i18n-context";

// ── Settings panel ──────────────────────────────────────────────────────────

function PaymentSettingsPanel() {
  const { t, fontFamily, fmtNum } = useI18n();
  const [settings, setSettings] = useState<PaymentSettings>({
    instapay_number: "", instapay_link: "",
    vodafone_number: "", vodafone_link: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getPaymentSettings().then((s) => {
      setSettings({
        instapay_number: s.instapay_number ?? "",
        instapay_link:   s.instapay_link   ?? "",
        vodafone_number: s.vodafone_number  ?? "",
        vodafone_link:   s.vodafone_link    ?? "",
      });
    }).finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await savePaymentSettings(settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  };

  const field = (
    key: keyof PaymentSettings,
    label: string,
    placeholder: string,
    icon: React.ReactNode,
  ) => (
    <div className="space-y-1.5">
      <label className="flex items-center gap-2 text-xs font-medium text-muted" style={{ fontFamily }}>
        {icon}
        {label}
      </label>
      <input
        type="text"
        value={settings[key] ?? ""}
        onChange={(e) => setSettings((p) => ({ ...p, [key]: e.target.value }))}
        placeholder={placeholder}
        disabled={loading}
        className="w-full rounded-lg border border-border bg-navy px-3 py-2 text-sm text-[var(--c-text)] placeholder:text-muted/50 focus:border-accent focus:outline-none disabled:opacity-50"
        dir="ltr"
      />
    </div>
  );

  return (
    <div className="rounded-2xl border border-border bg-surface p-5 space-y-5">
      <h2 className="text-sm font-semibold text-[var(--c-text)] flex items-center gap-2" style={{ fontFamily }}>
        <Banknote className="h-4 w-4 text-accent" />
        {t("orderConfirmation", "paymentSettings")}
      </h2>

      {/* InstaPay */}
      <div className="space-y-3 rounded-xl border border-border/60 p-4">
        <p className="text-xs font-bold text-accent uppercase tracking-wider">InstaPay</p>
        {field("instapay_number", t("orderConfirmation", "instapayWallet"), "01XXXXXXXXX@instapay", <Phone className="h-3.5 w-3.5" />)}
        {field("instapay_link", t("orderConfirmation", "instapayLink"), "https://ipn.eg/S/...", <Link2 className="h-3.5 w-3.5" />)}
      </div>

      {/* Vodafone Cash */}
      <div className="space-y-3 rounded-xl border border-border/60 p-4">
        <p className="text-xs font-bold text-yellow-400 uppercase tracking-wider">Vodafone Cash</p>
        {field("vodafone_number", t("orderConfirmation", "vodafoneCashNum"), "01XXXXXXXXX", <Smartphone className="h-3.5 w-3.5" />)}
        {field("vodafone_link", t("orderConfirmation", "vodafoneLink"), "https://...", <Link2 className="h-3.5 w-3.5" />)}
      </div>

      <button
        onClick={handleSave}
        disabled={saving || loading}
        className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        style={{ fontFamily }}
      >
        {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        {saved ? t("orderConfirmation", "savedSuccess") : t("orderConfirmation", "saveSettings")}
      </button>
    </div>
  );
}

// ── Pending orders table ────────────────────────────────────────────────────

const PAGE_SIZE = 25;

function PendingOrdersTable() {
  const { t, dir, fontFamily, fmtDate, fmtNum } = useI18n();
  const [orders, setOrders] = useState<PendingOrder[]>([]);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);

  const statusMap: Record<string, { label: string; cls: string }> = {
    pending:           { label: t("orderConfirmation", "statusPending"),          cls: "bg-yellow-500/15 text-yellow-400" },
    awaiting_payment:  { label: t("orderConfirmation", "statusAwaitingPayment"),  cls: "bg-blue-500/15 text-blue-400" },
    awaiting_receipt:  { label: t("orderConfirmation", "statusAwaitingReceipt"),  cls: "bg-orange-500/15 text-orange-400" },
  };

  const methodMap: Record<string, string> = {
    cod:           t("orderConfirmation", "paymentCod"),
    instapay:      t("orderConfirmation", "paymentInstapay"),
    vodafone_cash: t("orderConfirmation", "paymentVodafone"),
  };

  const load = async (p: number) => {
    setLoading(true);
    try {
      const data = await getPendingOrders(PAGE_SIZE, p * PAGE_SIZE);
      setOrders(data);
      setHasMore(data.length === PAGE_SIZE);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(page); }, [page]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[var(--c-text)] flex items-center gap-2" style={{ fontFamily }}>
          <ClipboardCheck className="h-4 w-4 text-accent" />
          {t("orderConfirmation", "pendingOrdersTitle")}
        </h2>
        <button
          onClick={() => load(page)}
          disabled={loading}
          className="flex items-center gap-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs text-muted hover:text-[var(--c-text)] transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="rounded-2xl border border-border bg-surface overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-navy">
                {[
                  t("orderConfirmation","colOrderNum"),
                  t("orderConfirmation","colCustomer"),
                  t("orderConfirmation","colStatus"),
                  t("orderConfirmation","colPayment"),
                  t("orderConfirmation","colTotal"),
                  t("orderConfirmation","colDate"),
                ].map((h) => (
                  <th key={h} className="px-4 py-3 text-start text-xs font-medium text-muted uppercase tracking-wide" style={{ fontFamily }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 6 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 rounded bg-white/5 animate-pulse w-24" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-16 text-center text-muted" style={{ fontFamily }}>
                    {t("orderConfirmation", "noPendingOrders")}
                  </td>
                </tr>
              ) : (
                orders.map((o) => {
                  const s = statusMap[o.status] ?? { label: o.status, cls: "bg-white/10 text-muted" };
                  return (
                    <tr key={o.id} className="hover:bg-[var(--c-hover)] transition-colors">
                      <td className="px-4 py-3 font-mono text-[var(--c-text)] text-xs">
                        {o.shopify_order_number || `#${o.shopify_order_id}`}
                      </td>
                      <td className="px-4 py-3">
                        <div>
                          <p className="text-[var(--c-text)] text-xs font-medium">{o.customer?.name ?? "—"}</p>
                          {o.customer?.phone && (
                            <p className="text-muted text-xs font-mono" dir="ltr">{o.customer.phone}</p>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${s.cls}`}>
                          {s.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted text-xs">
                        {o.payment_method ? methodMap[o.payment_method] ?? o.payment_method : "—"}
                      </td>
                      <td className="px-4 py-3 text-[var(--c-text)] font-medium text-xs" dir="ltr">
                        {fmtNum(o.total_price, { minimumFractionDigits: 2 })} {o.currency}
                      </td>
                      <td className="px-4 py-3 text-muted text-xs">
                        {fmtDate(o.created_at, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {(page > 0 || hasMore) && (
          <div className="flex items-center justify-between border-t border-border px-4 py-3">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0 || loading}
              className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs text-muted hover:text-[var(--c-text)] disabled:opacity-40 transition-colors"
              style={{ fontFamily }}
            >
              {dir === "rtl" ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
              {t("orderConfirmation", "prev")}
            </button>
            <span className="text-xs text-muted" style={{ fontFamily }}>
              {t("orderConfirmation", "page")} {fmtNum(page + 1)}
            </span>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={!hasMore || loading}
              className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs text-muted hover:text-[var(--c-text)] disabled:opacity-40 transition-colors"
              style={{ fontFamily }}
            >
              {t("orderConfirmation", "next")}
              {dir === "rtl" ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function OrderConfirmationPage() {
  const { t, dir, fontFamily } = useI18n();

  return (
    <div className="p-6 space-y-6" dir={dir}>
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/15">
          <ClipboardCheck className="h-5 w-5 text-accent" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-[var(--c-text)]" style={{ fontFamily }}>
            {t("orderConfirmation", "title")}
          </h1>
          <p className="text-xs text-muted" style={{ fontFamily }}>
            {t("orderConfirmation", "subtitle")}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[380px_1fr]">
        <PaymentSettingsPanel />
        <PendingOrdersTable />
      </div>
    </div>
  );
}
