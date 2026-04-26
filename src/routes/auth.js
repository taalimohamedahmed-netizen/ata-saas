/**
 * Shopify OAuth Routes
 * GET /auth         — Redirects user to Shopify for authorization
 * GET /auth/callback — Exchanges code for permanent access_token
 */

const express = require('express');
const crypto = require('crypto');
const axios = require('axios');
const { supabase } = require('../config/supabase');
const { isValidShopDomain } = require('../middleware/security');
const { syncStoreData } = require('../services/syncService');

const router = express.Router();

// In-memory nonce store (use Redis in production)
const nonceStore = new Map();

// ============================================
// GET /auth — Start Shopify OAuth Flow
// ============================================
router.get('/auth', (req, res) => {
  const { shop, owner_id, client_id, client_secret } = req.query;

  // --- Validate required fields ---
  if (!shop || !isValidShopDomain(shop)) {
    return res.status(400).json({
      error: 'Invalid or missing shop parameter',
      expected: 'your-store.myshopify.com',
    });
  }

  if (!owner_id) {
    return res.status(400).json({
      error: 'Missing owner_id parameter.',
    });
  }

  if (!client_id || !client_secret) {
    return res.status(400).json({
      error: 'Missing Client ID or Client Secret.',
    });
  }

  // --- Generate cryptographic nonce for CSRF protection ---
  const nonce = crypto.randomBytes(16).toString('hex');

  // Store all data needed for the callback
  nonceStore.set(nonce, {
    shop,
    owner_id,
    client_id,
    client_secret,
    createdAt: Date.now()
  });

  // Clean up expired nonces (older than 10 minutes)
  const TEN_MINUTES = 10 * 60 * 1000;
  for (const [key, value] of nonceStore.entries()) {
    if (Date.now() - value.createdAt > TEN_MINUTES) {
      nonceStore.delete(key);
    }
  }

  // --- Build Shopify authorization URL using the user's own Client ID ---
  const redirectUri = `${process.env.APP_URL}/auth/callback`;
  const scopes = process.env.SHOPIFY_SCOPES || 'read_products,read_orders,read_customers';

  const authUrl =
    `https://${shop}/admin/oauth/authorize` +
    `?client_id=${client_id}` +
    `&scope=${scopes}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${nonce}`;

  console.log(`🔑 Redirecting to Shopify OAuth for: ${shop} (using client_id: ${client_id.slice(0,8)}...)`);
  return res.redirect(authUrl);
});

// ============================================
// GET /auth/callback — Handle Shopify OAuth Callback
// ============================================
router.get('/auth/callback', async (req, res) => {
  try {
    const { shop, code, state } = req.query;

    // --- Step 1: Validate nonce (CSRF protection) ---
    const nonceData = nonceStore.get(state);
    if (!nonceData) {
      console.error('❌ Invalid or expired nonce');
      return res.redirect('/?error=Invalid+or+expired+state+parameter');
    }

    // Consume the nonce (one-time use)
    const { owner_id, client_id, client_secret } = nonceData;
    nonceStore.delete(state);

    // --- Step 2: Validate shop domain ---
    if (!shop || !isValidShopDomain(shop)) {
      return res.redirect('/?error=Invalid+shop+domain');
    }

    // --- Step 3: Exchange authorization code for permanent access token ---
    console.log(`🔄 Exchanging code for access token: ${shop}`);
    const tokenResponse = await axios.post(
      `https://${shop}/admin/oauth/access_token`,
      {
        client_id,
        client_secret,
        code,
      }
    );

    const { access_token, scope } = tokenResponse.data;

    if (!access_token) {
      throw new Error('Shopify did not return an access_token');
    }

    console.log(`✅ Access token received for: ${shop}`);

    // --- Step 4: Upsert platform record into Supabase ---
    const { data: platform, error: upsertError } = await supabase
      .from('platforms')
      .upsert(
        {
          owner_id,
          shop_domain: shop,
          access_token,
          installed_at: new Date().toISOString(),
          is_active: true,
        },
        {
          onConflict: 'shop_domain',
        }
      )
      .select('id, shop_domain')
      .single();

    if (upsertError) {
      console.error('❌ Failed to save platform:', upsertError.message);
      throw upsertError;
    }

    console.log(`💾 Platform saved: ${platform.shop_domain} (ID: ${platform.id})`);

    // --- Step 5: Trigger initial data sync (async) ---
    syncStoreData(platform.id)
      .then((result) => {
        console.log(`📦 Initial sync completed for ${platform.shop_domain}:`, result);
      })
      .catch((err) => {
        console.error(`❌ Initial sync failed for ${platform.shop_domain}:`, err.message);
      });

    // --- Step 5: Redirect back to dashboard with success ---
    const successHtml = `<!DOCTYPE html>
<html>
<head><title>Connecting...</title></head>
<body style="font-family:sans-serif;background:#0a0a0f;color:white;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
  <div style="text-align:center">
    <div style="font-size:48px;margin-bottom:16px;">✅</div>
    <h2>Store Connected!</h2>
    <p style="color:#8b8b9e;">Syncing your data... This window will close automatically.</p>
  </div>
  <script>
    if (window.opener) {
      window.opener.postMessage({
        type: 'SHOPIFY_CONNECTED',
        success: true,
        shop: '${shop}'
      }, window.location.origin);
    }
    setTimeout(() => window.close(), 1500);
  </script>
</body>
</html>`;
    return res.send(successHtml);

  } catch (err) {
    console.error('❌ OAuth callback error:', err.message);
    const errorHtml = `<!DOCTYPE html>
<html>
<head><title>Error</title></head>
<body style="font-family:sans-serif;background:#0a0a0f;color:white;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
  <div style="text-align:center">
    <div style="font-size:48px;margin-bottom:16px;">❌</div>
    <h2>Connection Failed</h2>
    <p style="color:#f87171;">${err.message}</p>
  </div>
  <script>
    if (window.opener) {
      window.opener.postMessage({
        type: 'SHOPIFY_CONNECTED',
        success: false,
        error: '${err.message.replace(/'/g, "\\'")}'
      }, window.location.origin);
    }
    setTimeout(() => window.close(), 2500);
  </script>
</body>
</html>`;
    return res.send(errorHtml);
  }
});

module.exports = router;
