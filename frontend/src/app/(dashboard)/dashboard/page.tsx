"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ShoppingCart, Users, TrendingUp, CheckCircle2 } from "lucide-react";
import { useAuthStore } from "@/store/auth-store";
import { getStats, type DashboardStats } from "@/lib/dashboard";

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  href,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  href?: string;
  color: string;
}) {
  const card = (
    <div className={`rounded-2xl border border-border bg-surface p-5 space-y-3 transition-colors ${href ? "hover:border-accent/40 cursor-pointer" : ""}`}>
      <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${color}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-2xl font-bold text-white">{value}</p>
        <p className="text-sm text-muted mt-0.5" style={{ fontFamily: '"IBM Plex Sans Arabic", sans-serif' }}>{label}</p>
        {sub && <p className="text-xs text-muted/60 mt-1" style={{ fontFamily: '"IBM Plex Sans Arabic", sans-serif' }}>{sub}</p>}
      </div>
    </div>
  );
  return href ? <Link href={href}>{card}</Link> : card;
}

export default function DashboardPage() {
  const tenantName = useAuthStore((s) => s.tenantName);
  const [stats, setStats] = useState<DashboardStats | null>(null);

  useEffect(() => {
    getStats().then(setStats).catch(() => {});
  }, []);

  const fmt = (n: number | undefined) =>
    n === undefined ? "—" : n.toLocaleString("ar-EG");

  return (
    <div className="p-6 space-y-8" dir="rtl">
      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-bold text-white" style={{ fontFamily: '"IBM Plex Sans Arabic", sans-serif' }}>
          مرحباً، {tenantName || "صديقنا"} 👋
        </h1>
        <p className="text-sm text-muted mt-1" style={{ fontFamily: '"IBM Plex Sans Arabic", sans-serif' }}>
          هذا ملخص نشاط متجرك اليوم
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          icon={ShoppingCart}
          label="إجمالي الطلبات"
          value={fmt(stats?.total_orders)}
          sub={stats ? `${fmt(stats.confirmed_orders)} مؤكد` : undefined}
          href="/dashboard/orders"
          color="bg-accent/15 text-accent"
        />
        <StatCard
          icon={CheckCircle2}
          label="طلبات مؤكدة"
          value={fmt(stats?.confirmed_orders)}
          href="/dashboard/orders"
          color="bg-success/15 text-success"
        />
        <StatCard
          icon={TrendingUp}
          label="الإيرادات"
          value={stats ? `${stats.revenue.toLocaleString("ar-EG", { maximumFractionDigits: 0 })} ج` : "—"}
          color="bg-yellow-500/15 text-yellow-400"
        />
        <StatCard
          icon={Users}
          label="إجمالي العملاء"
          value={fmt(stats?.total_customers)}
          sub={stats ? `${fmt(stats.vip_customers)} VIP` : undefined}
          href="/dashboard/customers"
          color="bg-purple-500/15 text-purple-400"
        />
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-2 gap-4">
        <Link href="/dashboard/orders"
          className="rounded-2xl border border-border bg-surface p-5 hover:border-accent/40 transition-colors group">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/15 group-hover:bg-accent/25 transition-colors">
              <ShoppingCart className="h-5 w-5 text-accent" />
            </div>
            <div>
              <p className="font-semibold text-white" style={{ fontFamily: '"IBM Plex Sans Arabic", sans-serif' }}>عرض الطلبات</p>
              <p className="text-xs text-muted" style={{ fontFamily: '"IBM Plex Sans Arabic", sans-serif' }}>كل الطلبات الواردة من Shopify</p>
            </div>
          </div>
        </Link>
        <Link href="/dashboard/customers"
          className="rounded-2xl border border-border bg-surface p-5 hover:border-accent/40 transition-colors group">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/15 group-hover:bg-purple-500/25 transition-colors">
              <Users className="h-5 w-5 text-purple-400" />
            </div>
            <div>
              <p className="font-semibold text-white" style={{ fontFamily: '"IBM Plex Sans Arabic", sans-serif' }}>عرض العملاء</p>
              <p className="text-xs text-muted" style={{ fontFamily: '"IBM Plex Sans Arabic", sans-serif' }}>قائمة العملاء مع شرائحهم</p>
            </div>
          </div>
        </Link>
      </div>
    </div>
  );
}
