"use client";

import { useEffect, useState } from "react";
import { ShoppingCart, ChevronRight, ChevronLeft, RefreshCw } from "lucide-react";
import { getOrders, type Order } from "@/lib/dashboard";
import { useI18n } from "@/context/i18n-context";

function StatusBadge({ status }: { status: string }) {
  const { t } = useI18n();
  const map: Record<string, string> = {
    pending:           t("orders", "statusPending"),
    awaiting_payment:  t("orders", "statusAwaitingPayment"),
    awaiting_receipt:  t("orders", "statusAwaitingReceipt"),
    confirmed:         t("orders", "statusConfirmed"),
    shipped:           t("orders", "statusShipped"),
    delivered:         t("orders", "statusDelivered"),
    cancelled:         t("orders", "statusCancelled"),
  };
  const cls: Record<string, string> = {
    pending:           "bg-yellow-500/15 text-yellow-400",
    awaiting_payment:  "bg-orange-500/15 text-orange-400",
    awaiting_receipt:  "bg-purple-500/15 text-purple-400",
    confirmed:         "bg-success/15 text-success",
    shipped:           "bg-blue-500/15 text-blue-400",
    delivered:         "bg-emerald-500/15 text-emerald-400",
    cancelled:         "bg-danger/15 text-danger",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${cls[status] ?? "bg-white/10 text-muted"}`}>
      {map[status] ?? status}
    </span>
  );
}

const PAGE_SIZE = 25;

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const { t, dir, fontFamily, fmtDate, fmtNum, locale } = useI18n();

  const load = async (p: number) => {
    setLoading(true);
    try {
      const data = await getOrders(PAGE_SIZE, p * PAGE_SIZE);
      setOrders(data);
      setHasMore(data.length === PAGE_SIZE);
    } catch { } finally { setLoading(false); }
  };

  useEffect(() => { load(page); }, [page]);

  const paymentLabel = (method: string | null) => {
    if (!method) return "—";
    const m: Record<string, string> = {
      cod:           t("orders", "paymentCod"),
      instapay:      t("orders", "paymentInstapay"),
      vodafone_cash: t("orders", "paymentVodafone"),
    };
    return m[method] ?? method;
  };

  const currency = t("common", "currency");

  return (
    <div className="p-6 space-y-6" dir={dir}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/15">
            <ShoppingCart className="h-5 w-5 text-accent" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[var(--c-text)]" style={{ fontFamily }}>{t("orders", "title")}</h1>
            <p className="text-xs text-muted" style={{ fontFamily }}>{t("orders", "subtitle")}</p>
          </div>
        </div>
        <button onClick={() => load(page)} disabled={loading}
          className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-muted hover:text-[var(--c-text)] transition-colors disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="rounded-2xl border border-border bg-surface overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-navy">
                {[t("orders","colOrderNum"), t("orders","colStatus"), t("orders","colAmount"), t("orders","colPayment"), t("orders","colDate")].map((h) => (
                  <th key={h} className="px-4 py-3 text-start text-xs font-medium text-muted uppercase tracking-wide" style={{ fontFamily }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>{Array.from({ length: 5 }).map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 rounded bg-white/5 animate-pulse" style={{ width: `${60 + Math.random() * 40}%` }} />
                    </td>
                  ))}</tr>
                ))
              ) : orders.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-16 text-center text-muted" style={{ fontFamily }}>{t("orders", "empty")}</td></tr>
              ) : (
                orders.map((o) => (
                  <tr key={o.id} className="hover:bg-[var(--c-hover)] transition-colors">
                    <td className="px-4 py-3 font-mono text-[var(--c-text)]">{o.shopify_order_number ?? `#${o.shopify_order_id.slice(-6)}`}</td>
                    <td className="px-4 py-3"><StatusBadge status={o.status} /></td>
                    <td className="px-4 py-3 text-[var(--c-text)] font-medium">{fmtNum(o.total_price, { maximumFractionDigits: 2 })} {currency}</td>
                    <td className="px-4 py-3 text-muted">{paymentLabel(o.payment_method)}</td>
                    <td className="px-4 py-3 text-muted">{fmtDate(o.created_at)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {(page > 0 || hasMore) && (
          <div className="flex items-center justify-between border-t border-border px-4 py-3">
            <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0 || loading}
              className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs text-muted hover:text-[var(--c-text)] disabled:opacity-40 transition-colors" style={{ fontFamily }}>
              {dir === "rtl" ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
              {t("orders", "prev")}
            </button>
            <span className="text-xs text-muted" style={{ fontFamily }}>{t("orders", "page")} {fmtNum(page + 1)}</span>
            <button onClick={() => setPage((p) => p + 1)} disabled={!hasMore || loading}
              className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs text-muted hover:text-[var(--c-text)] disabled:opacity-40 transition-colors" style={{ fontFamily }}>
              {t("orders", "next")}
              {dir === "rtl" ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
