import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, session, payload } =
    await authenticate.webhook(request);

  console.log(`[webhook] ${topic} from ${shop}`);

  switch (topic) {
    case "APP_UNINSTALLED":
      if (session) {
        await db.session.deleteMany({ where: { shop } });
      }
      break;

    case "CUSTOMERS_DATA_REQUEST":
    case "CUSTOMERS_REDACT":
    case "SHOP_REDACT":
      // GDPR compliance — log and acknowledge
      console.log(`[GDPR] ${topic} for shop ${shop}`, payload);
      break;

    default:
      console.warn(`[webhook] unhandled topic: ${topic}`);
  }

  return new Response(null, { status: 200 });
};
