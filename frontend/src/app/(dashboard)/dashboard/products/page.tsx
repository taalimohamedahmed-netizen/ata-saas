"use client";

import { useEffect, useRef, useState } from "react";
import { Package, ChevronRight, ChevronLeft, RefreshCw, Search } from "lucide-react";
import { getProducts, type Product } from "@/lib/dashboard";

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  active:   { label: "نشط",     cls: "bg-green-500/15 text-green-400" },
  draft:    { label: "مسودة",   cls: "bg-yellow-500/15 text-yellow-400" },
  archived: { label: "مؤرشف",  cls: "bg-white/10 text-muted" },
};

const STATUSES = [
  { value: "", label: "الكل" },
  { value: "active", label: "نشط" },
  { value: "draft", label: "مسودة" },
  { value: "archived", label: "مؤرشف" },
];

function StatusBadge({ status }: { status: string | null }) {
  const s = STATUS_MAP[status ?? ""] ?? { label: status ?? "—", cls: "bg-white/10 text-muted" };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${s.cls}`}>
      {s.label}
    </span>
  );
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

  const load = async (p: number, st: string, q: string) => {
    setLoading(true);
    try {
      const data = await getProducts(PAGE_SIZE, p * PAGE_SIZE, st || undefined, q || undefined);
      setProducts(data);
      setHasMore(data.length === PAGE_SIZE);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  // Reset page when filters change
  useEffect(() => {
    setPage(0);
    load(0, status, search);
  }, [status, search]);

  useEffect(() => {
    load(page, status, search);
  }, [page]);

  // Debounce search input
  const handleSearchChange = (val: string) => {
    setSearchInput(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearch(val);
      setPage(0);
    }, 400);
  };

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/15">
            <Package className="h-5 w-5 text-accent" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white" style={{ fontFamily: '"IBM Plex Sans Arabic", sans-serif' }}>
              المنتجات
            </h1>
            <p className="text-xs text-muted" style={{ fontFamily: '"IBM Plex Sans Arabic", sans-serif' }}>
              جميع المنتجات المستوردة من Shopify
            </p>
          </div>
        </div>
        <button
          onClick={() => load(page, status, search)}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-muted hover:text-white transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Status filter */}
        <div className="flex gap-2 flex-wrap">
          {STATUSES.map((s) => (
            <button
              key={s.value}
              onClick={() => { setStatus(s.value); setPage(0); }}
              className={`rounded-lg px-4 py-1.5 text-sm transition-colors ${
                status === s.value
                  ? "bg-accent text-white"
                  : "border border-border bg-surface text-muted hover:text-white"
              }`}
              style={{ fontFamily: '"IBM Plex Sans Arabic", sans-serif' }}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative mr-auto">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted pointer-events-none" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="ابحث باسم المنتج..."
            className="rounded-lg border border-border bg-surface py-1.5 pr-9 pl-3 text-sm text-white placeholder:text-muted focus:border-accent focus:outline-none w-56"
            style={{ fontFamily: '"IBM Plex Sans Arabic", sans-serif' }}
          />
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-border bg-surface overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-navy">
                <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase tracking-wide">المنتج</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase tracking-wide">الموردان</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase tracking-wide">النوع</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase tracking-wide">الحالة</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase tracking-wide">السعر</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase tracking-wide">المخزون</th>
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
                    {Array.from({ length: 5 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 rounded bg-white/5 animate-pulse w-20" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-16 text-center text-muted" style={{ fontFamily: '"IBM Plex Sans Arabic", sans-serif' }}>
                    لا توجد منتجات — اضغط على زر المزامنة في صفحة الإعدادات
                  </td>
                </tr>
              ) : (
                products.map((p) => (
                  <tr key={p.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {p.image_url ? (
                          <img
                            src={p.image_url}
                            alt={p.title}
                            className="h-10 w-10 rounded-lg object-cover shrink-0 bg-white/5"
                          />
                        ) : (
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/5 shrink-0">
                            <Package className="h-4 w-4 text-muted" />
                          </div>
                        )}
                        <span className="text-white font-medium line-clamp-1">{p.title}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted">{p.vendor ?? "—"}</td>
                    <td className="px-4 py-3 text-muted">{p.product_type ?? "—"}</td>
                    <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                    <td className="px-4 py-3 text-white font-medium" dir="ltr">
                      {p.price > 0 ? `${p.price.toLocaleString("en-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EGP` : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={p.inventory_qty === 0 ? "text-danger" : p.inventory_qty < 5 ? "text-yellow-400" : "text-white"}>
                        {p.inventory_qty.toLocaleString()}
                      </span>
                    </td>
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
