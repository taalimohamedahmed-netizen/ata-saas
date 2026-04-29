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

// ── Status helpers ──────────────────────────────────────────────────────────

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  pending:           { label: "انتظار",       cls: "bg-yellow-500/15 text-yellow-400" },
  awaiting_payment:  { label: "اختيار دفع",  cls: "bg-blue-500/15 text-blue-400" },
  awaiting_receipt:  { label: "انتظار إيصال", cls: "bg-orange-500/15 text-orange-400" },
};

const METHOD_MAP: Record<string, string> = {
  cod:           "كاش عند الاستلام",
  instapay:      "إنستا باي",
  vodafone_cash: "فودافون كاش",
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_MAP[status] ?? { label: status, cls: "bg-white/10 text-muted" };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${s.cls}`}>
      {s.label}
    </span>
  );
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("ar-EG", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

// ── Settings panel ──────────────────────────────────────────────────────────

function PaymentSettingsPanel() {
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
      <label className="flex items-center gap-2 text-xs font-medium text-muted" style={{ fontFamily: '"IBM Plex Sans Arabic", sans-serif' }}>
        {icon}
        {label}
      </label>
      <input
        type="text"
        value={settings[key] ?? ""}
        onChange={(e) => setSettings((p) => ({ ...p, [key]: e.target.value }))}
        placeholder={placeholder}
        disabled={loading}
        className="w-full rounded-lg border border-border bg-navy px-3 py-2 text-sm text-white placeholder:text-muted/50 focus:border-accent focus:outline-none disabled:opacity-50"
        dir="ltr"
      />
    </div>
  );

  return (
    <div className="rounded-2xl border border-border bg-surface p-5 space-y-5">
      <h2 className="text-sm font-semibold text-white flex items-center gap-2" style={{ fontFamily: '"IBM Plex Sans Arabic", sans-serif' }}>
        <Banknote className="h-4 w-4 text-accent" />
        إعدادات وسائل الدفع
      </h2>

      {/* InstaPay */}
      <div className="space-y-3 rounded-xl border border-border/60 p-4">
        <p className="text-xs font-bold text-accent uppercase tracking-wider">InstaPay</p>
        {field("instapay_number", "رقم المحفظة / IPA Address", "01XXXXXXXXX@instapay", <Phone className="h-3.5 w-3.5" />)}
        {field("instapay_link", "رابط الدفع المباشر", "https://ipn.eg/S/...", <Link2 className="h-3.5 w-3.5" />)}
      </div>

      {/* Vodafone Cash */}
      <div className="space-y-3 rounded-xl border border-border/60 p-4">
        <p className="text-xs font-bold text-yellow-400 uppercase tracking-wider">Vodafone Cash</p>
        {field("vodafone_number", "رقم فودافون كاش", "01XXXXXXXXX", <Smartphone className="h-3.5 w-3.5" />)}
        {field("vodafone_link", "رابط الدفع المباشر (اختياري)", "https://...", <Link2 className="h-3.5 w-3.5" />)}
      </div>

      <button
        onClick={handleSave}
        disabled={saving || loading}
        className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        style={{ fontFamily: '"IBM Plex Sans Arabic", sans-serif' }}
      >
        {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        {saved ? "✅ تم الحفظ" : "حفظ الإعدادات"}
      </button>
    </div>
  );
}

// ── Pending orders table ────────────────────────────────────────────────────

const PAGE_SIZE = 25;

function PendingOrdersTable() {
  const [orders, setOrders] = useState<PendingOrder[]>([]);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);

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
        <h2 className="text-sm font-semibold text-white flex items-center gap-2" style={{ fontFamily: '"IBM Plex Sans Arabic", sans-serif' }}>
          <ClipboardCheck className="h-4 w-4 text-accent" />
          الطلبات المعلقة
        </h2>
        <button
          onClick={() => load(page)}
          disabled={loading}
          className="flex items-center gap-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs text-muted hover:text-white transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="rounded-2xl border border-border bg-surface overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-navy">
                <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase tracking-wide">رقم الأوردر</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase tracking-wide">العميل</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase tracking-wide">الحالة</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase tracking-wide">طريقة الدفع</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase tracking-wide">الإجمالي</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase tracking-wide">التاريخ</th>
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
                  <td colSpan={6} className="px-4 py-16 text-center text-muted" style={{ fontFamily: '"IBM Plex Sans Arabic", sans-serif' }}>
                    لا توجد طلبات معلقة ✅
                  </td>
                </tr>
              ) : (
                orders.map((o) => (
                  <tr key={o.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3 font-mono text-white text-xs">
                      {o.shopify_order_number || `#${o.shopify_order_id}`}
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <p className="text-white text-xs font-medium">{o.customer?.name ?? "—"}</p>
                        {o.customer?.phone && (
                          <p className="text-muted text-xs font-mono" dir="ltr">{o.customer.phone}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={o.status} /></td>
                    <td className="px-4 py-3 text-muted text-xs">
                      {o.payment_method ? METHOD_MAP[o.payment_method] ?? o.payment_method : "—"}
                    </td>
                    <td className="px-4 py-3 text-white font-medium text-xs" dir="ltr">
                      {o.total_price.toLocaleString("en-EG", { minimumFractionDigits: 2 })} {o.currency}
                    </td>
                    <td className="px-4 py-3 text-muted text-xs">{formatDate(o.created_at)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {(page > 0 || hasMore) && (
          <div className="flex items-center justify-between border-t border-border px-4 py-3">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0 || loading}
              className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs text-muted hover:text-white disabled:opacity-40 transition-colors"
              style={{ fontFamily: '"IBM Plex Sans Arabic", sans-serif' }}
            >
              <ChevronRight className="h-4 w-4" /> السابق
            </button>
            <span className="text-xs text-muted" style={{ fontFamily: '"IBM Plex Sans Arabic", sans-serif' }}>صفحة {page + 1}</span>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={!hasMore || loading}
              className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs text-muted hover:text-white disabled:opacity-40 transition-colors"
              style={{ fontFamily: '"IBM Plex Sans Arabic", sans-serif' }}
            >
              التالي <ChevronLeft className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function OrderConfirmationPage() {
  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/15">
          <ClipboardCheck className="h-5 w-5 text-accent" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white" style={{ fontFamily: '"IBM Plex Sans Arabic", sans-serif' }}>
            تأكيد الطلبات
          </h1>
          <p className="text-xs text-muted" style={{ fontFamily: '"IBM Plex Sans Arabic", sans-serif' }}>
            ضبط وسائل الدفع ومتابعة الطلبات المعلقة
          </p>
        </div>
      </div>

      {/* Two-column on large screens */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[380px_1fr]">
        <PaymentSettingsPanel />
        <PendingOrdersTable />
      </div>
    </div>
  );
}
