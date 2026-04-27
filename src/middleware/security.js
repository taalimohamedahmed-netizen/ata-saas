/**
 * Security Middleware
 * - HMAC signature validation for Shopify callbacks
 * - Platform ownership verification for API endpoints
 */

const crypto = require('crypto');
const { supabase } = require('../config/supabase');

/**
 * Validates Shopify's HMAC signature on OAuth callbacks.
 * Ensures the request genuinely came from Shopify and wasn't tampered with.
 *
 * @param {Object} query - The full query string parameters from Shopify
 * @returns {boolean} True if the HMAC is valid
 */
function verifyShopifyHmac(query) {
  const { hmac, ...params } = query;

  if (!hmac) return false;

  // Sort parameters alphabetically and build the message string
  const message = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&');

  const generatedHmac = crypto
    .createHmac('sha256', process.env.SHOPIFY_API_SECRET)
    .update(message)
    .digest('hex');

  // Timing-safe comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(generatedHmac, 'hex'),
      Buffer.from(hmac, 'hex')
    );
  } catch {
    return false;
  }
}

/**
 * Validates Shopify shop domain format.
 * Must match: store-name.myshopify.com
 *
 * @param {string} shop - The shop domain to validate
 * @returns {boolean} True if valid format
 */
function isValidShopDomain(shop) {
  const shopRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/;
  return shopRegex.test(shop);
}

/**
 * Express middleware: Verify the requesting user owns the specified platform.
 * Expects `platformId` as a route parameter and `owner_id` in the request
 * (set by your auth middleware, e.g. Supabase Auth JWT verification).
 *
 * Usage: router.post('/api/sync/:platformId', verifyPlatformOwner, handler)
 */
async function verifyPlatformOwner(req, res, next) {
  try {
    const { platformId } = req.params;
    const ownerId = req.ownerId; // Set by upstream auth middleware

    if (!platformId || !ownerId) {
      return res.status(400).json({
        error: 'Missing platformId or authentication',
      });
    }

    const { data: platform, error } = await supabase
      .from('platforms')
      .select('id, owner_id')
      .eq('id', platformId)
      .eq('owner_id', ownerId)
      .single();

    if (error || !platform) {
      return res.status(403).json({
        error: 'Access denied: you do not own this platform',
      });
    }

    // Attach platform to request for downstream use
    req.platform = platform;
    next();
  } catch (err) {
    console.error('❌ Platform ownership check failed:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = {
  verifyShopifyHmac,
  isValidShopDomain,
  verifyPlatformOwner,
};
