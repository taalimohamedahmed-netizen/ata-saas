"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bot, Plug } from "lucide-react";
import { useI18n } from "@/context/i18n-context";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { t, dir, fontFamily } = useI18n();

  const tabs = [
    { icon: Plug, label: t("settings", "integrations"), href: "/dashboard/settings/integrations" },
    { icon: Bot,  label: t("settings", "ai"),           href: "/dashboard/settings/ai" },
  ];

  return (
    <div className="flex h-full" dir={dir}>
      <aside className="w-52 shrink-0 bg-navy-light p-4" style={{ borderInlineEndWidth: 1, borderInlineEndStyle: "solid", borderColor: "var(--c-border)" }}>
        <h2 className="mb-4 px-2 text-xs font-semibold uppercase tracking-widest text-muted" style={{ fontFamily }}>
          {t("nav", "settings")}
        </h2>
        <nav className="flex flex-col gap-1">
          {tabs.map((tab) => {
            const isActive = pathname.startsWith(tab.href);
            return (
              <Link key={tab.href} href={tab.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${isActive ? "bg-accent/15 text-accent font-medium" : "text-muted hover:bg-[var(--c-hover)] hover:text-[var(--c-text)]"}`}
                style={{ fontFamily }}>
                <tab.icon className="h-4 w-4 shrink-0" />
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <main className="flex-1 overflow-y-auto p-6">{children}</main>
    </div>
  );
}
