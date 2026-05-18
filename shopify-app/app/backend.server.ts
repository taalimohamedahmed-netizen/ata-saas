/**
 * Helper to call the ATA FastAPI backend from Remix server-side loaders.
 * Uses a shared internal secret so FastAPI can trust requests from this app.
 */
import { createHmac } from "crypto";

const BACKEND_URL = process.env.ATA_BACKEND_URL || "http://localhost:8000";
const INTERNAL_SECRET = process.env.INTERNAL_SECRET || "";

function makeShopToken(shop: string): string {
  const payload = { shop, iat: Math.floor(Date.now() / 1000) };
  const data = JSON.stringify(payload);
  const sig = createHmac("sha256", INTERNAL_SECRET).update(data).digest("hex");
  return Buffer.from(JSON.stringify({ data, sig })).toString("base64url");
}

export async function backendFetch(
  shop: string,
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = makeShopToken(shop);
  return fetch(`${BACKEND_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-Shop-Token": token,
      "X-Shop-Domain": shop,
      ...(options.headers || {}),
    },
  });
}

export async function backendGet<T>(shop: string, path: string): Promise<T> {
  const res = await backendFetch(shop, path);
  if (!res.ok) throw new Error(`Backend error ${res.status} on ${path}`);
  return res.json() as Promise<T>;
}

export async function backendPost<T>(
  shop: string,
  path: string,
  body: unknown
): Promise<T> {
  const res = await backendFetch(shop, path, {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Backend error ${res.status} on ${path}`);
  return res.json() as Promise<T>;
}
