import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import { useState } from "react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Badge,
  Avatar,
  TextField,
  Button,
  Divider,
  EmptyState,
  Spinner,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { backendGet, backendPost } from "../backend.server";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

interface Conversation {
  id: number;
  customer_phone: string;
  customer_name: string | null;
  status: string;
  ai_enabled: boolean;
  updated_at: string;
  context?: {
    history_tail?: Message[];
  };
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const conversations = await backendGet<Conversation[]>(
    session.shop,
    "/dashboard/conversations"
  );
  return json({ conversations });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "toggle_ai") {
    const conversationId = formData.get("conversationId");
    const aiEnabled = formData.get("aiEnabled") === "true";
    await backendPost(session.shop, `/dashboard/conversations/${conversationId}/toggle-ai`, {
      ai_enabled: !aiEnabled,
    });
  }

  if (intent === "send_message") {
    const conversationId = formData.get("conversationId");
    const message = formData.get("message");
    await backendPost(session.shop, `/dashboard/conversations/${conversationId}/reply`, {
      message,
    });
  }

  return json({ ok: true });
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function Inbox() {
  const { conversations } = useLoaderData<typeof loader>();
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [reply, setReply] = useState("");
  const fetcher = useFetcher();

  const messages = selected?.context?.history_tail || [];

  function sendReply() {
    if (!reply.trim() || !selected) return;
    fetcher.submit(
      { intent: "send_message", conversationId: String(selected.id), message: reply },
      { method: "post" }
    );
    setReply("");
  }

  return (
    <Page title="WhatsApp Inbox">
      <Layout>
        {/* Conversation list */}
        <Layout.Section variant="oneThird">
          <Card padding="0">
            {conversations.length === 0 ? (
              <EmptyState
                heading="No conversations yet"
                image=""
              >
                <Text as="p" variant="bodySm">Messages from your customers will appear here.</Text>
              </EmptyState>
            ) : (
              conversations.map((c) => (
                <div
                  key={c.id}
                  onClick={() => setSelected(c)}
                  style={{
                    padding: "12px 16px",
                    cursor: "pointer",
                    background: selected?.id === c.id ? "#f0f9f5" : "white",
                    borderBottom: "1px solid #e5e5e5",
                  }}
                >
                  <InlineStack gap="300" align="start">
                    <Avatar initials={(c.customer_name || c.customer_phone).slice(0, 2)} />
                    <BlockStack gap="100">
                      <InlineStack gap="200" align="space-between">
                        <Text as="span" variant="bodyMd" fontWeight="semibold">
                          {c.customer_name || c.customer_phone}
                        </Text>
                        <Text as="span" variant="bodySm" tone="subdued">{timeAgo(c.updated_at)}</Text>
                      </InlineStack>
                      <InlineStack gap="200">
                        <Badge tone={c.status === "open" ? "attention" : "success"}>
                          {c.status}
                        </Badge>
                        <Badge tone={c.ai_enabled ? "success" : "enabled"}>
                          {c.ai_enabled ? "AI On" : "AI Off"}
                        </Badge>
                      </InlineStack>
                    </BlockStack>
                  </InlineStack>
                </div>
              ))
            )}
          </Card>
        </Layout.Section>

        {/* Chat panel */}
        <Layout.Section>
          {!selected ? (
            <Card>
              <BlockStack gap="200" inlineAlign="center">
                <Text as="p" tone="subdued">Select a conversation to view messages</Text>
              </BlockStack>
            </Card>
          ) : (
            <Card>
              <BlockStack gap="400">
                {/* Header */}
                <InlineStack align="space-between">
                  <BlockStack gap="100">
                    <Text as="h2" variant="headingMd">{selected.customer_name || selected.customer_phone}</Text>
                    <Text as="p" variant="bodySm" tone="subdued">{selected.customer_phone}</Text>
                  </BlockStack>
                  <fetcher.Form method="post">
                    <input type="hidden" name="intent" value="toggle_ai" />
                    <input type="hidden" name="conversationId" value={selected.id} />
                    <input type="hidden" name="aiEnabled" value={String(selected.ai_enabled)} />
                    <Button submit variant={selected.ai_enabled ? "primary" : "secondary"}>
                      {selected.ai_enabled ? "AI Enabled" : "AI Disabled"}
                    </Button>
                  </fetcher.Form>
                </InlineStack>

                <Divider />

                {/* Messages */}
                <div style={{ maxHeight: 400, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
                  {messages.length === 0 && (
                    <Text as="p" tone="subdued">No messages yet</Text>
                  )}
                  {messages.map((msg, i) => (
                    <div
                      key={i}
                      style={{
                        alignSelf: msg.role === "assistant" ? "flex-end" : "flex-start",
                        background: msg.role === "assistant" ? "#008060" : "#f4f6f8",
                        color: msg.role === "assistant" ? "white" : "#212326",
                        padding: "8px 12px",
                        borderRadius: 12,
                        maxWidth: "70%",
                        fontSize: 14,
                      }}
                    >
                      {msg.content}
                    </div>
                  ))}
                </div>

                <Divider />

                {/* Reply */}
                <InlineStack gap="200" align="end">
                  <div style={{ flex: 1 }}>
                    <TextField
                      label=""
                      value={reply}
                      onChange={setReply}
                      placeholder="Type a reply..."
                      autoComplete="off"
                      multiline={2}
                    />
                  </div>
                  <Button variant="primary" onClick={sendReply} loading={fetcher.state !== "idle"}>
                    Send
                  </Button>
                </InlineStack>
              </BlockStack>
            </Card>
          )}
        </Layout.Section>
      </Layout>
    </Page>
  );
}
