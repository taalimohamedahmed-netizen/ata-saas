"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard, MessageSquare, ShoppingCart, Users,
  Settings, LogOut, Bot, ClipboardCheck, Package,
  Bell, Search, ChevronDown,
} from "lucide-react";
import { useAuthStore } from "@/store/auth-store";
import { useI18n } from "@/context/i18n-context";
import { ControlsBar } from "@/components/ui/controls-bar";
import { SetupChatWidget } from "@/components/setup-agent/chat-widget";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router   = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, tenantName, logout } = useAuthStore();
  const { t, locale, dir } = useI18n();
  const [mounted,   setMounted]   = useState(false);
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
      <div className="flex h-screen items-center justify-center" style={{ background: "#0D0D0D" }}>
        <div
          className="h-8 w-8 animate-spin rounded-full border-2 border-t-transparent"
          style={{ borderColor: "#C6F135", borderTopColor: "transparent" }}
        />
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

  const fontFamily   = locale === "ar" ? '"IBM Plex Sans Arabic", sans-serif' : '"Inter", sans-serif';
  const avatarLetter = (tenantName || "A")[0].toUpperCase();

  return (
    <div className="flex h-screen" dir={dir} style={{ background: "#0D0D0D" }}>

      {/* ══════════════ SIDEBAR ══════════════ */}
      <aside
        className="flex w-16 shrink-0 flex-col lg:w-[220px]"
        style={{ background: "#141414" }}
      >
        {/* Logo */}
        <div className="flex h-[64px] items-center px-3 lg:px-4 shrink-0">
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
            style={{ background: "#C6F135" }}
          >
            <Bot className="h-4 w-4 text-black" />
          </div>
          <span
            className="hidden lg:block ms-3 text-lg font-bold tracking-tight text-white"
            style={{ fontFamily: '"Poppins", sans-serif' }}
          >
            ATA
          </span>
        </div>

        {/* Nav */}
        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                title={item.label}
                className="flex h-10 w-10 items-center justify-center rounded-xl transition-all duration-150 lg:w-full lg:justify-start lg:gap-3 lg:px-3"
                style={
                  isActive
                    ? { background: "#FFFFFF", color: "#000000" }
                    : { color: "#666666" }
                }
              >
                <item.icon className="h-4 w-4 shrink-0" />
                <span className="hidden lg:block text-sm font-medium" style={{ fontFamily }}>
                  {item.label}
                </span>
              </Link>
            );
          })}
        </nav>

        {/* AI Card */}
        <div className="hidden lg:block mx-3 mb-3 rounded-2xl p-4"
          style={{ background: "linear-gradient(135deg, #1E0F3C 0%, #2D1880 100%)" }}
        >
          <div className="text-xl mb-2">🤖</div>
          <p className="text-white font-semibold text-xs mb-1" style={{ fontFamily }}>
            AI Agent Active
          </p>
          <p className="text-xs mb-3" style={{ color: "#9B8EC0", fontFamily }}>
            Your assistant is serving customers 24/7
          </p>
          <Link
            href="/dashboard/settings/ai"
            className="block text-center text-xs font-bold py-1.5 rounded-xl"
            style={{ background: "#C6F135", color: "#000" }}
          >
            Configure
          </Link>
        </div>

        {/* Footer: controls + logout */}
        <div className="flex items-center justify-between px-3 pb-4 shrink-0">
          <div className="hidden lg:block">
            <ControlsBar />
          </div>
          <div className="flex lg:hidden flex-col items-center gap-1">
            <ControlsBar collapsed />
          </div>
          <button
            onClick={() => { logout(); router.replace("/login"); }}
            className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-red-500/10"
            style={{ color: "#555" }}
            title={t("nav", "logout")}
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </aside>

      {/* ══════════════ MAIN AREA ══════════════ */}
      <div className="flex flex-1 min-w-0 flex-col">

        {/* ── Top Header ── */}
        <header
          className="flex h-[64px] shrink-0 items-center gap-3 px-5"
          style={{ background: "#0D0D0D", borderBottom: "1px solid #1A1A1A" }}
        >
          {/* User */}
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-black"
              style={{ background: "#C6F135" }}
            >
              {avatarLetter}
            </div>
            <div className="hidden lg:block min-w-0">
              <p className="text-sm font-semibold text-white truncate" style={{ fontFamily }}>
                {tenantName || t("common", "store")}
              </p>
              <p className="text-[11px]" style={{ color: "#555", fontFamily }}>ATA Dashboard</p>
            </div>
            <ChevronDown className="hidden lg:block h-3.5 w-3.5 shrink-0" style={{ color: "#444" }} />
          </div>

          {/* Search */}
          <div className="flex-1 max-w-xs mx-auto">
            <div
              className="flex items-center gap-2 rounded-full px-4 py-2"
              style={{ background: "#1A1A1A", border: "1px solid #252525" }}
            >
              <Search className="h-3.5 w-3.5 shrink-0" style={{ color: "#555" }} />
              <input
                type="text"
                placeholder={t("common", "search") + "..."}
                className="w-full bg-transparent text-sm text-white placeholder:text-[#444] outline-none"
                style={{ fontFamily }}
              />
            </div>
          </div>

          {/* Controls + Bell */}
          <div className="flex items-center gap-2 shrink-0">
            <ControlsBar />
            <button
              className="relative flex h-8 w-8 items-center justify-center rounded-full"
              style={{ background: "#1A1A1A" }}
            >
              <Bell className="h-4 w-4" style={{ color: "#777" }} />
              <span
                className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold text-black"
                style={{ background: "#C6F135" }}
              >
                3
              </span>
            </button>
          </div>
        </header>

        {/* ── Page Content ── */}
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>

      <SetupChatWidget />
    </div>
  );
}
