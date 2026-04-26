/**
 * Shopify API Service
 * Helper functions to fetch data from the Shopify REST Admin API.
 * All requests use the store's permanent access token.
 */

const axios = require('axios');

const API_VERSION = process.env.SHOPIFY_API_VERSION || '2024-01';

/**
 * Creates a configured axios instance for a specific Shopify store.
 *
 * @param {string} shopDomain - e.g. "mystore.myshopify.com"
 * @param {string} accessToken - Shopify permanent access token
 * @returns {import('axios').AxiosInstance}
 */
function createShopifyClient(shopDomain, accessToken) {
  return axios.create({
    baseURL: `https://${shopDomain}/admin/api/${API_VERSION}`,
    headers: {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json',
    },
    timeout: 30000, // 30 second timeout
  });
}

/**
 * Fetch the latest products from Shopify.
 *
 * @param {string} shopDomain
 * @param {string} accessToken
 * @param {number} limit - Number of products to fetch (max 250)
 * @returns {Promise<Array>} Array of Shopify product objects
 */
async function fetchProducts(shopDomain, accessToken, limit = 50) {
  try {
    const client = createShopifyClient(shopDomain, accessToken);
    const response = await client.get('/products.json', {
      params: {
        limit,
        order: 'updated_at desc',
      },
    });
    console.log(`📦 Fetched ${response.data.products.length} products from ${shopDomain}`);
    return response.data.products;
  } catch (err) {
    console.error(`❌ Failed to fetch products from ${shopDomain}:`, err.message);
    throw err;
  }
}

/**
 * Fetch the latest orders from Shopify.
 *
 * @param {string} shopDomain
 * @param {string} accessToken
 * @param {number} limit - Number of orders to fetch (max 250)
 * @returns {Promise<Array>} Array of Shopify order objects
 */
async function fetchOrders(shopDomain, accessToken, limit = 50) {
  try {
    const client = createShopifyClient(shopDomain, accessToken);
    const response = await client.get('/orders.json', {
      params: {
        limit,
        status: 'any', // Include open, closed, cancelled
        order: 'created_at desc',
      },
    });
    console.log(`🛒 Fetched ${response.data.orders.length} orders from ${shopDomain}`);
    return response.data.orders;
  } catch (err) {
    console.error(`❌ Failed to fetch orders from ${shopDomain}:`, err.message);
    throw err;
  }
}

/**
 * Fetch the latest customers from Shopify.
 *
 * @param {string} shopDomain
 * @param {string} accessToken
 * @param {number} limit - Number of customers to fetch (max 250)
 * @returns {Promise<Array>} Array of Shopify customer objects
 */
async function fetchCustomers(shopDomain, accessToken, limit = 50) {
  try {
    const client = createShopifyClient(shopDomain, accessToken);
    const response = await client.get('/customers.json', {
      params: {
        limit,
        order: 'updated_at desc',
      },
    });
    console.log(`👥 Fetched ${response.data.customers.length} customers from ${shopDomain}`);
    return response.data.customers;
  } catch (err) {
    console.error(`❌ Failed to fetch customers from ${shopDomain}:`, err.message);
    throw err;
  }
}

// ============================================
// Full Pagination — fetches ALL pages
// ============================================

function extractPageInfo(linkHeader) {
  if (!linkHeader) return null;
  const match = linkHeader.match(/<[^>]*[?&]page_info=([^&>]+)[^>]*>;\s*rel="next"/);
  return match ? match[1] : null;
}

async function fetchAllPages(shopDomain, accessToken, endpoint, dataKey, extraParams, onProgress) {
  const client = createShopifyClient(shopDomain, accessToken);
  let allItems = [];
  let params = { limit: 250, ...extraParams };

  while (true) {
    const response = await client.get(`${endpoint}.json`, { params });
    const items = response.data[dataKey];
    if (!items || items.length === 0) break;

    allItems = allItems.concat(items);
    if (onProgress) onProgress(allItems.length);

    const pageInfo = extractPageInfo(response.headers['link']);
    if (!pageInfo) break;

    params = { limit: 250, page_info: pageInfo };
    await new Promise(r => setTimeout(r, 600)); // Respect Shopify rate limits (2 req/s)
  }

  return allItems;
}

async function fetchAllProducts(shopDomain, accessToken, onProgress, updatedAtMin = null) {
  const extra = updatedAtMin ? { updated_at_min: updatedAtMin } : {};
  console.log(`📦 Fetching products from ${shopDomain}${updatedAtMin ? ` (since ${updatedAtMin})` : ' (full)'}...`);
  return fetchAllPages(shopDomain, accessToken, '/products', 'products', extra, onProgress);
}

async function fetchAllOrders(shopDomain, accessToken, onProgress, updatedAtMin = null) {
  const extra = { status: 'any', ...(updatedAtMin ? { updated_at_min: updatedAtMin } : {}) };
  console.log(`🛒 Fetching orders from ${shopDomain}${updatedAtMin ? ` (since ${updatedAtMin})` : ' (full)'}...`);
  return fetchAllPages(shopDomain, accessToken, '/orders', 'orders', extra, onProgress);
}

async function fetchAllCustomers(shopDomain, accessToken, onProgress, updatedAtMin = null) {
  const extra = updatedAtMin ? { updated_at_min: updatedAtMin } : {};
  console.log(`👥 Fetching customers from ${shopDomain}${updatedAtMin ? ` (since ${updatedAtMin})` : ' (full)'}...`);
  return fetchAllPages(shopDomain, accessToken, '/customers', 'customers', extra, onProgress);
}

module.exports = {
  fetchProducts,
  fetchOrders,
  fetchCustomers,
  fetchAllProducts,
  fetchAllOrders,
  fetchAllCustomers,
};
