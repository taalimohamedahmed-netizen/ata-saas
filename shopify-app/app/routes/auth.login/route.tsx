import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Form, useActionData, useLoaderData } from "@remix-run/react";
import { login } from "../../shopify.server";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import polarisTranslations from "@shopify/polaris/locales/en.json";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  return json({ shop: url.searchParams.get("shop") });
}

type ActionErrors = { errors: Record<string, string> };

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const shop = String(formData.get("shop"));
  if (!shop || !shop.includes(".")) {
    return { errors: { shop: "Please enter a valid .myshopify.com domain" } } satisfies ActionErrors;
  }
  return login(request);
}

export default function Auth() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<ActionErrors | undefined>();
  const errors = actionData?.errors ?? {};

  return (
    <AppProvider isEmbeddedApp apiKey={process.env.SHOPIFY_API_KEY || ""} i18n={polarisTranslations}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "#f4f6f8" }}>
        <div style={{ background: "white", padding: 40, borderRadius: 12, boxShadow: "0 2px 12px rgba(0,0,0,0.1)", width: 400 }}>
          <h1 style={{ marginBottom: 8, fontSize: 24, fontWeight: 700 }}>ATA — WhatsApp Inbox</h1>
          <p style={{ color: "#637381", marginBottom: 24 }}>Enter your Shopify store domain to get started.</p>
          <Form method="post">
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", marginBottom: 4, fontWeight: 500 }}>Store domain</label>
              <input
                name="shop"
                type="text"
                placeholder="your-store.myshopify.com"
                defaultValue={loaderData.shop || ""}
                style={{ width: "100%", padding: "10px 12px", border: "1px solid #dde0e4", borderRadius: 8, fontSize: 14, boxSizing: "border-box" }}
              />
              {errors.shop && <p style={{ color: "#d72c0d", fontSize: 12, marginTop: 4 }}>{errors.shop}</p>}
            </div>
            <button type="submit" style={{ width: "100%", padding: "12px", background: "#008060", color: "white", border: "none", borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: "pointer" }}>
              Install App
            </button>
          </Form>
        </div>
      </div>
    </AppProvider>
  );
}
