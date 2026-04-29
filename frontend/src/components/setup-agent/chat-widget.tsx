"use client";

import { useState, useRef, useEffect } from "react";
import { Bot, X, Send, Loader2, ExternalLink } from "lucide-react";
import api from "@/lib/api";
import { useI18n } from "@/context/i18n-context";

interface Message {
  role: "user" | "assistant";
  content: string;
  redirectUrl?: string;
}

export function SetupChatWidget() {
  const { t, locale } = useI18n();
  const fontFamily = locale === "ar"
    ? '"IBM Plex Sans Arabic", sans-serif'
    : '"Inter", sans-serif';

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: t("agent", "welcome") },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  const apiHistory = () =>
    messages.map((m) => ({ role: m.role, content: m.content }));

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setLoading(true);
    try {
      const { data } = await api.post("/dashboard/agent/chat", {
        message: text,
        history: apiHistory(),
      });
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.reply || t("agent", "connectionError"),
          redirectUrl: data.redirect_url ?? undefined,
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: t("agent", "connectionError") },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  const panelDir = locale === "ar" ? "rtl" : "ltr";

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-6 left-6 z-50 flex items-center justify-center rounded-full bg-accent shadow-lg transition-transform hover:scale-105 active:scale-95"
        style={{ width: 52, height: 52 }}
        title={t("agent", "title")}
      >
        {open ? <X className="h-5 w-5 text-white" /> : <Bot className="h-5 w-5 text-white" />}
      </button>

      {/* Chat panel */}
      {open && (
        <div
          className="fixed bottom-24 left-6 z-50 flex flex-col rounded-2xl border border-[var(--c-border)] bg-[var(--c-navy-light)] shadow-2xl"
          style={{ width: 360, height: 500 }}
          dir={panelDir}
        >
          {/* Header */}
          <div className="flex items-center gap-2 rounded-t-2xl border-b border-[var(--c-border)] bg-[var(--c-navy-card)] px-4 py-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/20 shrink-0">
              <Bot className="h-4 w-4 text-accent" />
            </div>
            <div>
              <p className="text-sm font-semibold text-[var(--c-text)]" style={{ fontFamily }}>
                {t("agent", "title")}
              </p>
              <p className="text-xs text-muted" style={{ fontFamily: '"Inter", sans-serif' }}>
                {t("agent", "subtitle")}
              </p>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-start" : "justify-end"}`}>
                <div
                  className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "bg-accent text-white rounded-br-sm"
                      : "bg-[var(--c-surface)] text-[var(--c-text)] rounded-bl-sm"
                  }`}
                  style={{ fontFamily, whiteSpace: "pre-wrap" }}
                >
                  {msg.content}
                  {msg.redirectUrl && (
                    <a
                      href={msg.redirectUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 flex items-center gap-1.5 rounded-lg bg-white/15 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/25 transition-colors"
                    >
                      <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                      {t("agent", "shopifyButton")}
                    </a>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-end">
                <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-sm bg-[var(--c-surface)] px-3 py-2 text-sm text-muted">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span style={{ fontFamily }}>{t("agent", "thinking")}</span>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="border-t border-[var(--c-border)] px-3 py-2">
            <div className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder={t("agent", "placeholder")}
                rows={1}
                disabled={loading}
                className="flex-1 resize-none rounded-xl bg-[var(--c-input-bg)] px-3 py-2 text-sm text-[var(--c-text)] placeholder-muted outline-none focus:bg-[var(--c-hover)] transition-colors disabled:opacity-50"
                style={{ fontFamily, maxHeight: 96, overflowY: "auto" }}
                onInput={(e) => {
                  const el = e.currentTarget;
                  el.style.height = "auto";
                  el.style.height = Math.min(el.scrollHeight, 96) + "px";
                }}
              />
              <button
                onClick={send}
                disabled={!input.trim() || loading}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent text-white transition-opacity disabled:opacity-40"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-1 text-center text-xs text-muted/50" style={{ fontFamily }}>
              {t("agent", "sendHint")}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
