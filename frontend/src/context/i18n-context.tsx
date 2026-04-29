"use client";

import { createContext, useContext } from "react";

type Dict = Record<string, Record<string, string>>;

interface I18nValue {
  locale: string;
  dir: "rtl" | "ltr";
  dict: Dict;
  t: (section: string, key: string, fallback?: string) => string;
}

const I18nContext = createContext<I18nValue>({
  locale: "ar",
  dir: "rtl",
  dict: {},
  t: (_s, k) => k,
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

  function t(section: string, key: string, fallback?: string): string {
    return (dict[section]?.[key] as string) ?? fallback ?? key;
  }

  return (
    <I18nContext.Provider value={{ locale, dir, dict, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}
