import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineGrid,
  Badge,
  Spinner,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { backendGet } from "../backend.server";

interface Stats {
  conversations_total: number;
  conversations_open: number;
  orders_today: number;
  messages_sent_today: number;
  whatsapp_connected: boolean;
  shopify_connected: boolean;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  try {
    const stats = await backendGet<Stats>(shop, `/dashboard/stats`);
    return json({ shop, stats, error: null });
  } catch {
    return json({
      shop,
      stats: null,
      error: "Cannot reach ATA backend",
    });
  }
};

function StatCard({ label, value, badge }: { label: string; value: string | number; badge?: string }) {
  return (
    <Card>
      <BlockStack gap="200">
        <Text as="p" variant="bodySm" tone="subdued">{label}</Text>
        <Text as="p" variant="headingXl" fontWeight="bold">{value}</Text>
        {badge && <Badge tone="success">{badge}</Badge>}
      </BlockStack>
    </Card>
  );
}

export default function Index() {
  const { shop, stats, error } = useLoaderData<typeof loader>();

  if (error) {
    return (
      <Page title="ATA Dashboard">
        <Card>
          <BlockStack gap="200">
            <Text as="p" tone="critical">{error}</Text>
            <Text as="p" variant="bodySm" tone="subdued">Make sure the ATA backend is running and connected.</Text>
          </BlockStack>
        </Card>
      </Page>
    );
  }

  if (!stats) {
    return <Page title="ATA Dashboard"><Spinner /></Page>;
  }

  return (
    <Page
      title="ATA Dashboard"
      subtitle={`Connected store: ${shop}`}
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            <InlineGrid columns={4} gap="400">
              <StatCard label="Open Conversations" value={stats.conversations_open} />
              <StatCard label="Total Conversations" value={stats.conversations_total} />
              <StatCard label="Orders Today" value={stats.orders_today} />
              <StatCard label="Messages Sent Today" value={stats.messages_sent_today} />
            </InlineGrid>

            <InlineGrid columns={2} gap="400">
              <Card>
                <BlockStack gap="200">
                  <Text as="p" variant="bodySm" tone="subdued">WhatsApp Status</Text>
                  {stats.whatsapp_connected
                    ? <Badge tone="success">Connected</Badge>
                    : <Badge tone="critical">Not Connected</Badge>}
                </BlockStack>
              </Card>
              <Card>
                <BlockStack gap="200">
                  <Text as="p" variant="bodySm" tone="subdued">Shopify Status</Text>
                  {stats.shopify_connected
                    ? <Badge tone="success">Connected</Badge>
                    : <Badge tone="critical">Not Connected</Badge>}
                </BlockStack>
              </Card>
            </InlineGrid>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
