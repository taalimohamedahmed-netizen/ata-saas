"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard,
  MessageSquare,
  ShoppingCart,
  Users,
  Settings,
  LogOut,
  Bot,
  ClipboardCheck,
  Package,
} from "lucide-react";
import { useAuthStore } from "@/store/auth-store";

const navItems = [
  { icon: LayoutDashboard, label: "لوحة التحكم", href: "/dashboard" },
  { icon: MessageSquare, label: "المحادثات", href: "/dashboard/conversations" },
  { icon: ShoppingCart, label: "الطلبات", href: "/dashboard/orders" },
  { icon: ClipboardCheck, label: "تأكيد الطلبات", href: "/dashboard/order-confirmation" },
  { icon: Users, label: "العملاء", href: "/dashboard/customers" },
  { icon: Package, label: "المنتجات", href: "/dashboard/products" },
  { icon: Settings, label: "الإعدادات", href: "/dashboard/settings/integrations" },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, tenantName, logout } = useAuthStore();
  const [mounted, setMounted] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Wait for Zustand to finish hydration
    const checkHydration = () => {
      if (useAuthStore.persist.hasHydrated()) {
        setHydrated(true);
      } else {
        setTimeout(checkHydration, 50);
      }
    };
    checkHydration();
  }, []);

  useEffect(() => {
    // Only redirect if we have hydrated AND mounted, and still not authenticated
    if (mounted && hydrated && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isAuthenticated, router, mounted, hydrated]);

  // Prevent flash of login or empty state during hydration
  if (!mounted || !hydrated || !isAuthenticated) {
    return (
      <div className="flex h-screen items-center justify-center bg-navy">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-navy">
      {/* ═══════ SIDEBAR ═══════ */}
      <aside className="flex w-16 flex-col items-center border-r border-border bg-navy-light py-4 lg:w-56 lg:items-stretch lg:px-3">
        {/* Logo */}
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/20 lg:w-full lg:gap-3 lg:px-3 mb-6">
          <Bot className="h-5 w-5 text-accent shrink-0" />
          <span className="hidden lg:block text-lg font-extrabold text-white tracking-tight">
            ATA
          </span>
        </div>

        {/* Nav Items */}
        <nav className="flex flex-1 flex-col gap-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
            const base = "flex h-10 w-10 items-center justify-center rounded-lg transition-colors lg:w-full lg:gap-3 lg:px-3 lg:justify-start";
            const active = "bg-accent/15 text-accent";
            const inactive = "text-muted hover:bg-white/5 hover:text-white";
            const cls = `${base} ${isActive ? active : inactive}`;
            return (
              <Link key={item.label} href={item.href} className={cls} title={item.label}>
                <item.icon className="h-5 w-5 shrink-0" />
                <span className="hidden lg:block text-sm" style={{ fontFamily: '"IBM Plex Sans Arabic", sans-serif' }}>
                  {item.label}
                </span>
              </Link>
            );
          })}
        </nav>

        {/* User / Logout */}
        <div className="mt-auto space-y-2">
          <div className="hidden lg:block px-3">
            <p
              className="text-xs text-muted truncate"
              style={{
                fontFamily: '"IBM Plex Sans Arabic", sans-serif',
              }}
            >
              {tenantName || "المتجر"}
            </p>
          </div>
          <button
            onClick={() => {
              logout();
              router.replace("/login");
            }}
            className="flex h-10 w-10 items-center justify-center rounded-lg text-muted transition-colors hover:bg-danger/10 hover:text-danger lg:w-full lg:gap-3 lg:px-3 lg:justify-start"
            title="تسجيل الخروج"
          >
            <LogOut className="h-5 w-5 shrink-0" />
            <span
              className="hidden lg:block text-sm"
              style={{
                fontFamily: '"IBM Plex Sans Arabic", sans-serif',
              }}
            >
              تسجيل الخروج
            </span>
          </button>
        </div>
      </aside>

      {/* ═══════ MAIN ═══════ */}
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
