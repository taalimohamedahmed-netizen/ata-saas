import type { Metadata } from "next";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "ATA — Autonomous Trade Agent",
  description:
    "Multi-tenant SaaS platform for Arabic e-commerce merchants. Automate customer service with AI.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        {children}
        <Toaster
          position="top-center"
          toastOptions={{
            style: {
              background: "#1E293B",
              border: "1px solid #334155",
              color: "#F1F5F9",
              fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
            },
          }}
        />
      </body>
    </html>
  );
}
