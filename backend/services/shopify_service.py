"""
Shopify REST Admin API client (per-tenant).

A new instance is created per tenant request:
    shopify = ShopifyService(tenant)
    order = await shopify.get_order(order_id)

Auth: Shopify access token is a tenant column (tenant.shopify_token).
"""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import logging
import os
from typing import Any

import httpx

log = logging.getLogger("ata.shopify")

API_VERSION = os.getenv("SHOPIFY_API_VERSION", "2024-10")
DEFAULT_TIMEOUT = httpx.Timeout(20.0, connect=5.0)


class ShopifyService:
    """Async Shopify Admin API client scoped to a single tenant."""

    def __init__(self, tenant):
        if not tenant.shopify_domain or not tenant.shopify_token:
            raise ValueError(
                f"Tenant {tenant.id} is not connected to Shopify"
            )
        self.tenant = tenant
        self.base_url = (
            f"https://{tenant.shopify_domain}/admin/api/{API_VERSION}"
        )
        self.headers = {
            "X-Shopify-Access-Token": tenant.shopify_token,
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

    # ----------------------------------------------------------------
    # Internals
    # ----------------------------------------------------------------
    async def _request(
        self,
        method: str,
        path: str,
        params: dict | None = None,
        json_body: dict | None = None,
        _retry: int = 3,
    ) -> dict[str, Any]:
        """Wrapper around httpx with shared headers, error logging, and 429 retry."""
        url = f"{self.base_url}{path}"
        async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT) as client:
            resp = await client.request(
                method=method,
                url=url,
                headers=self.headers,
                params=params,
                json=json_body,
            )

        if resp.status_code == 429 and _retry > 0:
            wait = float(resp.headers.get("Retry-After", "2"))
            log.warning("Shopify rate limit hit — waiting %.1fs then retrying", wait)
            await asyncio.sleep(wait)
            return await self._request(method, path, params, json_body, _retry=_retry - 1)

        if resp.status_code >= 400:
            log.error(
                "Shopify %s %s → %s: %s",
                method, path, resp.status_code, resp.text[:300],
            )
            resp.raise_for_status()
        return resp.json() if resp.content else {}

    # ----------------------------------------------------------------
    # Orders
    # ----------------------------------------------------------------
    async def get_order(self, order_id: str | int) -> dict[str, Any]:
        """Fetch a full order by Shopify ID."""
        data = await self._request("GET", f"/orders/{order_id}.json")
        return data.get("order", {})

    async def list_recent_orders(
        self,
        phone: str | None = None,
        email: str | None = None,
        limit: int = 5,
    ) -> list[dict[str, Any]]:
        """List recent orders, optionally filtered by phone or email."""
        params: dict[str, Any] = {"status": "any", "limit": limit}
        if phone:
            params["phone"] = phone
        if email:
            params["email"] = email
        data = await self._request("GET", "/orders.json", params=params)
        return data.get("orders", [])

    async def update_order_note(
        self, order_id: str | int, note: str
    ) -> dict[str, Any]:
        """Append a note to a Shopify order (used after we confirm payment)."""
        body = {"order": {"id": int(order_id), "note": note}}
        data = await self._request(
            "PUT", f"/orders/{order_id}.json", json_body=body
        )
        return data.get("order", {})

    async def mark_order_paid(self, order_id: str | int) -> dict[str, Any]:
        """Create a paid transaction so Shopify shows the order as paid."""
        body = {
            "transaction": {
                "kind": "capture",
                "status": "success",
                "source": "external",
            }
        }
        data = await self._request(
            "POST",
            f"/orders/{order_id}/transactions.json",
            json_body=body,
        )
        return data.get("transaction", {})

    async def tag_order(self, order_id: str | int, tag: str) -> None:
        """Append a tag to a Shopify order (non-destructive — preserves existing tags)."""
        data = await self._request("GET", f"/orders/{order_id}.json", params={"fields": "tags"})
        current = data.get("order", {}).get("tags", "") or ""
        tags = [t.strip() for t in current.split(",") if t.strip()]
        if tag not in tags:
            tags.append(tag)
            body = {"order": {"id": int(order_id), "tags": ", ".join(tags)}}
            await self._request("PUT", f"/orders/{order_id}.json", json_body=body)

    async def cancel_order(
        self,
        order_id: str | int,
        reason: str = "customer",
    ) -> dict[str, Any]:
        """Cancel an order on Shopify."""
        body = {"reason": reason}
        return await self._request(
            "POST",
            f"/orders/{order_id}/cancel.json",
            json_body=body,
        )

    # ----------------------------------------------------------------
    # Historical sync helpers (Cursor-based Pagination)
    # ----------------------------------------------------------------
    async def _paginate(self, path: str, resource_key: str, base_params: dict[str, Any] | None = None) -> list[dict[str, Any]]:
        """Fetch all pages of a resource using Link header cursor pagination."""
        all_items = []
        url = f"{self.base_url}{path}"
        params = {"limit": 250}
        if base_params:
            params.update(base_params)
        page = 0

        while url:
            async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT) as client:
                resp = await client.request(
                    method="GET",
                    url=url,
                    headers=self.headers,
                    params=params,
                )

            if resp.status_code == 429:
                wait = float(resp.headers.get("Retry-After", "2"))
                log.warning("Shopify rate limit — waiting %.1fs (page %d, %d fetched so far)", wait, page, len(all_items))
                await asyncio.sleep(wait)
                continue

            if resp.status_code >= 400:
                log.error("Shopify GET %s → %s: %s", url, resp.status_code, resp.text[:300])
                resp.raise_for_status()

            data = resp.json() if resp.content else {}
            items = data.get(resource_key, [])
            all_items.extend(items)
            page += 1
            log.debug("Shopify paginate %s page=%d batch=%d total=%d", resource_key, page, len(items), len(all_items))

            # Parse Link header to find the 'next' page
            link_header = resp.headers.get("Link", "")
            next_url = None
            if link_header:
                for link in link_header.split(","):
                    if 'rel="next"' in link:
                        start = link.find("<")
                        end = link.find(">")
                        if start != -1 and end != -1:
                            next_url = link[start + 1 : end]
                        break

            url = next_url
            params = None  # already embedded in next_url

            # Polite delay between pages to avoid hitting call-bucket limits
            if url:
                await asyncio.sleep(0.5)

        return all_items

    async def sync_orders(self) -> list[dict[str, Any]]:
        """Fetch ALL orders for historical sync using cursor pagination."""
        return await self._paginate("/orders.json", "orders", base_params={"status": "any", "order": "created_at asc"})

    async def sync_products(self) -> list[dict[str, Any]]:
        """Fetch ALL products for historical sync using cursor pagination."""
        return await self._paginate("/products.json", "products")

    async def sync_customers(self) -> list[dict[str, Any]]:
        """Fetch ALL customers for historical sync using cursor pagination."""
        return await self._paginate("/customers.json", "customers")

    # ----------------------------------------------------------------
    # Products (used by RevenueHandler for upsells)
    # ----------------------------------------------------------------
    async def list_products(self, limit: int = 10) -> list[dict[str, Any]]:
        params = {"limit": limit}
        data = await self._request("GET", "/products.json", params=params)
        return data.get("products", [])

    # ----------------------------------------------------------------
    # Webhook management
    # ----------------------------------------------------------------
    async def list_webhooks(self) -> list[dict[str, Any]]:
        """Return all webhooks registered for this store."""
        data = await self._request("GET", "/webhooks.json")
        return data.get("webhooks", [])

    async def register_webhook(self, topic: str, address: str) -> dict[str, Any]:
        """Register a webhook. Returns the created webhook dict."""
        body = {"webhook": {"topic": topic, "address": address, "format": "json"}}
        data = await self._request("POST", "/webhooks.json", json_body=body)
        return data.get("webhook", {})

    async def delete_webhook(self, webhook_id: str | int) -> None:
        """Delete a webhook by ID."""
        await self._request("DELETE", f"/webhooks/{webhook_id}.json")

    async def find_webhook(self, topic: str) -> dict[str, Any] | None:
        """Find an existing webhook by topic, or return None."""
        webhooks = await self.list_webhooks()
        for wh in webhooks:
            if wh.get("topic") == topic:
                return wh
        return None

    # ----------------------------------------------------------------
    # Webhook verification (HMAC-SHA256)
    # ----------------------------------------------------------------
    @staticmethod
    def verify_webhook(body: bytes, hmac_header: str, secret: str) -> bool:
        """Constant-time check of the X-Shopify-Hmac-Sha256 header."""
        if not body or not hmac_header or not secret:
            return False
        digest = hmac.new(
            secret.encode("utf-8"),
            body,
            hashlib.sha256,
        ).digest()
        import base64
        expected = base64.b64encode(digest).decode("utf-8")
        return hmac.compare_digest(expected, hmac_header)
