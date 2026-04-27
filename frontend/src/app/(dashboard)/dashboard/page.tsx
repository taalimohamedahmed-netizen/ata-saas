"use client";

import { Construction } from "lucide-react";
import { useAuthStore } from "@/store/auth-store";

export default function DashboardPage() {
  const tenantName = useAuthStore((s) => s.tenantName);

  return (
    <div className="flex h-full flex-col items-center justify-center p-8">
      <div className="text-center space-y-6 max-w-md">
        {/* Greeting */}
        <h1
          className="text-3xl font-bold text-white"
          style={{ fontFamily: '"IBM Plex Sans Arabic", sans-serif' }}
        >
          مرحباً، {tenantName || "صديقنا"}! 👋
        </h1>

        {/* Under construction */}
        <div className="flex flex-col items-center gap-4">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gold/10 border border-gold/20">
            <Construction className="h-10 w-10 text-gold" />
          </div>
          <p
            className="text-lg text-slate-400"
            style={{ fontFamily: '"IBM Plex Sans Arabic", sans-serif' }}
          >
            لوحة التحكم قيد الإنشاء...
          </p>
          <p className="text-sm text-muted">
            نعمل على بناء تجربة مذهلة لك. ترقّب التحديثات القادمة!
          </p>
        </div>

        {/* Stats placeholder */}
        <div className="grid grid-cols-3 gap-3 mt-8">
          {[
            { label: "الطلبات", value: "—" },
            { label: "العملاء", value: "—" },
            { label: "المحادثات", value: "—" },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl border border-border bg-surface p-4 text-center"
            >
              <p className="text-2xl font-bold text-white">{stat.value}</p>
              <p
                className="text-xs text-muted mt-1"
                style={{
                  fontFamily: '"IBM Plex Sans Arabic", sans-serif',
                }}
              >
                {stat.label}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
