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
  TextField,
  Button,
  Badge,
  Banner,
  Divider,
  InlineStack,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { backendGet, backendPost } from "../backend.server";

interface Settings {
  whatsapp_connected: boolean;
  whatsapp_phone_number: string | null;
  whatsapp_phone_id: string | null;
  whatsapp_waba_id: string | null;
  whatsapp_verify_token: string | null;
  brand_name: string | null;
  brand_tone: string | null;
  brand_policies: string | null;
  ai_enabled: boolean;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const settings = await backendGet<Settings>(session.shop, "/settings/shopify-tenant");
  const webhookUrl = `${process.env.ATA_BACKEND_URL}/webhook/whatsapp/shop/${encodeURIComponent(session.shop)}`;
  return json({ settings, webhookUrl, shop: session.shop });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "whatsapp") {
    await backendPost(session.shop, "/settings/shopify-tenant/whatsapp", {
      waba_id: formData.get("waba_id"),
      phone_id: formData.get("phone_id"),
      phone_number: formData.get("phone_number"),
      access_token: formData.get("access_token"),
    });
    return json({ ok: true, intent: "whatsapp" });
  }

  if (intent === "brand") {
    await backendPost(session.shop, "/settings/shopify-tenant/brand", {
      brand_name: formData.get("brand_name"),
      brand_tone: formData.get("brand_tone"),
      brand_policies: formData.get("brand_policies"),
    });
    return json({ ok: true, intent: "brand" });
  }

  return json({ ok: false });
};

export default function Settings() {
  const { settings, webhookUrl } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();

  const [wabaId, setWabaId] = useState(settings.whatsapp_waba_id || "");
  const [phoneId, setPhoneId] = useState(settings.whatsapp_phone_id || "");
  const [phoneNumber, setPhoneNumber] = useState(settings.whatsapp_phone_number || "");
  const [accessToken, setAccessToken] = useState("");
  const [brandName, setBrandName] = useState(settings.brand_name || "");
  const [brandTone, setBrandTone] = useState(settings.brand_tone || "");
  const [brandPolicies, setBrandPolicies] = useState(settings.brand_policies || "");

  const saving = fetcher.state !== "idle";
  const saved = fetcher.data?.ok;

  return (
    <Page title="Settings">
      <Layout>
        {/* WhatsApp */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between">
                <Text as="h2" variant="headingMd">WhatsApp Business</Text>
                <Badge tone={settings.whatsapp_connected ? "success" : "critical"}>
                  {settings.whatsapp_connected ? "Connected" : "Not Connected"}
                </Badge>
              </InlineStack>

              {settings.whatsapp_connected && (
                <Banner tone="success">
                  <Text as="p" variant="bodySm">
                    Connected: {settings.whatsapp_phone_number}
                  </Text>
                </Banner>
              )}

              <Divider />

              <Text as="p" variant="bodyMd" fontWeight="semibold">Webhook Configuration</Text>
              <Banner>
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm">Copy these to your Meta Business Manager → WhatsApp → Webhooks:</Text>
                  <Text as="p" variant="bodySm"><strong>URL:</strong> {webhookUrl}</Text>
                  {settings.whatsapp_verify_token && (
                    <Text as="p" variant="bodySm"><strong>Verify Token:</strong> {settings.whatsapp_verify_token}</Text>
                  )}
                </BlockStack>
              </Banner>

              <Divider />

              <fetcher.Form method="post">
                <input type="hidden" name="intent" value="whatsapp" />
                <BlockStack gap="300">
                  <TextField label="WABA ID" name="waba_id" value={wabaId} onChange={setWabaId} autoComplete="off" />
                  <TextField label="Phone Number ID" name="phone_id" value={phoneId} onChange={setPhoneId} autoComplete="off" />
                  <TextField label="Phone Number" name="phone_number" value={phoneNumber} onChange={setPhoneNumber} autoComplete="off" placeholder="+20xxxxxxxxxx" />
                  <TextField label="Access Token" name="access_token" value={accessToken} onChange={setAccessToken} autoComplete="off" type="password" helpText="Leave blank to keep existing token" />
                  <Button submit variant="primary" loading={saving && fetcher.formData?.get("intent") === "whatsapp"}>
                    Save WhatsApp Settings
                  </Button>
                </BlockStack>
              </fetcher.Form>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Brand Voice */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">AI Brand Voice</Text>
              <Text as="p" variant="bodySm" tone="subdued">
                Configure how the AI assistant responds to your customers.
              </Text>
              <fetcher.Form method="post">
                <input type="hidden" name="intent" value="brand" />
                <BlockStack gap="300">
                  <TextField label="Brand Name" name="brand_name" value={brandName} onChange={setBrandName} autoComplete="off" />
                  <TextField
                    label="Brand Tone"
                    name="brand_tone"
                    value={brandTone}
                    onChange={setBrandTone}
                    autoComplete="off"
                    helpText="e.g. Friendly and professional, casual, formal"
                  />
                  <TextField
                    label="Policies & Instructions"
                    name="brand_policies"
                    value={brandPolicies}
                    onChange={setBrandPolicies}
                    autoComplete="off"
                    multiline={5}
                    helpText="Shipping policies, return policy, custom instructions for the AI"
                  />
                  <Button submit variant="primary" loading={saving && fetcher.formData?.get("intent") === "brand"}>
                    Save Brand Settings
                  </Button>
                </BlockStack>
              </fetcher.Form>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
