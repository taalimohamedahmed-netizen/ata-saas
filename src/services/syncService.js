const { supabase } = require('../config/supabase');
const { fetchProducts, fetchOrders, fetchCustomers, fetchAllProducts, fetchAllOrders, fetchAllCustomers } = require('./shopifyApi');

async function syncStoreData(platformId) {
  console.log(`\n🔄 Starting sync for platform: ${platformId}`);
  const startTime = Date.now();

  const { data: platform, error: platformError } = await supabase
    .from('platforms')
    .select('id, shop_domain, access_token, owner_id')
    .eq('id', platformId)
    .eq('is_active', true)
    .single();

  if (platformError || !platform) {
    throw new Error(`Platform not found or inactive: ${platformId}`);
  }

  const { shop_domain, access_token } = platform;
  console.log(`📡 Syncing store: ${shop_domain}`);

  const [products, orders, customers] = await Promise.all([
    fetchProducts(shop_domain, access_token, 50),
    fetchOrders(shop_domain, access_token, 50),
    fetchCustomers(shop_domain, access_token, 50),
  ]);

  const [productCount, orderCount, customerCount] = await Promise.all([
    upsertProducts(platformId, products),
    upsertOrders(platformId, orders),
    upsertCustomers(platformId, customers),
  ]);

  await supabase
    .from('platforms')
    .update({ last_synced_at: new Date().toISOString() })
    .eq('id', platformId);

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  const summary = {
    platform_id: platformId,
    shop_domain,
    products: productCount,
    orders: orderCount,
    customers: customerCount,
    duration_seconds: parseFloat(duration),
  };

  console.log(`✅ Sync completed in ${duration}s:`, summary);
  return summary;
}

async function upsertProducts(platformId, shopifyProducts) {
  if (!shopifyProducts.length) return 0;

  const rows = shopifyProducts.map((p) => ({
    platform_id: platformId,
    shopify_id: p.id,
    title: p.title,
    vendor: p.vendor,
    product_type: p.product_type,
    status: p.status,
    price: parseFloat(p.variants?.[0]?.price) || 0,
    inventory_qty: p.variants?.reduce((sum, v) => sum + (v.inventory_quantity || 0), 0) || 0,
    image_url: p.images?.[0]?.src || null,
    shopify_data: p,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from('products')
    .upsert(rows, { onConflict: 'platform_id,shopify_id' });

  if (error) {
    console.error('❌ Products upsert error:', error.message);
    throw error;
  }

  console.log(`  ✅ Upserted ${rows.length} products`);
  return rows.length;
}

async function upsertOrders(platformId, shopifyOrders) {
  if (!shopifyOrders.length) return 0;

  const rows = shopifyOrders.map((o) => ({
    platform_id: platformId,
    shopify_id: o.id,
    order_number: String(o.order_number),
    email: o.email,
    total_price: parseFloat(o.total_price) || 0,
    currency: o.currency,
    financial_status: o.financial_status,
    fulfillment_status: o.fulfillment_status,
    customer_name: o.customer
      ? `${o.customer.first_name || ''} ${o.customer.last_name || ''}`.trim()
      : null,
    shopify_data: o,
    ordered_at: o.created_at,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from('orders')
    .upsert(rows, { onConflict: 'platform_id,shopify_id' });

  if (error) {
    console.error('❌ Orders upsert error:', error.message);
    throw error;
  }

  console.log(`  ✅ Upserted ${rows.length} orders`);
  return rows.length;
}

async function upsertCustomers(platformId, shopifyCustomers) {
  if (!shopifyCustomers.length) return 0;

  const rows = shopifyCustomers.map((c) => ({
    platform_id: platformId,
    shopify_id: c.id,
    email: c.email,
    first_name: c.first_name,
    last_name: c.last_name,
    phone: c.phone,
    orders_count: c.orders_count || 0,
    total_spent: parseFloat(c.total_spent) || 0,
    shopify_data: c,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from('customers')
    .upsert(rows, { onConflict: 'platform_id,shopify_id' });

  if (error) {
    console.error('❌ Customers upsert error:', error.message);
    throw error;
  }

  console.log(`  ✅ Upserted ${rows.length} customers`);
  return rows.length;
}

// ============================================
// Full Sync — all pages, with progress callbacks
// ============================================

async function syncStoreDataFull(platformId, onProgress, { forceFullSync = false } = {}) {
  const startTime = Date.now();

  const { data: platform, error: platformError } = await supabase
    .from('platforms')
    .select('id, shop_domain, access_token, last_synced_at')
    .eq('id', platformId)
    .eq('is_active', true)
    .single();

  if (platformError || !platform) {
    throw new Error(`Platform not found or inactive: ${platformId}`);
  }

  const { shop_domain, access_token, last_synced_at } = platform;

  // Incremental: fetch only records updated since last sync (unless forced full)
  const updatedAtMin = (!forceFullSync && last_synced_at) ? last_synced_at : null;
  const syncMode = updatedAtMin ? 'incremental' : 'full';
  console.log(`\n🔄 Starting ${syncMode} sync for: ${shop_domain}${updatedAtMin ? ` (since ${updatedAtMin})` : ''}`);

  // Products
  onProgress({ stage: 'products', action: 'fetching', count: 0 });
  const products = await fetchAllProducts(shop_domain, access_token, (count) => {
    onProgress({ stage: 'products', action: 'fetching', count });
  }, updatedAtMin);
  onProgress({ stage: 'products', action: 'saving', count: products.length });
  const productCount = await upsertBatched('products', platformId, products, mapProduct);
  onProgress({ stage: 'products', action: 'done', count: productCount });

  // Orders
  onProgress({ stage: 'orders', action: 'fetching', count: 0 });
  const orders = await fetchAllOrders(shop_domain, access_token, (count) => {
    onProgress({ stage: 'orders', action: 'fetching', count });
  }, updatedAtMin);
  onProgress({ stage: 'orders', action: 'saving', count: orders.length });
  const orderCount = await upsertBatched('orders', platformId, orders, mapOrder);
  onProgress({ stage: 'orders', action: 'done', count: orderCount });

  // Customers
  onProgress({ stage: 'customers', action: 'fetching', count: 0 });
  const customers = await fetchAllCustomers(shop_domain, access_token, (count) => {
    onProgress({ stage: 'customers', action: 'fetching', count });
  }, updatedAtMin);
  onProgress({ stage: 'customers', action: 'saving', count: customers.length });
  const customerCount = await upsertBatched('customers', platformId, customers, mapCustomer);
  onProgress({ stage: 'customers', action: 'done', count: customerCount });

  await supabase
    .from('platforms')
    .update({ last_synced_at: new Date().toISOString() })
    .eq('id', platformId);

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  const summary = { platform_id: platformId, shop_domain, products: productCount, orders: orderCount, customers: customerCount, duration_seconds: parseFloat(duration) };
  console.log(`✅ Full sync completed in ${duration}s:`, summary);
  return summary;
}

// Batch upsert to handle large datasets (Supabase has row limits per request)
async function upsertBatched(table, platformId, items, mapFn) {
  if (!items.length) return 0;
  const BATCH = 500;
  const rows = items.map(item => mapFn(platformId, item));
  const conflictTarget = table === 'products' || table === 'orders' || table === 'customers'
    ? 'platform_id,shopify_id'
    : 'platform_id,shopify_id';

  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await supabase.from(table).upsert(rows.slice(i, i + BATCH), { onConflict: conflictTarget });
    if (error) { console.error(`❌ Batch upsert error (${table}):`, error.message); throw error; }
  }
  console.log(`  ✅ Upserted ${rows.length} ${table}`);
  return rows.length;
}

function mapProduct(platformId, p) {
  return {
    platform_id: platformId,
    shopify_id: p.id,
    title: p.title,
    vendor: p.vendor,
    product_type: p.product_type,
    status: p.status,
    price: parseFloat(p.variants?.[0]?.price) || 0,
    inventory_qty: p.variants?.reduce((sum, v) => sum + (v.inventory_quantity || 0), 0) || 0,
    image_url: p.images?.[0]?.src || null,
    shopify_data: p,
    updated_at: new Date().toISOString(),
  };
}

function mapOrder(platformId, o) {
  return {
    platform_id: platformId,
    shopify_id: o.id,
    order_number: String(o.order_number),
    email: o.email,
    total_price: parseFloat(o.total_price) || 0,
    currency: o.currency,
    financial_status: o.financial_status,
    fulfillment_status: o.fulfillment_status,
    customer_name: o.customer ? `${o.customer.first_name || ''} ${o.customer.last_name || ''}`.trim() : null,
    shopify_data: o,
    ordered_at: o.created_at,
    updated_at: new Date().toISOString(),
  };
}

function mapCustomer(platformId, c) {
  return {
    platform_id: platformId,
    shopify_id: c.id,
    email: c.email,
    first_name: c.first_name,
    last_name: c.last_name,
    phone: c.phone,
    orders_count: c.orders_count || 0,
    total_spent: parseFloat(c.total_spent) || 0,
    shopify_data: c,
    updated_at: new Date().toISOString(),
  };
}

module.exports = { syncStoreData, syncStoreDataFull };
