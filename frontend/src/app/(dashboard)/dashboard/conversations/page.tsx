"use client";

import { useEffect, useState, useRef } from "react";
import { MessageSquare, User, Search, RefreshCw, Clock, Bot, Send, PauseCircle, PlayCircle } from "lucide-react";
import { toast } from "sonner";
import { getConversations, type Conversation } from "@/lib/dashboard";
import { toggleConversationAI, sendManualReply } from "@/lib/settings";

function ConversationCard({
  convo,
  active,
  onClick,
}: {
  convo: Conversation;
  active: boolean;
  onClick: () => void;
}) {
  const lastMsg = convo.context?.history_tail?.[convo.context.history_tail.length - 1];
  const date = convo.updated_at ? new Date(convo.updated_at) : null;

  return (
    <button
      onClick={onClick}
      className={`w-full flex flex-col gap-1 border-b border-border p-4 transition-colors text-right ${
        active ? "bg-accent/10" : "hover:bg-white/5"
      }`}
    >
      <div className="flex items-center justify-between w-full">
        <div className="flex items-center gap-1.5">
          {convo.ai_paused && (
            <span className="rounded-full bg-warning/20 px-1.5 py-0.5 text-[10px] font-bold text-warning uppercase">
              يدوي
            </span>
          )}
          <span className="text-xs text-muted">
            {date ? date.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" }) : ""}
          </span>
        </div>
        <span className="font-semibold text-white">
          {convo.customer?.name || convo.customer?.phone || "عميل مجهول"}
        </span>
      </div>
      <p className="text-sm text-muted truncate w-full" dir="rtl">
        {lastMsg ? lastMsg.content : "بدء محادثة جديدة..."}
      </p>
    </button>
  );
}

function ChatMessage({ msg }: { msg: { role: string; content: string; manual?: boolean } }) {
  const isBot = msg.role === "assistant" || msg.role === "bot";
  return (
    <div className={`flex w-full ${isBot ? "justify-start" : "justify-end"} mb-4`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
          isBot
            ? "bg-navy-light border border-border text-white rounded-tr-none"
            : "bg-accent text-white rounded-tl-none"
        }`}
      >
        <div className="flex items-center gap-1.5 mb-1 opacity-50 text-[10px] uppercase tracking-wider">
          {isBot ? (
            <>
              <Bot className="h-3 w-3" />
              {msg.manual ? "رد يدوي" : "ATA AI"}
            </>
          ) : (
            <>
              <User className="h-3 w-3" /> عميل
            </>
          )}
        </div>
        <p dir="auto">{msg.content}</p>
      </div>
    </div>
  );
}

export default function ConversationsPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [manualText, setManualText] = useState("");
  const [sending, setSending] = useState(false);
  const [togglingAI, setTogglingAI] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchChats = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const data = await getConversations();
      setConversations(data);
      if (data.length > 0 && !selectedId) setSelectedId(data[0].id);
    } catch {
      toast.error("فشل تحميل المحادثات");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchChats(); }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [selectedId, conversations]);

  const selectedConvo = conversations.find((c) => c.id === selectedId);
  const filteredConvos = conversations.filter(
    (c) =>
      (c.customer?.name || "").toLowerCase().includes(search.toLowerCase()) ||
      (c.customer?.phone || "").includes(search)
  );

  const handleToggleAI = async () => {
    if (!selectedConvo) return;
    setTogglingAI(true);
    try {
      const res = await toggleConversationAI(selectedConvo.id);
      setConversations((prev) =>
        prev.map((c) => (c.id === selectedConvo.id ? { ...c, ai_paused: res.ai_paused } : c))
      );
      toast.success(res.ai_paused ? "🔇 AI متوقف — يمكنك الرد يدوياً" : "🤖 AI شغّال تاني");
    } catch {
      toast.error("فشل تغيير حالة الـ AI");
    } finally {
      setTogglingAI(false);
    }
  };

  const handleSendReply = async () => {
    if (!selectedConvo || !manualText.trim()) return;
    setSending(true);
    try {
      await sendManualReply(selectedConvo.id, manualText.trim());
      // optimistic update
      const newMsg = { role: "assistant", content: manualText.trim(), manual: true };
      setConversations((prev) =>
        prev.map((c) => {
          if (c.id !== selectedConvo.id) return c;
          const tail = [...(c.context?.history_tail || []), newMsg];
          return { ...c, context: { ...c.context, history_tail: tail } };
        })
      );
      setManualText("");
      toast.success("تم إرسال الرسالة ✅");
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail || "فشل الإرسال");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex h-[calc(100vh-2rem)] overflow-hidden rounded-2xl border border-border bg-surface m-4">
      {/* ─── SIDEBAR ─── */}
      <div className="flex w-80 flex-col border-l border-border bg-navy">
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => fetchChats(true)}
              className="p-1.5 rounded-lg hover:bg-white/5 text-muted transition-colors"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            </button>
            <h2
              className="text-lg font-bold text-white"
              style={{ fontFamily: '"IBM Plex Sans Arabic", sans-serif' }}
            >
              المحادثات
            </h2>
          </div>
          <div className="relative">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              type="text"
              placeholder="بحث عن عميل..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-border bg-navy-light py-2 pr-9 pl-3 text-sm text-white focus:border-accent focus:outline-none"
              dir="rtl"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-40 gap-3 text-muted">
              <RefreshCw className="h-6 w-6 animate-spin" />
              <span className="text-xs">جاري التحميل...</span>
            </div>
          ) : filteredConvos.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-2 text-muted px-4 text-center">
              <MessageSquare className="h-8 w-8 opacity-20" />
              <span className="text-sm">لا توجد محادثات</span>
            </div>
          ) : (
            filteredConvos.map((c) => (
              <ConversationCard
                key={c.id}
                convo={c}
                active={selectedId === c.id}
                onClick={() => setSelectedId(c.id)}
              />
            ))
          )}
        </div>
      </div>

      {/* ─── CHAT WINDOW ─── */}
      <div className="flex flex-1 flex-col bg-navy-light/30">
        {selectedConvo ? (
          <>
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border bg-navy p-4 px-6">
              <div className="flex items-center gap-3">
                {/* AI Toggle button */}
                <button
                  onClick={handleToggleAI}
                  disabled={togglingAI}
                  title={selectedConvo.ai_paused ? "تشغيل الـ AI" : "إيقاف الـ AI والرد يدوياً"}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${
                    selectedConvo.ai_paused
                      ? "bg-warning/20 text-warning hover:bg-warning/30 border border-warning/30"
                      : "bg-success/10 text-success hover:bg-success/20 border border-success/20"
                  }`}
                  style={{ fontFamily: '"IBM Plex Sans Arabic", sans-serif' }}
                >
                  {togglingAI ? (
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  ) : selectedConvo.ai_paused ? (
                    <PlayCircle className="h-3.5 w-3.5" />
                  ) : (
                    <PauseCircle className="h-3.5 w-3.5" />
                  )}
                  {selectedConvo.ai_paused ? "تشغيل AI" : "إيقاف AI"}
                </button>
              </div>

              <div className="flex items-center gap-3">
                <div className="text-right">
                  <h3 className="font-semibold text-white">
                    {selectedConvo.customer?.name || "عميل مجهول"}
                  </h3>
                  <p className="text-xs text-muted" dir="ltr">
                    {selectedConvo.customer?.phone}
                  </p>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/20 text-accent">
                  <User className="h-5 w-5" />
                </div>
              </div>
            </div>

            {/* Messages */}
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto p-6 space-y-2 scroll-smooth"
            >
              <div className="flex justify-center mb-8">
                <div className="rounded-lg bg-white/5 px-3 py-1 text-[10px] text-muted flex items-center gap-1.5">
                  <Clock className="h-3 w-3" />
                  بدأت المحادثة{" "}
                  {selectedConvo.updated_at
                    ? new Date(selectedConvo.updated_at).toLocaleDateString("ar-EG")
                    : ""}
                </div>
              </div>
              {(selectedConvo.context?.history_tail || []).map((msg, i) => (
                <ChatMessage key={i} msg={msg} />
              ))}
            </div>

            {/* Input */}
            <div className="p-4 bg-navy border-t border-border">
              {selectedConvo.ai_paused ? (
                /* Manual reply — fully interactive */
                <div className="flex items-center gap-3 rounded-2xl border border-warning/40 bg-navy-light px-4 py-2.5">
                  <button
                    onClick={handleSendReply}
                    disabled={sending || !manualText.trim()}
                    className="shrink-0 rounded-xl bg-accent p-2 text-white hover:bg-accent/90 transition-colors disabled:opacity-40"
                  >
                    {sending ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </button>
                  <input
                    type="text"
                    placeholder="اكتب ردك هنا..."
                    value={manualText}
                    onChange={(e) => setManualText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendReply(); } }}
                    className="flex-1 bg-transparent text-sm text-white focus:outline-none text-right placeholder:text-muted"
                    dir="rtl"
                    style={{ fontFamily: '"IBM Plex Sans Arabic", sans-serif' }}
                  />
                  <PauseCircle className="h-5 w-5 text-warning shrink-0" />
                </div>
              ) : (
                /* AI is active — read-only */
                <div className="flex items-center gap-3 rounded-2xl border border-border bg-navy-light px-4 py-2.5 opacity-50 cursor-not-allowed">
                  <Send className="h-5 w-5 text-muted" />
                  <span className="flex-1 text-sm text-muted text-right" style={{ fontFamily: '"IBM Plex Sans Arabic", sans-serif' }}>
                    المحادثة تدار تلقائياً بالذكاء الاصطناعي — اضغط "إيقاف AI" للرد يدوياً
                  </span>
                  <Bot className="h-5 w-5 text-success shrink-0" />
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center text-muted gap-4">
            <div className="h-20 w-20 rounded-full bg-white/5 flex items-center justify-center">
              <MessageSquare className="h-10 w-10 opacity-20" />
            </div>
            <p className="text-sm" style={{ fontFamily: '"IBM Plex Sans Arabic", sans-serif' }}>
              اختر محادثة من القائمة لعرض التفاصيل
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
