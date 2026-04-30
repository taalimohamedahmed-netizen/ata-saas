"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ShoppingCart, Users, TrendingUp, CheckCircle2,
  MoreVertical, ArrowUpRight, Package, MessageSquare,
  Calendar, ChevronDown,
} from "lucide-react";
import { useAuthStore } from "@/store/auth-store";
import { getStats, type DashboardStats } from "@/lib/dashboard";
import { useI18n } from "@/context/i18n-context";

/* ── shared card shell ── */
function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl p-5 ${className}`}
      style={{ background: "var(--c-navy-card)" }}
    >
      {children}
    </div>
  );
}

/* ── card header row ── */
function CardHeader({ title, fontFamily }: { title: string; fontFamily: string }) {
  return (
    <div className="flex items-center justify-between mb-2">
      <span className="text-sm" style={{ color: "var(--c-muted)", fontFamily }}>{title}</span>
      <button className="p-1 rounded-lg hover:bg-white/5 transition-colors">
        <MoreVertical className="h-4 w-4" style={{ color: "var(--c-muted)" }} />
      </button>
    </div>
  );
}

export default function DashboardPage() {
  const tenantName = useAuthStore((s) => s.tenantName);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const { t, dir, fontFamily, fmtNum } = useI18n();

  useEffect(() => { getStats().then(setStats).catch(() => {}); }, []);

  const fmt = (n?: number) => (n === undefined ? "—" : fmtNum(n));
  const currency = t("common", "currency");

  const total     = stats?.total_orders     ?? 0;
  const confirmed = stats?.confirmed_orders ?? 0;
  const pending   = Math.max(total - confirmed, 0);
  const customers = stats?.total_customers  ?? 0;
  const vip       = stats?.vip_customers    ?? 0;

  const confirmedPct = total     > 0 ? Math.round((confirmed / total)     * 100) : 0;
  const pendingPct   = total     > 0 ? Math.round((pending   / total)     * 100) : 0;
  const vipPct       = customers > 0 ? Math.round((vip       / customers) * 100) : 0;

  const today = new Date().toLocaleDateString(dir === "rtl" ? "ar-EG" : "en-US", {
    day: "numeric", month: "long", year: "numeric",
  });

  /* decorative monthly bars — no time-series API */
  const currentMonth = new Date().getMonth();
  const chartBars = [
    { l: "Jan", v: 35 }, { l: "Feb", v: 55 }, { l: "Mar", v: 42 },
    { l: "Apr", v: 70 }, { l: "May", v: 50 }, { l: "Jun", v: 80 },
    { l: "Jul", v: 60 }, { l: "Aug", v: 45 }, { l: "Sep", v: 90 },
    { l: "Oct", v: 55 }, { l: "Nov", v: 38 }, { l: "Dec", v: 25 },
  ];
  const maxBar = 90;

  /* customer dot grid */
  const DOTS   = 40;
  const filled = stats
    ? Math.min(Math.round((customers / Math.max(customers + 10, 50)) * DOTS), DOTS)
    : 0;
  const vipDots = Math.min(Math.round((vip / Math.max(customers, 1)) * filled), filled);

  return (
    <div className="p-6 space-y-5" dir={dir}>

      {/* ── Page title ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--c-text)", fontFamily }}>
            {t("dashboard", "greeting")} {tenantName || t("dashboard", "greetingFallback")} 👋
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--c-muted)", fontFamily }}>
            {t("dashboard", "greetingSub")}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-sm hidden sm:block" style={{ color: "var(--c-muted)", fontFamily }}>
            {today}
          </span>
          <button
            className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-medium"
            style={{ background: "var(--c-surface)", color: "var(--c-text)", fontFamily }}
          >
            <Calendar className="h-3.5 w-3.5" />
            Today
          </button>
        </div>
      </div>

      {/* ══ TOP STAT CARDS ══ */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">

        {/* Card 1 — Orders (bubble chart + progress bars) */}
        <Card>
          <CardHeader title={t("dashboard", "totalOrders")} fontFamily={fontFamily} />

          <p className="text-4xl font-bold leading-none mb-0.5" style={{ color: "var(--c-text)" }}>
            {fmt(stats?.total_orders)}
          </p>
          <p className="text-xs mb-5" style={{ color: "var(--c-text-sub)", fontFamily }}>
            {t("dashboard", "greetingSub")}
          </p>

          {/* Bubbles */}
          <div className="relative mb-5" style={{ height: 112 }}>
            {/* Large lime — confirmed */}
            <div
              className="absolute flex flex-col items-center justify-center"
              style={{
                width: 84, height: 84, borderRadius: "50%", background: "#C6F135",
                top: 0, insetInlineStart: "6%",
              }}
            >
              <span className="text-black font-bold text-xl leading-none">
                {fmt(stats?.confirmed_orders)}
              </span>
              <span className="text-black text-[10px]">confirmed</span>
            </div>
            {/* Medium purple — pending */}
            <div
              className="absolute flex flex-col items-center justify-center"
              style={{
                width: 64, height: 64, borderRadius: "50%", background: "#8B5CF6",
                top: 18, insetInlineStart: "42%",
              }}
            >
              <span className="text-white font-bold text-base leading-none">{fmt(pending)}</span>
              <span className="text-white text-[10px]">pending</span>
            </div>
            {/* Small neutral — other */}
            <div
              className="absolute flex items-center justify-center"
              style={{
                width: 44, height: 44, borderRadius: "50%",
                background: "var(--c-track)",
                bottom: 0, insetInlineStart: "64%",
              }}
            >
              <span className="text-[10px]" style={{ color: "var(--c-muted)" }}>other</span>
            </div>
          </div>

          {/* Progress bars */}
          <div className="space-y-3">
            {[
              { label: "Confirmed", pct: confirmedPct, color: "#C6F135" },
              { label: "Pending",   pct: pendingPct,   color: "#8B5CF6" },
            ].map(({ label, pct, color }) => (
              <div key={label}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ background: color, display: "inline-block" }}
                    />
                    <span className="text-xs" style={{ color: "var(--c-muted)", fontFamily }}>{label}</span>
                  </div>
                  <span className="text-xs font-semibold" style={{ color: "var(--c-text)" }}>{pct}%</span>
                </div>
                <div className="h-1 rounded-full" style={{ background: "var(--c-track)" }}>
                  <div className="h-1 rounded-full" style={{ background: color, width: `${pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Card 2 — Revenue */}
        <Card>
          <CardHeader title={t("dashboard", "revenue")} fontFamily={fontFamily} />

          <p className="text-4xl font-bold leading-none mb-0.5" style={{ color: "var(--c-text)" }}>
            {stats ? fmtNum(stats.revenue, { maximumFractionDigits: 0 }) : "—"}
          </p>
          <p className="text-sm mb-1" style={{ color: "var(--c-text-sub)", fontFamily }}>{currency}</p>
          <div className="flex items-center gap-1 mb-6">
            <ArrowUpRight className="h-3.5 w-3.5" style={{ color: "#C6F135" }} />
            <span className="text-xs font-medium" style={{ color: "#C6F135", fontFamily }}>
              Avg{" "}
              {stats && confirmed > 0
                ? fmtNum(stats.revenue / confirmed, { maximumFractionDigits: 0 })
                : "—"}{" "}
              {currency} / order
            </span>
          </div>

          {/* Inner sub-card */}
          <div className="rounded-xl p-4 space-y-4" style={{ background: "var(--c-card-inner)" }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div
                  className="flex h-8 w-8 items-center justify-center rounded-lg"
                  style={{ background: "rgba(198,241,53,0.12)" }}
                >
                  <CheckCircle2 className="h-4 w-4" style={{ color: "#C6F135" }} />
                </div>
                <div>
                  <p className="text-sm font-bold" style={{ color: "var(--c-text)" }}>
                    {fmt(stats?.confirmed_orders)}
                  </p>
                  <p className="text-[11px]" style={{ color: "var(--c-muted)", fontFamily }}>
                    {t("dashboard", "confirmedOrders")}
                  </p>
                </div>
              </div>
              <span className="text-xs font-semibold" style={{ color: "#C6F135" }}>Active</span>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div
                  className="flex h-8 w-8 items-center justify-center rounded-lg"
                  style={{ background: "rgba(139,92,246,0.12)" }}
                >
                  <TrendingUp className="h-4 w-4" style={{ color: "#8B5CF6" }} />
                </div>
                <div>
                  <p className="text-sm font-bold" style={{ color: "var(--c-text)" }}>
                    {confirmedPct}%
                  </p>
                  <p className="text-[11px]" style={{ color: "var(--c-muted)", fontFamily }}>
                    confirm rate
                  </p>
                </div>
              </div>
              <span className="text-xs font-semibold" style={{ color: "#8B5CF6" }}>
                {fmt(total)} total
              </span>
            </div>
          </div>
        </Card>

        {/* Card 3 — Customers (dot grid) */}
        <Card>
          <CardHeader title={t("dashboard", "totalCustomers")} fontFamily={fontFamily} />

          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-4xl font-bold leading-none" style={{ color: "var(--c-text)" }}>
                {fmt(stats?.total_customers)}
              </p>
              <p className="text-xs mt-1" style={{ color: "var(--c-text-sub)", fontFamily }}>
                total customers
              </p>
            </div>
            <span
              className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold"
              style={{ background: "rgba(198,241,53,0.12)", color: "#C6F135" }}
            >
              <ArrowUpRight className="h-3 w-3" />
              +{vipPct}%
            </span>
          </div>

          {/* Dot grid */}
          <div className="grid gap-1.5 mb-4" style={{ gridTemplateColumns: "repeat(8, 1fr)" }}>
            {Array.from({ length: DOTS }, (_, i) => (
              <div
                key={i}
                className="rounded-full"
                style={{
                  width: 8,
                  height: 8,
                  background:
                    i < vipDots
                      ? "#C6F135"
                      : i < filled
                      ? "rgba(139,92,246,0.45)"
                      : "var(--c-dot-empty)",
                }}
              />
            ))}
          </div>

          <div className="flex items-center gap-5">
            <div className="flex items-center gap-1.5">
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: "#C6F135", display: "inline-block" }}
              />
              <span className="text-xs" style={{ color: "var(--c-muted)", fontFamily }}>
                VIP ({fmt(stats?.vip_customers)})
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: "#8B5CF6", display: "inline-block" }}
              />
              <span className="text-xs" style={{ color: "var(--c-muted)", fontFamily }}>Regular</span>
            </div>
          </div>
        </Card>
      </div>

      {/* ══ BOTTOM 2-COL ══ */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">

        {/* Quick Access — progress bars */}
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between mb-5">
            <span className="text-sm font-semibold" style={{ color: "var(--c-text)", fontFamily }}>
              {t("dashboard", "quickAccess")}
            </span>
            <button className="p-1 rounded-lg hover:bg-white/5 transition-colors">
              <MoreVertical className="h-4 w-4" style={{ color: "var(--c-muted)" }} />
            </button>
          </div>

          <div className="space-y-5">
            {[
              { icon: ShoppingCart,  label: t("dashboard", "viewOrders"),   href: "/dashboard/orders",        color: "#C6F135", pct: confirmedPct },
              { icon: Users,         label: t("dashboard", "viewCustomers"), href: "/dashboard/customers",     color: "#8B5CF6", pct: vipPct       },
              { icon: Package,       label: t("nav", "products"),            href: "/dashboard/products",      color: "#3B82F6", pct: 60           },
              { icon: MessageSquare, label: t("nav", "conversations"),       href: "/dashboard/conversations", color: "#F59E0B", pct: 45           },
            ].map((item) => (
              <Link key={item.href} href={item.href} className="block group">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <item.icon className="h-4 w-4" style={{ color: item.color }} />
                    <span className="text-sm" style={{ color: "var(--c-text)", fontFamily }}>
                      {item.label}
                    </span>
                  </div>
                  <span className="text-xs font-bold" style={{ color: item.color }}>
                    {item.pct}%
                  </span>
                </div>
                <div className="h-1 rounded-full" style={{ background: "var(--c-track)" }}>
                  <div
                    className="h-1 rounded-full"
                    style={{
                      background: item.color,
                      width: `${item.pct}%`,
                      transition: "width 0.6s ease",
                    }}
                  />
                </div>
              </Link>
            ))}
          </div>
        </Card>

        {/* Order Activity bar chart */}
        <Card className="lg:col-span-3">
          <div className="flex items-center justify-between mb-5">
            <span className="text-sm font-semibold" style={{ color: "var(--c-text)", fontFamily }}>
              Order Activity
            </span>
            <button
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium"
              style={{ background: "var(--c-btn-sec)", color: "var(--c-muted)", fontFamily }}
            >
              Monthly <ChevronDown className="h-3 w-3" />
            </button>
          </div>

          {/* Big numbers */}
          <div className="flex items-center gap-8 mb-6">
            <div>
              <p className="text-3xl font-bold" style={{ color: "var(--c-text)" }}>
                {fmt(stats?.confirmed_orders)}
              </p>
              <div className="flex items-center gap-1.5 mt-1">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: "#C6F135", display: "inline-block" }}
                />
                <span className="text-xs" style={{ color: "var(--c-muted)", fontFamily }}>Confirmed</span>
              </div>
            </div>
            <div>
              <p className="text-3xl font-bold" style={{ color: "var(--c-text)" }}>{fmt(pending)}</p>
              <div className="flex items-center gap-1.5 mt-1">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: "#8B5CF6", display: "inline-block" }}
                />
                <span className="text-xs" style={{ color: "var(--c-muted)", fontFamily }}>Pending</span>
              </div>
            </div>
          </div>

          {/* Bar chart */}
          <div className="flex items-end gap-1.5" style={{ height: 80 }}>
            {chartBars.map((bar, i) => {
              const isActive = i === currentMonth;
              const barH     = Math.round((bar.v / maxBar) * 72);
              return (
                <div key={bar.l} className="flex flex-1 flex-col items-center gap-1.5">
                  <div
                    className="w-full rounded-t-md"
                    style={{
                      height: barH,
                      background: isActive
                        ? "#C6F135"
                        : i % 2 === 0
                        ? "var(--c-bar-off)"
                        : "rgba(139,92,246,0.35)",
                    }}
                  />
                  <span
                    className="text-[9px] leading-none"
                    style={{
                      color: isActive ? "#C6F135" : "var(--c-label-off)",
                      fontFamily,
                    }}
                  >
                    {bar.l}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}
