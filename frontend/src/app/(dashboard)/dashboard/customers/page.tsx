"use client";

import { useEffect, useState } from "react";
import { Users, ChevronRight, ChevronLeft, RefreshCw } from "lucide-react";
import { getCustomers, type Customer } from "@/lib/dashboard";
import { useI18n } from "@/context/i18n-context";

function SegmentBadge({ segment }: { segment: string }) {
  const { t } = useI18n();
  const map: Record<string, { label: string; cls: string }> = {
    new:     { label: t("customers", "segNew"),    cls: "bg-blue-500/15 text-blue-400" },
    vip:     { label: t("customers", "segVip"),    cls: "bg-yellow-500/15 text-yellow-400" },
    at_risk: { label: t("customers", "segAtRisk"), cls: "bg-danger/15 text-danger" },
  };
  const s = map[segment] ?? { label: segment, cls: "bg-white/10 text-muted" };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${s.cls}`}>
      {s.label}
    </span>
  );
}

const PAGE_SIZE = 25;

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [page, setPage] = useState(0);
  const [segment, setSegment] = useState("");
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const { t, dir, fontFamily, fmtDate, fmtNum } = useI18n();

  const load = async (p: number, seg: string) => {
    setLoading(true);
    try {
      const data = await getCustomers(PAGE_SIZE, p * PAGE_SIZE, seg || undefined);
      setCustomers(data);
      setHasMore(data.length === PAGE_SIZE);
    } catch { } finally { setLoading(false); }
  };

  useEffect(() => { setPage(0); load(0, segment); }, [segment]);
  useEffect(() => { load(page, segment); }, [page]);

  const segments = [
    { value: "", label: t("customers", "segAll") },
    { value: "new", label: t("customers", "segNew") },
    { value: "vip", label: t("customers", "segVip") },
    { value: "at_risk", label: t("customers", "segAtRisk") },
  ];

  const currency = t("common", "currency");

  return (
    <div className="p-6 space-y-6" dir={dir}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/15">
            <Users className="h-5 w-5 text-accent" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[var(--c-text)]" style={{ fontFamily }}>{t("customers", "title")}</h1>
            <p className="text-xs text-muted" style={{ fontFamily }}>{t("customers", "subtitle")}</p>
          </div>
        </div>
        <button onClick={() => load(page, segment)} disabled={loading}
          className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-muted hover:text-[var(--c-text)] transition-colors disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="flex gap-2 flex-wrap">
        {segments.map((s) => (
          <button key={s.value} onClick={() => setSegment(s.value)}
            className={`rounded-lg px-4 py-1.5 text-sm transition-colors ${segment === s.value ? "bg-accent text-white" : "border border-border bg-surface text-muted hover:text-[var(--c-text)]"}`}
            style={{ fontFamily }}>
            {s.label}
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-border bg-surface overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-navy">
                {[t("customers","colName"), t("customers","colPhone"), t("customers","colSegment"),
                  t("customers","colOrders"), t("customers","colSpent"), t("customers","colLastOrder")].map((h) => (
                  <th key={h} className="px-4 py-3 text-start text-xs font-medium text-muted uppercase tracking-wide" style={{ fontFamily }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>{Array.from({ length: 6 }).map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 rounded bg-white/5 animate-pulse" style={{ width: `${50 + Math.random() * 50}%` }} />
                    </td>
                  ))}</tr>
                ))
              ) : customers.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-16 text-center text-muted" style={{ fontFamily }}>{t("customers", "empty")}</td></tr>
              ) : (
                customers.map((c) => (
                  <tr key={c.id} className="hover:bg-[var(--c-hover)] transition-colors">
                    <td className="px-4 py-3 text-[var(--c-text)]">{c.name ?? "—"}</td>
                    <td className="px-4 py-3 font-mono text-muted" dir="ltr">{c.phone}</td>
                    <td className="px-4 py-3"><SegmentBadge segment={c.segment} /></td>
                    <td className="px-4 py-3 text-[var(--c-text)] font-medium">{c.total_orders}</td>
                    <td className="px-4 py-3 text-[var(--c-text)]">
                      {c.total_spent > 0 ? `${fmtNum(c.total_spent, { maximumFractionDigits: 2 })} ${currency}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-muted">{fmtDate(c.last_order_date)}</td>
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
              {t("customers", "prev")}
            </button>
            <span className="text-xs text-muted" style={{ fontFamily }}>{t("customers", "page")} {fmtNum(page + 1)}</span>
            <button onClick={() => setPage((p) => p + 1)} disabled={!hasMore || loading}
              className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs text-muted hover:text-[var(--c-text)] disabled:opacity-40 transition-colors" style={{ fontFamily }}>
              {t("customers", "next")}
              {dir === "rtl" ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
