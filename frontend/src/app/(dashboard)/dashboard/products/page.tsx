"use client";

import { useEffect, useRef, useState } from "react";
import { Package, ChevronRight, ChevronLeft, RefreshCw, Search } from "lucide-react";
import { getProducts, type Product } from "@/lib/dashboard";
import { useI18n } from "@/context/i18n-context";

function StatusBadge({ status }: { status: string | null }) {
  const { t } = useI18n();
  const map: Record<string, { label: string; cls: string }> = {
    active:   { label: t("products", "statusActive"),   cls: "bg-green-500/15 text-green-400" },
    draft:    { label: t("products", "statusDraft"),    cls: "bg-yellow-500/15 text-yellow-400" },
    archived: { label: t("products", "statusArchived"), cls: "bg-white/10 text-muted" },
  };
  const s = map[status ?? ""] ?? { label: status ?? "—", cls: "bg-white/10 text-muted" };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${s.cls}`}>{s.label}</span>;
}

const PAGE_SIZE = 25;

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [page, setPage] = useState(0);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { t, dir, fontFamily, fmtNum } = useI18n();

  const statuses = [
    { value: "", label: t("products", "all") },
    { value: "active", label: t("products", "statusActive") },
    { value: "draft", label: t("products", "statusDraft") },
    { value: "archived", label: t("products", "statusArchived") },
  ];

  const load = async (p: number, st: string, q: string) => {
    setLoading(true);
    try {
      const data = await getProducts(PAGE_SIZE, p * PAGE_SIZE, st || undefined, q || undefined);
      setProducts(data);
      setHasMore(data.length === PAGE_SIZE);
    } catch { } finally { setLoading(false); }
  };

  useEffect(() => { setPage(0); load(0, status, search); }, [status, search]);
  useEffect(() => { load(page, status, search); }, [page]);

  const handleSearchChange = (val: string) => {
    setSearchInput(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { setSearch(val); setPage(0); }, 400);
  };

  const currency = t("common", "currency");

  return (
    <div className="p-6 space-y-6" dir={dir}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/15">
            <Package className="h-5 w-5 text-accent" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[var(--c-text)]" style={{ fontFamily }}>{t("products", "title")}</h1>
            <p className="text-xs text-muted" style={{ fontFamily }}>{t("products", "subtitle")}</p>
          </div>
        </div>
        <button onClick={() => load(page, status, search)} disabled={loading}
          className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-muted hover:text-[var(--c-text)] transition-colors disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-2 flex-wrap">
          {statuses.map((s) => (
            <button key={s.value} onClick={() => { setStatus(s.value); setPage(0); }}
              className={`rounded-lg px-4 py-1.5 text-sm transition-colors ${status === s.value ? "bg-accent text-white" : "border border-border bg-surface text-muted hover:text-[var(--c-text)]"}`}
              style={{ fontFamily }}>
              {s.label}
            </button>
          ))}
        </div>
        <div className="relative ms-auto">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted pointer-events-none" />
          <input type="text" value={searchInput} onChange={(e) => handleSearchChange(e.target.value)}
            placeholder={t("products", "searchPlaceholder")}
            className="rounded-lg border border-border bg-surface py-1.5 ps-9 pe-3 text-sm text-[var(--c-text)] placeholder:text-muted focus:border-accent focus:outline-none w-56"
            style={{ fontFamily }} />
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-surface overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-navy">
                {[t("products","colProduct"), t("products","colStatus"), t("products","colPrice"), t("products","colStock")].map((h) => (
                  <th key={h} className="px-4 py-3 text-start text-xs font-medium text-muted uppercase tracking-wide" style={{ fontFamily }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-white/5 animate-pulse shrink-0" />
                        <div className="h-4 w-40 rounded bg-white/5 animate-pulse" />
                      </div>
                    </td>
                    {Array.from({ length: 3 }).map((_, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 rounded bg-white/5 animate-pulse w-20" /></td>
                    ))}
                  </tr>
                ))
              ) : products.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-16 text-center text-muted" style={{ fontFamily }}>{t("products", "empty")}</td></tr>
              ) : (
                products.map((p) => (
                  <tr key={p.id} className="hover:bg-[var(--c-hover)] transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {p.image_url ? (
                          <img src={p.image_url} alt={p.title} className="h-10 w-10 rounded-lg object-cover shrink-0 bg-white/5" />
                        ) : (
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/5 shrink-0">
                            <Package className="h-4 w-4 text-muted" />
                          </div>
                        )}
                        <span className="text-[var(--c-text)] font-medium line-clamp-1">{p.title}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                    <td className="px-4 py-3 text-[var(--c-text)] font-medium" dir="ltr">
                      {p.price > 0 ? `${fmtNum(p.price, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}` : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={p.inventory_qty === 0 ? "text-danger" : p.inventory_qty < 5 ? "text-yellow-400" : "text-[var(--c-text)]"}>
                        {fmtNum(p.inventory_qty)}
                      </span>
                    </td>
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
              {t("products", "prev")}
            </button>
            <span className="text-xs text-muted" style={{ fontFamily }}>{t("products", "page")} {fmtNum(page + 1)}</span>
            <button onClick={() => setPage((p) => p + 1)} disabled={!hasMore || loading}
              className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs text-muted hover:text-[var(--c-text)] disabled:opacity-40 transition-colors" style={{ fontFamily }}>
              {t("products", "next")}
              {dir === "rtl" ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
