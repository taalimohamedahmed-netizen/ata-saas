"use client";

import { useTheme } from "next-themes";
import { Sun, Moon, Monitor } from "lucide-react";
import { useI18n } from "@/context/i18n-context";
import { setLocale } from "@/lib/locale";

export function ControlsBar({ collapsed }: { collapsed?: boolean }) {
  const { theme, setTheme } = useTheme();
  const { locale } = useI18n();

  const nextLocale = locale === "ar" ? "en" : "ar";

  function cycleTheme() {
    if (theme === "dark") setTheme("light");
    else if (theme === "light") setTheme("system");
    else setTheme("dark");
  }

  const ThemeIcon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;
  const themeLabel = theme === "dark" ? "داكن" : theme === "light" ? "فاتح" : "تلقائي";
  const themeLabelEn = theme === "dark" ? "Dark" : theme === "light" ? "Light" : "System";

  return (
    <div className="flex items-center gap-1">
      {/* Theme toggle */}
      <button
        onClick={cycleTheme}
        title={locale === "ar" ? themeLabel : themeLabelEn}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-[var(--c-hover)] hover:text-[var(--c-text)]"
      >
        <ThemeIcon className="h-4 w-4" />
      </button>

      {/* Language toggle */}
      {!collapsed && (
        <button
          onClick={() => setLocale(nextLocale as "ar" | "en")}
          title={locale === "ar" ? "Switch to English" : "التبديل للعربية"}
          className="flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-muted transition-colors hover:bg-[var(--c-hover)] hover:text-[var(--c-text)]"
        >
          {locale === "ar" ? (
            <>
              <span className="text-sm">EN</span>
            </>
          ) : (
            <>
              <span style={{ fontFamily: '"IBM Plex Sans Arabic", sans-serif' }}>ع</span>
            </>
          )}
        </button>
      )}

      {collapsed && (
        <button
          onClick={() => setLocale(nextLocale as "ar" | "en")}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold text-muted transition-colors hover:bg-[var(--c-hover)] hover:text-[var(--c-text)]"
        >
          {locale === "ar" ? "EN" : <span style={{ fontFamily: '"IBM Plex Sans Arabic", sans-serif' }}>ع</span>}
        </button>
      )}
    </div>
  );
}
