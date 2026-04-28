"use client";

import { useEffect, useState } from "react";
import { Users, ChevronRight, ChevronLeft, RefreshCw } from "lucide-react";
import { getCustomers, type Customer } from "@/lib/dashboard";

const SEGMENT_MAP: Record<string, { label: string; cls: string }> = {
  new:      { label: "جديد",   cls: "bg-blue-500/15 text-blue-400" },
  vip:      { label: "VIP",    cls: "bg-yellow-500/15 text-yellow-400" },
  at_risk:  { label: "خطر",   cls: "bg-danger/15 text-danger" },
};

const SEGMENTS = [
  { value: "", label: "الكل" },
  { value: "new", label: "جديد" },
  { value: "vip", label: "VIP" },
  { value: "at_risk", label: "خطر" },
];

function SegmentBadge({ segment }: { segment: string }) {
  const s = SEGMENT_MAP[segment] ?? { label: segment, cls: "bg-white/10 text-muted" };
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

const PAGE_SIZE = 25;

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [page, setPage] = useState(0);
  const [segment, setSegment] = useState("");
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);

  const load = async (p: number, seg: string) => {
    setLoading(true);
    try {
      const data = await getCustomers(PAGE_SIZE, p * PAGE_SIZE, seg || undefined);
      setCustomers(data);
      setHasMore(data.length === PAGE_SIZE);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setPage(0);
    load(0, segment);
  }, [segment]);

  useEffect(() => {
    load(page, segment);
  }, [page]);

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/15">
            <Users className="h-5 w-5 text-accent" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white" style={{ fontFamily: '"IBM Plex Sans Arabic", sans-serif' }}>
              العملاء
            </h1>
            <p className="text-xs text-muted" style={{ fontFamily: '"IBM Plex Sans Arabic", sans-serif' }}>
              جميع العملاء المسجلين تلقائياً من Shopify
            </p>
          </div>
        </div>
        <button
          onClick={() => load(page, segment)}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-muted hover:text-white transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Segment filter */}
      <div className="flex gap-2 flex-wrap">
        {SEGMENTS.map((s) => (
          <button
            key={s.value}
            onClick={() => setSegment(s.value)}
            className={`rounded-lg px-4 py-1.5 text-sm transition-colors ${
              segment === s.value
                ? "bg-accent text-white"
                : "border border-border bg-surface text-muted hover:text-white"
            }`}
            style={{ fontFamily: '"IBM Plex Sans Arabic", sans-serif' }}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-border bg-surface overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-navy">
                <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase tracking-wide">الاسم</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase tracking-wide">رقم الهاتف</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase tracking-wide">الشريحة</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase tracking-wide">الطلبات</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase tracking-wide">إجمالي الإنفاق</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase tracking-wide">آخر طلب</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 6 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 rounded bg-white/5 animate-pulse" style={{ width: `${50 + Math.random() * 50}%` }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : customers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-16 text-center text-muted" style={{ fontFamily: '"IBM Plex Sans Arabic", sans-serif' }}>
                    لا يوجد عملاء بعد — سيظهرون هنا فور وصول أي طلب من Shopify
                  </td>
                </tr>
              ) : (
                customers.map((c) => (
                  <tr key={c.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3 text-white">{c.name ?? "—"}</td>
                    <td className="px-4 py-3 font-mono text-muted" dir="ltr">{c.phone}</td>
                    <td className="px-4 py-3"><SegmentBadge segment={c.segment} /></td>
                    <td className="px-4 py-3 text-white font-medium">{c.total_orders}</td>
                    <td className="px-4 py-3 text-white">
                      {c.total_spent > 0 ? c.total_spent.toLocaleString("ar-EG", { maximumFractionDigits: 2 }) : "—"}
                    </td>
                    <td className="px-4 py-3 text-muted">{formatDate(c.last_order_date)}</td>
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
