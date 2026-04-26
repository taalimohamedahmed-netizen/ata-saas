const { supabase } = require('../config/supabase');
const axios = require('axios');

async function buildContext(platformId, question) {
  const lowerQ = (question || '').toLowerCase();

  // Always fetch counts
  const [{ count: productCount }, { count: orderCount }, { count: customerCount }] = await Promise.all([
    supabase.from('products').select('*', { count: 'exact', head: true }).eq('platform_id', platformId),
    supabase.from('orders').select('*', { count: 'exact', head: true }).eq('platform_id', platformId),
    supabase.from('customers').select('*', { count: 'exact', head: true }).eq('platform_id', platformId),
  ]);

  const parts = [`STORE DATABASE SUMMARY:
- Total Products: ${productCount || 0}
- Total Orders: ${orderCount || 0}
- Total Customers: ${customerCount || 0}`];

  const wantsOrders = /order|اوردر|طلب|مبيع|revenue|ايراد|paid|فلوس|كسب/i.test(lowerQ);
  const wantsProducts = /product|منتج|item|بضاعة|stock|inventory/i.test(lowerQ);
  const wantsCustomers = /customer|عميل|زبون|كاستومر|client/i.test(lowerQ);
  const wantsRevenue = /revenue|ايراد|ربح|مبيعات|total|income|money|فلوس/i.test(lowerQ);

  // If no specific keyword — include everything (general question)
  const includeAll = !wantsOrders && !wantsProducts && !wantsCustomers;

  if (wantsOrders || includeAll) {
    const { data: orders } = await supabase
      .from('orders')
      .select('order_number, customer_name, email, total_price, currency, financial_status, fulfillment_status, ordered_at')
      .eq('platform_id', platformId)
      .order('ordered_at', { ascending: false })
      .limit(50);

    if (orders?.length) parts.push(`\nRECENT ORDERS (latest ${orders.length}):\n${JSON.stringify(orders)}`);
  }

  if (wantsRevenue || includeAll) {
    const { data: paidOrders } = await supabase
      .from('orders')
      .select('total_price, currency')
      .eq('platform_id', platformId)
      .eq('financial_status', 'paid');

    if (paidOrders?.length) {
      const total = paidOrders.reduce((s, o) => s + (parseFloat(o.total_price) || 0), 0);
      parts.push(`\nREVENUE:\n- Total paid orders: ${paidOrders.length}\n- Total revenue: ${total.toFixed(2)} ${paidOrders[0]?.currency || ''}`);
    }
  }

  if (wantsProducts || includeAll) {
    const { data: products } = await supabase
      .from('products')
      .select('title, vendor, product_type, status, price, inventory_qty')
      .eq('platform_id', platformId)
      .order('updated_at', { ascending: false })
      .limit(50);

    if (products?.length) parts.push(`\nPRODUCTS (latest ${products.length}):\n${JSON.stringify(products)}`);
  }

  if (wantsCustomers || includeAll) {
    const { data: customers } = await supabase
      .from('customers')
      .select('first_name, last_name, email, orders_count, total_spent')
      .eq('platform_id', platformId)
      .order('total_spent', { ascending: false })
      .limit(50);

    if (customers?.length) parts.push(`\nTOP CUSTOMERS (by spend, top ${customers.length}):\n${JSON.stringify(customers)}`);
  }

  return parts.join('\n\n');
}

async function chat(platformId, history, userMessage) {
  if (!process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY === 'your-openrouter-api-key') {
    throw new Error('OPENROUTER_API_KEY not configured in .env');
  }

  const contextData = await buildContext(platformId, userMessage);

  const systemPrompt = `You are an AI analyst assistant embedded in a Shopify store dashboard. You have real-time access to the store's database.

${contextData}

INSTRUCTIONS:
- Answer questions about the store's data clearly and accurately using the data above
- You can respond in Arabic or English (match the user's language)
- For numbers, always use the exact figures from the data
- If asked to analyze or summarize, provide meaningful insights
- Keep answers concise but complete`;

  const response = await axios.post(
    'https://openrouter.ai/api/v1/chat/completions',
    {
      model: process.env.OPENROUTER_MODEL || 'google/gemini-2.0-flash-001',
      messages: [
        { role: 'system', content: systemPrompt },
        ...history.slice(-10),
        { role: 'user', content: userMessage },
      ],
      max_tokens: 1500,
      temperature: 0.5,
    },
    {
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.APP_URL || 'http://localhost:3000',
        'X-Title': 'ATA SaaS Dashboard',
      },
      timeout: 30000,
    }
  );

  return response.data.choices[0].message.content;
}

module.exports = { chat };
