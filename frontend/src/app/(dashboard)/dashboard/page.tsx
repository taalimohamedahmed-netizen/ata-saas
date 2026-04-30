"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ShoppingCart, Users, TrendingUp, CheckCircle2, ArrowRight, Package, MessageSquare } from "lucide-react";
import { useAuthStore } from "@/store/auth-store";
import { getStats, type DashboardStats } from "@/lib/dashboard";
import { useI18n } from "@/context/i18n-context";

function StatCard({ icon: Icon, label, value, sub, href, glowColor }: {
  icon: React.ElementType; label: string; value: string | number;
  sub?: string; href?: string; glowColor: string;
}) {
  const { fontFamily } = useI18n();

  const card = (
    <div
      className={`relative rounded-2xl p-5 space-y-4 overflow-hidden transition-all duration-300 ${href ? "hover:-translate-y-1.5 hover:scale-[1.02] cursor-pointer" : ""}`}
      style={{
        background: "rgba(255,255,255,0.03)",
        backdropFilter: "blur(24px)",
        border: "1px solid rgba(255,255,255,0.08)",
        boxShadow: `0 24px 48px rgba(0,0,0,0.35), 0 4px 12px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.07), 0 0 0 1px rgba(255,255,255,0.02)`,
      }}
    >
      {/* Top accent line */}
      <div className="absolute top-0 inset-x-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${glowColor}80, transparent)` }} />

      {/* Ambient glow orb */}
      <div
        className="absolute -top-8 -right-8 h-24 w-24 rounded-full blur-2xl pointer-events-none"
        style={{ background: glowColor, opacity: 0.15 }}
      />

      <div
        className="relative flex h-11 w-11 items-center justify-center rounded-xl"
        style={{ background: `${glowColor}1A`, boxShadow: `0 4px 16px ${glowColor}30, inset 0 1px 0 ${glowColor}20` }}
      >
        <Icon className="h-5 w-5" style={{ color: glowColor }} />
      </div>

      <div className="relative">
        <p className="text-2xl font-bold text-white tracking-tight">{value}</p>
        <p className="text-sm text-muted mt-0.5" style={{ fontFamily }}>{label}</p>
        {sub && <p className="text-xs mt-1.5 font-medium" style={{ color: glowColor, fontFamily }}>{sub}</p>}
      </div>
    </div>
  );

  return href ? <Link href={href}>{card}</Link> : card;
}

export default function DashboardPage() {
  const tenantName = useAuthStore((s) => s.tenantName);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const { t, dir, fontFamily, fmtNum } = useI18n();

  useEffect(() => { getStats().then(setStats).catch(() => {}); }, []);

  const fmt = (n: number | undefined) => n === undefined ? "—" : fmtNum(n);
  const currency = t("common", "currency");

  const quickLinks = [
    { icon: ShoppingCart,  label: t("dashboard", "viewOrders"),    sub: t("dashboard", "viewOrdersSub"),    href: "/dashboard/orders",        glow: "#3278E8" },
    { icon: Users,         label: t("dashboard", "viewCustomers"), sub: t("dashboard", "viewCustomersSub"), href: "/dashboard/customers",     glow: "#A855F7" },
    { icon: Package,       label: t("nav", "products"),            sub: "",                                  href: "/dashboard/products",      glow: "#F59E0B" },
    { icon: MessageSquare, label: t("nav", "conversations"),       sub: "",                                  href: "/dashboard/conversations", glow: "#22C55E" },
  ];

  return (
    <div className="min-h-full p-6 space-y-8" dir={dir}>

      {/* ─── Hero ─── */}
      <div
        className="relative rounded-3xl p-8 overflow-hidden"
        style={{
          background: "linear-gradient(135deg, rgba(50,120,232,0.10) 0%, rgba(10,15,30,0.60) 55%, rgba(168,85,247,0.08) 100%)",
          border: "1px solid rgba(50,120,232,0.20)",
          boxShadow: "0 40px 80px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.07)",
        }}
      >
        <div className="absolute -top-12 -right-12 w-72 h-72 rounded-full blur-3xl pointer-events-none"
          style={{ background: "radial-gradient(circle, rgba(50,120,232,0.3), transparent 70%)" }} />
        <div className="absolute bottom-0 left-16 w-48 h-48 rounded-full blur-3xl pointer-events-none"
          style={{ background: "radial-gradient(circle, rgba(168,85,247,0.15), transparent 70%)" }} />

        <div className="relative">
          <h1 className="text-3xl font-bold text-white leading-tight" style={{ fontFamily }}>
            {t("dashboard", "greeting")} {tenantName || t("dashboard", "greetingFallback")} 👋
          </h1>
          <p className="text-muted mt-2 text-sm" style={{ fontFamily }}>
            {t("dashboard", "greetingSub")}
          </p>
        </div>
      </div>

      {/* ─── Stat Cards ─── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          icon={ShoppingCart}
          label={t("dashboard", "totalOrders")}
          value={fmt(stats?.total_orders)}
          sub={stats ? `${fmt(stats.confirmed_orders)} ${t("dashboard", "confirmedSub")}` : undefined}
          href="/dashboard/orders"
          glowColor="#3278E8"
        />
        <StatCard
          icon={CheckCircle2}
          label={t("dashboard", "confirmedOrders")}
          value={fmt(stats?.confirmed_orders)}
          href="/dashboard/orders"
          glowColor="#22C55E"
        />
        <StatCard
          icon={TrendingUp}
          label={t("dashboard", "revenue")}
          value={stats ? `${fmtNum(stats.revenue, { maximumFractionDigits: 0 })} ${currency}` : "—"}
          glowColor="#F59E0B"
        />
        <StatCard
          icon={Users}
          label={t("dashboard", "totalCustomers")}
          value={fmt(stats?.total_customers)}
          sub={stats ? `${fmt(stats.vip_customers)} ${t("dashboard", "vipSub")}` : undefined}
          href="/dashboard/customers"
          glowColor="#A855F7"
        />
      </div>

      {/* ─── Quick Access ─── */}
      <div>
        <p className="text-xs font-semibold text-muted/60 uppercase tracking-widest mb-4" style={{ fontFamily }}>
          {t("dashboard", "quickAccess") ?? "Quick Access"}
        </p>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {quickLinks.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="group relative rounded-2xl p-4 overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:scale-[1.02]"
              style={{
                background: "rgba(255,255,255,0.025)",
                backdropFilter: "blur(20px)",
                border: "1px solid rgba(255,255,255,0.07)",
                boxShadow: "0 12px 32px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.05)",
              }}
            >
              {/* Hover glow overlay */}
              <div
                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
                style={{ background: `radial-gradient(ellipse at 30% 50%, ${item.glow}12, transparent 65%)` }}
              />
              <div className="absolute bottom-0 inset-x-0 h-px opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                style={{ background: `linear-gradient(90deg, transparent, ${item.glow}60, transparent)` }} />

              <div className="relative flex items-center gap-3">
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-xl transition-all duration-300 group-hover:scale-110 shrink-0"
                  style={{ background: `${item.glow}18`, boxShadow: `0 4px 12px ${item.glow}25` }}
                >
                  <item.icon className="h-5 w-5" style={{ color: item.glow }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-white text-sm truncate" style={{ fontFamily }}>{item.label}</p>
                  {item.sub && <p className="text-xs text-muted truncate mt-0.5" style={{ fontFamily }}>{item.sub}</p>}
                </div>
                <ArrowRight className="h-4 w-4 text-muted/30 group-hover:text-muted/70 transition-colors shrink-0 rtl:rotate-180" />
              </div>
            </Link>
          ))}
        </div>
      </div>

    </div>
  );
}
