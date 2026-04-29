"use client";

import { ClipboardCheck, Sparkles } from "lucide-react";

export default function OrderConfirmationPage() {
  return (
    <div className="flex h-[calc(100vh-2rem)] items-center justify-center p-4">
      <div className="max-w-md w-full text-center space-y-6 animate-in fade-in zoom-in duration-500">
        {/* Icon with animated glow */}
        <div className="relative mx-auto w-24 h-24">
          <div className="absolute inset-0 bg-accent/20 rounded-3xl blur-2xl animate-pulse" />
          <div className="relative flex h-24 w-24 items-center justify-center rounded-3xl border border-accent/30 bg-surface shadow-2xl shadow-accent/10">
            <ClipboardCheck className="h-12 w-12 text-accent" />
          </div>
          <Sparkles className="absolute -top-2 -right-2 h-6 w-6 text-accent animate-bounce" />
        </div>

        {/* Text content */}
        <div className="space-y-2">
          <h1 
            className="text-3xl font-black text-white tracking-tight"
            style={{ fontFamily: '"IBM Plex Sans Arabic", sans-serif' }}
          >
            تأكيد الطلبات
          </h1>
          <p 
            className="text-lg text-muted font-medium"
            style={{ fontFamily: '"IBM Plex Sans Arabic", sans-serif' }}
          >
            قريباً... Available Soon
          </p>
        </div>

        {/* Decorative divider */}
        <div className="flex items-center gap-4 px-8">
          <div className="h-px flex-1 bg-gradient-to-r from-transparent to-border" />
          <div className="h-1.5 w-1.5 rounded-full bg-accent/50" />
          <div className="h-px flex-1 bg-gradient-to-l from-transparent to-border" />
        </div>

        {/* Subtext */}
        <p 
          className="text-sm text-muted/60 leading-relaxed"
          style={{ fontFamily: '"IBM Plex Sans Arabic", sans-serif' }}
        >
          نحن نعمل على تطوير نظام ذكي لتأكيد الطلبات تلقائياً عبر الواتساب لضمان أفضل تجربة لعملائك.
        </p>
      </div>
    </div>
  );
}
