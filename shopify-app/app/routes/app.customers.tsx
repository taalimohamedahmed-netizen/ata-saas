import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  DataTable,
  Avatar,
  Text,
  InlineStack,
  Badge,
  EmptyState,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { backendGet } from "../backend.server";

interface Customer {
  id: number;
  phone: string;
  name: string | null;
  email: string | null;
  total_orders: number;
  created_at: string;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const customers = await backendGet<Customer[]>(session.shop, "/dashboard/customers");
  return json({ customers });
};

export default function Customers() {
  const { customers } = useLoaderData<typeof loader>();

  if (customers.length === 0) {
    return (
      <Page title="Customers">
        <Card>
          <EmptyState heading="No customers yet" image="">
            <Text as="p">Customers who message you on WhatsApp will appear here.</Text>
          </EmptyState>
        </Card>
      </Page>
    );
  }

  const rows = customers.map((c) => [
    <InlineStack key={c.id} gap="200" blockAlign="center">
      <Avatar initials={(c.name || c.phone).slice(0, 2)} size="sm" />
      <Text as="span">{c.name || "—"}</Text>
    </InlineStack>,
    c.phone,
    c.email || "—",
    <Badge key={c.id}>{String(c.total_orders)}</Badge>,
    new Date(c.created_at).toLocaleDateString(),
  ]);

  return (
    <Page title="Customers">
      <Layout>
        <Layout.Section>
          <Card padding="0">
            <DataTable
              columnContentTypes={["text", "text", "text", "text", "text"]}
              headings={["Name", "Phone", "Email", "Orders", "Joined"]}
              rows={rows}
            />
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
