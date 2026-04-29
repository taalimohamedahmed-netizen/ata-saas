import type { Metadata } from "next";
import { Toaster } from "sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { I18nProvider } from "@/context/i18n-context";
import { cookies } from "next/headers";
import "./globals.css";

export const metadata: Metadata = {
  title: "ATA — Autonomous Trade Agent",
  description:
    "Multi-tenant SaaS platform for Arabic e-commerce merchants. Automate customer service with AI.",
};

async function loadDict(locale: string) {
  try {
    const mod = await import(`@/i18n/${locale}.json`);
    return mod.default as Record<string, Record<string, string>>;
  } catch {
    const mod = await import("@/i18n/ar.json");
    return mod.default as Record<string, Record<string, string>>;
  }
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const cookieStore = await cookies();
  const locale = cookieStore.get("NEXT_LOCALE")?.value || "ar";
  const dir = locale === "ar" ? "rtl" : "ltr";
  const dict = await loadDict(locale);

  return (
    <html lang={locale} dir={dir} className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full flex flex-col">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange={false}>
          <I18nProvider locale={locale} dict={dict}>
            {children}
            <Toaster
              position="top-center"
              toastOptions={{
                style: { fontFamily: locale === "ar" ? '"IBM Plex Sans Arabic", sans-serif' : '"Inter", sans-serif' },
              }}
            />
          </I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
