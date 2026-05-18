import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  DataTable,
  Badge,
  Text,
  EmptyState,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { backendGet } from "../backend.server";

interface Order {
  id: number;
  shopify_order_id: string;
  order_number: string;
  customer_phone: string | null;
  customer_name: string | null;
  total_price: number;
  currency: string;
  status: string;
  created_at: string;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const orders = await backendGet<Order[]>(session.shop, "/dashboard/orders");
  return json({ orders });
};

export default function Orders() {
  const { orders } = useLoaderData<typeof loader>();

  if (orders.length === 0) {
    return (
      <Page title="Orders">
        <Card>
          <EmptyState heading="No orders yet" image="">
            <Text as="p">Orders from your Shopify store will appear here once received via webhook.</Text>
          </EmptyState>
        </Card>
      </Page>
    );
  }

  const rows = orders.map((o) => [
    o.order_number || `#${o.shopify_order_id}`,
    o.customer_name || o.customer_phone || "—",
    `${o.currency} ${o.total_price}`,
    <Badge key={o.id} tone={o.status === "confirmed" ? "success" : o.status === "pending" ? "attention" : "enabled"}>
      {o.status}
    </Badge>,
    new Date(o.created_at).toLocaleDateString(),
  ]);

  return (
    <Page title="Orders">
      <Layout>
        <Layout.Section>
          <Card padding="0">
            <DataTable
              columnContentTypes={["text", "text", "text", "text", "text"]}
              headings={["Order", "Customer", "Total", "Status", "Date"]}
              rows={rows}
            />
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
