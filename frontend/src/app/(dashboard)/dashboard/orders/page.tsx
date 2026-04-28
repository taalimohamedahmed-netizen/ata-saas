"use client";

import { useEffect, useState } from "react";
import { ShoppingCart, ChevronRight, ChevronLeft, RefreshCw } from "lucide-react";
import { getOrders, type Order } from "@/lib/dashboard";

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  pending:          { label: "قيد الانتظار",      cls: "bg-yellow-500/15 text-yellow-400" },
  awaiting_payment: { label: "انتظار الدفع",       cls: "bg-orange-500/15 text-orange-400" },
  awaiting_receipt: { label: "انتظار الإيصال",    cls: "bg-purple-500/15 text-purple-400" },
  confirmed:        { label: "مؤكد",               cls: "bg-success/15 text-success" },
  shipped:          { label: "تم الشحن",           cls: "bg-blue-500/15 text-blue-400" },
  delivered:        { label: "تم التوصيل",         cls: "bg-emerald-500/15 text-emerald-400" },
  cancelled:        { label: "ملغي",               cls: "bg-danger/15 text-danger" },
};

const PAYMENT_MAP: Record<string, string> = {
  cod:           "كاش",
  instapay:      "InstaPay",
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
  return new Date(iso).toLocaleDateString("ar-EG", { day: "2-digit", month: "short", year: "numeric" });
}

function formatMoney(amount: number, currency: string) {
  return `${amount.toLocaleString("ar-EG", { maximumFractionDigits: 2 })} ${currency}`;
}

const PAGE_SIZE = 25;

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);

  const load = async (p: number) => {
    setLoading(true);
    try {
      const data = await getOrders(PAGE_SIZE, p * PAGE_SIZE);
      setOrders(data);
      setHasMore(data.length === PAGE_SIZE);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(page); }, [page]);

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/15">
            <ShoppingCart className="h-5 w-5 text-accent" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white" style={{ fontFamily: '"IBM Plex Sans Arabic", sans-serif' }}>
              الطلبات
            </h1>
            <p className="text-xs text-muted" style={{ fontFamily: '"IBM Plex Sans Arabic", sans-serif' }}>
              جميع الطلبات الواردة من Shopify
            </p>
          </div>
        </div>
        <button
          onClick={() => load(page)}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-muted hover:text-white transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-border bg-surface overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-navy">
                <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase tracking-wide">رقم الطلب</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase tracking-wide">الحالة</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase tracking-wide">المبلغ</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase tracking-wide">الدفع</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase tracking-wide">تاريخ الإنشاء</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 5 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 rounded bg-white/5 animate-pulse" style={{ width: `${60 + Math.random() * 40}%` }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-16 text-center text-muted" style={{ fontFamily: '"IBM Plex Sans Arabic", sans-serif' }}>
                    لا توجد طلبات بعد — ستظهر هنا فور وصول أي طلب من Shopify
                  </td>
                </tr>
              ) : (
                orders.map((o) => (
                  <tr key={o.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3 font-mono text-white">
                      {o.shopify_order_number ?? `#${o.shopify_order_id.slice(-6)}`}
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={o.status} /></td>
                    <td className="px-4 py-3 text-white font-medium">{formatMoney(o.total_price, o.currency)}</td>
                    <td className="px-4 py-3 text-muted">{o.payment_method ? PAYMENT_MAP[o.payment_method] ?? o.payment_method : "—"}</td>
                    <td className="px-4 py-3 text-muted">{formatDate(o.created_at)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
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
            <span className="text-xs text-muted" style={{ fontFamily: '"IBM Plex Sans Arabic", sans-serif' }}>
              صفحة {page + 1}
            </span>
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
