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
import { useI18n } from "@/context/i18n-context";
import { ControlsBar } from "@/components/ui/controls-bar";
import { SetupChatWidget } from "@/components/setup-agent/chat-widget";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, tenantName, logout } = useAuthStore();
  const { t, locale, dir } = useI18n();
  const [mounted, setMounted] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setMounted(true);
    const check = () => {
      if (useAuthStore.persist.hasHydrated()) setHydrated(true);
      else setTimeout(check, 50);
    };
    check();
  }, []);

  useEffect(() => {
    if (mounted && hydrated && !isAuthenticated) router.replace("/login");
  }, [isAuthenticated, router, mounted, hydrated]);

  if (!mounted || !hydrated || !isAuthenticated) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--c-navy)]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  const navItems = [
    { icon: LayoutDashboard, label: t("nav", "dashboard"),         href: "/dashboard" },
    { icon: MessageSquare,   label: t("nav", "conversations"),     href: "/dashboard/conversations" },
    { icon: ShoppingCart,    label: t("nav", "orders"),            href: "/dashboard/orders" },
    { icon: ClipboardCheck,  label: t("nav", "orderConfirmation"), href: "/dashboard/order-confirmation" },
    { icon: Users,           label: t("nav", "customers"),         href: "/dashboard/customers" },
    { icon: Package,         label: t("nav", "products"),          href: "/dashboard/products" },
    { icon: Settings,        label: t("nav", "settings"),          href: "/dashboard/settings/integrations" },
  ];

  const fontFamily = locale === "ar"
    ? '"IBM Plex Sans Arabic", sans-serif'
    : '"Inter", sans-serif';

  return (
    <div className="flex h-screen bg-[var(--c-navy)]" dir={dir}>
      {/* ═══════ SIDEBAR ═══════ */}
      <aside className="flex w-16 flex-col items-center border-border bg-[var(--c-navy-light)] py-4 lg:w-56 lg:items-stretch lg:px-3"
        style={{ borderInlineEndWidth: 1, borderInlineEndStyle: "solid" }}>

        {/* Logo */}
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/20 lg:w-full lg:gap-3 lg:px-3 mb-6">
          <Bot className="h-5 w-5 text-accent shrink-0" />
          <span className="hidden lg:block text-lg font-extrabold text-[var(--c-text)] tracking-tight"
            style={{ fontFamily: '"Poppins", sans-serif' }}>
            ATA
          </span>
        </div>

        {/* Nav */}
        <nav className="flex flex-1 flex-col gap-0.5">
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
            const base = "flex h-10 w-10 items-center justify-center rounded-lg transition-colors lg:w-full lg:gap-3 lg:px-3 lg:justify-start";
            const active = "bg-accent/15 text-accent";
            const inactive = "text-muted hover:bg-[var(--c-hover)] hover:text-[var(--c-text)]";
            return (
              <Link key={item.href} href={item.href} className={`${base} ${isActive ? active : inactive}`} title={item.label}>
                <item.icon className="h-5 w-5 shrink-0" />
                <span className="hidden lg:block text-sm" style={{ fontFamily }}>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Footer — store name + controls + logout */}
        <div className="mt-auto space-y-2">
          <div className="hidden lg:flex items-center justify-between px-3">
            <p className="text-xs text-muted truncate" style={{ fontFamily }}>
              {tenantName || t("common", "store")}
            </p>
            <ControlsBar />
          </div>

          {/* Mobile: stacked icons */}
          <div className="flex lg:hidden flex-col items-center gap-1">
            <ControlsBar collapsed />
          </div>

          <button
            onClick={() => { logout(); router.replace("/login"); }}
            className="flex h-10 w-10 items-center justify-center rounded-lg text-muted transition-colors hover:bg-danger/10 hover:text-danger lg:w-full lg:gap-3 lg:px-3 lg:justify-start"
            title={t("nav", "logout")}
          >
            <LogOut className="h-5 w-5 shrink-0" />
            <span className="hidden lg:block text-sm" style={{ fontFamily }}>{t("nav", "logout")}</span>
          </button>
        </div>
      </aside>

      {/* ═══════ MAIN ═══════ */}
      <main className="flex-1 overflow-y-auto">{children}</main>

      <SetupChatWidget />
    </div>
  );
}
