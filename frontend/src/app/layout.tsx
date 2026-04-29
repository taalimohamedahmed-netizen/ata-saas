import type { Metadata } from "next";
import { Toaster } from "sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { cookies } from "next/headers";
import "./globals.css";

export const metadata: Metadata = {
  title: "ATA — Autonomous Trade Agent",
  description:
    "Multi-tenant SaaS platform for Arabic e-commerce merchants. Automate customer service with AI.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const locale = cookieStore.get("NEXT_LOCALE")?.value || "ar";
  const dir = locale === "ar" ? "rtl" : "ltr";

  return (
    <html lang={locale} dir={dir} className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full flex flex-col transition-colors duration-300 dark:bg-navy dark:text-slate-100 bg-slate-50 text-slate-900">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          {children}
          <Toaster
            position="top-center"
            toastOptions={{
              className: "dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 bg-white border-slate-200 text-slate-900",
              style: {
                fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
              },
            }}
          />
        </ThemeProvider>
      </body>
    </html>
  );
}
