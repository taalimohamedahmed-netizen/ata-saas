"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bot, Plug } from "lucide-react";

const tabs = [
  { icon: Plug, label: "التكاملات", href: "/dashboard/settings/integrations" },
  { icon: Bot,  label: "الذكاء الاصطناعي", href: "/dashboard/settings/ai" },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex h-full" dir="rtl">
      {/* Settings sidebar */}
      <aside className="w-52 shrink-0 border-l border-border bg-navy-light p-4">
        <h2
          className="mb-4 px-2 text-xs font-semibold uppercase tracking-widest text-muted"
          style={{ fontFamily: '"IBM Plex Sans Arabic", sans-serif' }}
        >
          الإعدادات
        </h2>
        <nav className="flex flex-col gap-1">
          {tabs.map((tab) => {
            const isActive = pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                  isActive
                    ? "bg-accent/15 text-accent font-medium"
                    : "text-muted hover:bg-white/5 hover:text-white"
                }`}
                style={{ fontFamily: '"IBM Plex Sans Arabic", sans-serif' }}
              >
                <tab.icon className="h-4 w-4 shrink-0" />
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Content */}
      <main className="flex-1 overflow-y-auto p-6">{children}</main>
    </div>
  );
}
