"use client";

import { createContext, useContext } from "react";

type Dict = Record<string, Record<string, string>>;

interface I18nValue {
  locale: string;
  dir: "rtl" | "ltr";
  dict: Dict;
  fontFamily: string;
  t: (section: string, key: string, fallback?: string) => string;
  fmtDate: (iso: string | null, opts?: Intl.DateTimeFormatOptions) => string;
  fmtNum: (n: number, opts?: Intl.NumberFormatOptions) => string;
}

const I18nContext = createContext<I18nValue>({
  locale: "ar",
  dir: "rtl",
  dict: {},
  fontFamily: '"IBM Plex Sans Arabic", sans-serif',
  t: (_s, k) => k,
  fmtDate: (iso) => iso ?? "—",
  fmtNum: (n) => String(n),
});

export function I18nProvider({
  locale,
  dict,
  children,
}: {
  locale: string;
  dict: Dict;
  children: React.ReactNode;
}) {
  const dir = locale === "ar" ? "rtl" : "ltr";
  const fmtLocale = locale === "ar" ? "ar-EG" : "en-US";
  const fontFamily =
    locale === "ar"
      ? '"IBM Plex Sans Arabic", sans-serif'
      : '"Inter", sans-serif';

  function t(section: string, key: string, fallback?: string): string {
    return (dict[section]?.[key] as string) ?? fallback ?? key;
  }

  function fmtDate(
    iso: string | null,
    opts: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short", year: "numeric" }
  ): string {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString(fmtLocale, opts);
  }

  function fmtNum(n: number, opts?: Intl.NumberFormatOptions): string {
    return n.toLocaleString(fmtLocale, opts);
  }

  return (
    <I18nContext.Provider value={{ locale, dir, dict, fontFamily, t, fmtDate, fmtNum }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}
