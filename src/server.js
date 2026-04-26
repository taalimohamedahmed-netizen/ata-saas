/**
 * ATA Shopify SaaS — Express Server
 * Multi-tenant onboarding & data sync engine
 */

require('dotenv').config();
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const FormData = require('form-data');
const authRoutes = require('./routes/auth');
const settingsRoutes = require('./routes/settings');
const { verifyPlatformOwner } = require('./middleware/security');
const { syncStoreData, syncStoreDataFull } = require('./services/syncService');

// In-memory job store for full sync progress
const syncJobs = new Map();
setInterval(() => {
  const TWO_HOURS = 2 * 60 * 60 * 1000;
  for (const [id, job] of syncJobs.entries()) {
    if (job.status !== 'running' && Date.now() - job.startTime > TWO_HOURS) syncJobs.delete(id);
  }
}, 30 * 60 * 1000);

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// Webhook Routes — MUST be before express.json()
// (needs raw body for Shopify HMAC verification)
// ============================================
const webhookRoutes = require('./routes/webhooks');
app.use('/webhooks', webhookRoutes);

// ============================================
// Middleware
// ============================================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} | ${req.method} ${req.path}`);
  next();
});

// ============================================
// Routes
// ============================================

// Serve static files (Dashboard)
app.use(express.static(path.join(__dirname, 'public')));

// Public config for client-side Supabase Auth
app.get('/api/config', (req, res) => {
  res.json({
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'ATA Shopify SaaS',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Shopify OAuth flow
app.use('/', authRoutes);

// System Settings API
app.use('/api/settings', settingsRoutes);

// ============================================
// Auth Middleware — verifies Supabase JWT
// ============================================
async function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const { supabase } = require('./config/supabase');
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return res.status(401).json({ error: 'Invalid or expired session' });

  req.user = user;
  next();
}

// Get connected stores — filtered by logged-in user
app.get('/api/stores', requireAuth, async (req, res) => {
  try {
    const { supabase } = require('./config/supabase');
    const { data: stores, error } = await supabase
      .from('platforms')
      .select('id, shop_domain, is_active, installed_at, last_synced_at')
      .eq('owner_id', req.user.id)
      .order('installed_at', { ascending: false });

    if (error) throw error;
    res.json({ stores: stores || [] });
  } catch (err) {
    console.error('❌ Failed to fetch stores:', err.message);
    res.json({ stores: [] });
  }
});

// Manual sync trigger — owner only
app.post('/api/sync/:platformId', requireAuth, async (req, res) => {
  try {
    const { supabase } = require('./config/supabase');
    const { platformId } = req.params;

    const { data: platform } = await supabase
      .from('platforms')
      .select('id')
      .eq('id', platformId)
      .eq('owner_id', req.user.id)
      .single();

    if (!platform) return res.status(403).json({ error: 'Access denied' });

    console.log(`🔄 Manual sync triggered for platform: ${platformId}`);
    const result = await syncStoreData(platformId);

    return res.json({
      success: true,
      message: 'Sync completed successfully',
      data: result,
    });
  } catch (err) {
    console.error('❌ Manual sync failed:', err.message);
    return res.status(500).json({
      success: false,
      error: 'Sync failed',
      details: err.message,
    });
  }
});

// Full sync — background job with progress tracking
app.post('/api/sync/:platformId/full', requireAuth, async (req, res) => {
  try {
    const { supabase } = require('./config/supabase');
    const { platformId } = req.params;

    const { data: platform } = await supabase
      .from('platforms').select('id, shop_domain')
      .eq('id', platformId).eq('owner_id', req.user.id).single();

    if (!platform) return res.status(403).json({ error: 'Access denied' });

    const jobId = crypto.randomBytes(8).toString('hex');
    const job = {
      jobId, platformId, shopDomain: platform.shop_domain,
      status: 'running', startTime: Date.now(), endTime: null,
      progress: {
        products:  { action: 'pending', count: 0 },
        orders:    { action: 'pending', count: 0 },
        customers: { action: 'pending', count: 0 },
      },
      result: null, error: null,
    };
    syncJobs.set(jobId, job);

    const forceFullSync = req.body?.forceFullSync === true;

    // Run async — don't await
    syncStoreDataFull(platformId, (update) => {
      const j = syncJobs.get(jobId);
      if (j) j.progress[update.stage] = { action: update.action, count: update.count };
    }, { forceFullSync }).then(result => {
      const j = syncJobs.get(jobId);
      if (j) { j.status = 'done'; j.endTime = Date.now(); j.result = result; }
    }).catch(err => {
      const j = syncJobs.get(jobId);
      if (j) { j.status = 'error'; j.endTime = Date.now(); j.error = err.message; }
    });

    res.json({ jobId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Stats from DB — loads instantly on login without needing a sync
app.get('/api/stores/:platformId/stats', requireAuth, async (req, res) => {
  try {
    const { supabase } = require('./config/supabase');
    const { data: platform } = await supabase
      .from('platforms').select('id').eq('id', req.params.platformId).eq('owner_id', req.user.id).single();
    if (!platform) return res.status(403).json({ error: 'Access denied' });

    const [{ count: products }, { count: orders }, { count: customers }] = await Promise.all([
      supabase.from('products').select('*', { count: 'exact', head: true }).eq('platform_id', req.params.platformId),
      supabase.from('orders').select('*', { count: 'exact', head: true }).eq('platform_id', req.params.platformId),
      supabase.from('customers').select('*', { count: 'exact', head: true }).eq('platform_id', req.params.platformId),
    ]);

    res.json({ products: products || 0, orders: orders || 0, customers: customers || 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Job status — for polling progress
app.get('/api/sync/job/:jobId', requireAuth, (req, res) => {
  const job = syncJobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json({
    status: job.status,
    shopDomain: job.shopDomain,
    elapsed: Math.floor((Date.now() - job.startTime) / 1000),
    progress: job.progress,
    result: job.result,
    error: job.error,
  });
});

// Get products for a store — owner only
app.get('/api/stores/:platformId/products', requireAuth, async (req, res) => {
  try {
    const { supabase } = require('./config/supabase');
    const { data: platform } = await supabase
      .from('platforms').select('id').eq('id', req.params.platformId).eq('owner_id', req.user.id).single();
    if (!platform) return res.status(403).json({ error: 'Access denied' });

    const { data, error } = await supabase
      .from('products')
      .select('shopify_id, title, vendor, product_type, status, price, inventory_qty, image_url')
      .eq('platform_id', req.params.platformId)
      .order('updated_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    res.json({ products: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get orders for a store — owner only
app.get('/api/stores/:platformId/orders', requireAuth, async (req, res) => {
  try {
    const { supabase } = require('./config/supabase');
    const { data: platform } = await supabase
      .from('platforms').select('id').eq('id', req.params.platformId).eq('owner_id', req.user.id).single();
    if (!platform) return res.status(403).json({ error: 'Access denied' });

    const { data, error } = await supabase
      .from('orders')
      .select('shopify_id, order_number, email, customer_name, total_price, currency, financial_status, fulfillment_status, ordered_at')
      .eq('platform_id', req.params.platformId)
      .order('ordered_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    res.json({ orders: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get customers for a store — owner only
app.get('/api/stores/:platformId/customers', requireAuth, async (req, res) => {
  try {
    const { supabase } = require('./config/supabase');
    const { data: platform } = await supabase
      .from('platforms').select('id').eq('id', req.params.platformId).eq('owner_id', req.user.id).single();
    if (!platform) return res.status(403).json({ error: 'Access denied' });

    const { data, error } = await supabase
      .from('customers')
      .select('shopify_id, email, first_name, last_name, phone, orders_count, total_spent')
      .eq('platform_id', req.params.platformId)
      .order('updated_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    res.json({ customers: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// List WhatsApp conversations for a store
app.get('/api/stores/:platformId/conversations', requireAuth, async (req, res) => {
  try {
    const { supabase } = require('./config/supabase');
    const { data: platform } = await supabase
      .from('platforms').select('id').eq('id', req.params.platformId).eq('owner_id', req.user.id).single();
    if (!platform) return res.status(403).json({ error: 'Access denied' });

    const { data, error } = await supabase
      .from('whatsapp_conversations')
      .select('id, customer_phone, customer_name, last_message, last_message_at, created_at')
      .eq('platform_id', req.params.platformId)
      .order('last_message_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    res.json({ conversations: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Messages in a conversation
app.get('/api/conversations/:conversationId/messages', requireAuth, async (req, res) => {
  try {
    const { supabase } = require('./config/supabase');
    const { data: conv } = await supabase
      .from('whatsapp_conversations').select('id, platform_id, ai_enabled')
      .eq('id', req.params.conversationId).maybeSingle();
    if (!conv) return res.status(404).json({ error: 'Conversation not found' });

    const { data: platform } = await supabase
      .from('platforms').select('id').eq('id', conv.platform_id).eq('owner_id', req.user.id).single();
    if (!platform) return res.status(403).json({ error: 'Access denied' });

    const { data, error } = await supabase
      .from('whatsapp_messages')
      .select('id, direction, body, status, created_at')
      .eq('conversation_id', req.params.conversationId)
      .order('created_at', { ascending: true })
      .limit(200);
    if (error) throw error;
    res.json({ messages: data || [], ai_enabled: conv.ai_enabled || false });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Send reply in a conversation
app.post('/api/conversations/:conversationId/reply', requireAuth, async (req, res) => {
  try {
    const { supabase } = require('./config/supabase');
    const { message } = req.body;
    if (!message?.trim()) return res.status(400).json({ error: 'Message is required' });

    const { data: conv } = await supabase
      .from('whatsapp_conversations').select('id, platform_id, customer_phone')
      .eq('id', req.params.conversationId).maybeSingle();
    if (!conv) return res.status(404).json({ error: 'Conversation not found' });

    const { data: platform } = await supabase
      .from('platforms').select('id').eq('id', conv.platform_id).eq('owner_id', req.user.id).single();
    if (!platform) return res.status(403).json({ error: 'Access denied' });

    const { sendReply, saveMessage } = require('./services/whatsappService');
    const waResult = await sendReply(conv.customer_phone, message.trim());
    await saveMessage(supabase, conv.id, 'outbound', message.trim(), waResult?.messages?.[0]?.id);

    res.json({ success: true });
  } catch (err) {
    console.error('❌ Reply error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Toggle AI auto-reply for a conversation
app.patch('/api/conversations/:conversationId/ai', requireAuth, async (req, res) => {
  try {
    const { supabase } = require('./config/supabase');
    const { data: conv } = await supabase
      .from('whatsapp_conversations').select('id, platform_id, ai_enabled')
      .eq('id', req.params.conversationId).maybeSingle();
    if (!conv) return res.status(404).json({ error: 'Not found' });

    const { data: platform } = await supabase
      .from('platforms').select('id').eq('id', conv.platform_id).eq('owner_id', req.user.id).single();
    if (!platform) return res.status(403).json({ error: 'Access denied' });

    const newVal = !conv.ai_enabled;
    await supabase.from('whatsapp_conversations').update({ ai_enabled: newVal }).eq('id', conv.id);
    res.json({ success: true, ai_enabled: newVal });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Media proxy — no auth header needed (browser img/audio tags can't send it)
app.get('/api/media/:mediaId', async (req, res) => {
  try {
    const token = process.env.WHATSAPP_ACCESS_TOKEN;
    if (!token) return res.status(400).end();

    const metaRes = await axios.get(
      `https://graph.facebook.com/v19.0/${req.params.mediaId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const downloadUrl = metaRes.data?.url;
    if (!downloadUrl) return res.status(404).end();

    const fileRes = await axios.get(downloadUrl, {
      headers: { Authorization: `Bearer ${token}` },
      responseType: 'stream',
    });

    res.setHeader('Content-Type', fileRes.headers['content-type'] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    fileRes.data.pipe(res);
  } catch (err) {
    console.error('❌ Media proxy error:', err.message);
    res.status(500).end();
  }
});

// Send media (image/audio/video/document) in a conversation
app.post('/api/conversations/:conversationId/send-media', requireAuth, express.raw({ type: '*/*', limit: '25mb' }), async (req, res) => {
  try {
    const { supabase } = require('./config/supabase');
    const mimeType = req.headers['content-type'];
    const filename = req.headers['x-filename'] || 'file';

    const { data: conv } = await supabase
      .from('whatsapp_conversations').select('id, platform_id, customer_phone')
      .eq('id', req.params.conversationId).maybeSingle();
    if (!conv) return res.status(404).json({ error: 'Conversation not found' });

    const { data: platform } = await supabase
      .from('platforms').select('id').eq('id', conv.platform_id).eq('owner_id', req.user.id).single();
    if (!platform) return res.status(403).json({ error: 'Access denied' });

    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const token = process.env.WHATSAPP_ACCESS_TOKEN;

    // Upload media to Meta using multipart/form-data (required by Meta API)
    const form = new FormData();
    form.append('file', req.body, { filename, contentType: mimeType });
    form.append('type', mimeType);
    form.append('messaging_product', 'whatsapp');

    const uploadRes = await axios.post(
      `https://graph.facebook.com/v19.0/${phoneNumberId}/media`,
      form,
      { headers: { Authorization: `Bearer ${token}`, ...form.getHeaders() } }
    );
    const mediaId = uploadRes.data?.id;
    if (!mediaId) throw new Error('Upload failed — no media ID returned');

    // Determine WhatsApp media type
    const waType = mimeType.startsWith('image/') ? 'image'
      : mimeType.startsWith('audio/') ? 'audio'
      : mimeType.startsWith('video/') ? 'video'
      : 'document';

    // Send the message
    const msgPayload = {
      messaging_product: 'whatsapp',
      to: conv.customer_phone,
      type: waType,
      [waType]: waType === 'document' ? { id: mediaId, filename } : { id: mediaId },
    };

    const sendRes = await axios.post(
      `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`,
      msgPayload,
      { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
    );
    const waMessageId = sendRes.data?.messages?.[0]?.id;

    const { saveMessage } = require('./services/whatsappService');
    const bodyText = `[media:${waType}:${mediaId}]`;
    await saveMessage(supabase, conv.id, 'outbound', bodyText, waMessageId);

    res.json({ success: true, mediaId, waType });
  } catch (err) {
    console.error('❌ Send media error:', err.response?.data || err.message);
    res.status(500).json({ error: err.response?.data?.error?.message || err.message });
  }
});

// AI Chat endpoint
app.post('/api/chat', requireAuth, async (req, res) => {
  try {
    const { message, history, platformId } = req.body;
    if (!message?.trim()) return res.status(400).json({ error: 'Message is required' });

    if (platformId) {
      const { supabase } = require('./config/supabase');
      const { data: platform } = await supabase
        .from('platforms').select('id').eq('id', platformId).eq('owner_id', req.user.id).single();
      if (!platform) return res.status(403).json({ error: 'Access denied' });
    }

    const { chat } = require('./services/aiService');
    const reply = await chat(platformId, history || [], message);
    res.json({ reply });
  } catch (err) {
    console.error('❌ Chat error:', err.response?.data || err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// Error Handling
// ============================================

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} does not exist`,
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('💥 Unhandled error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong',
  });
});

// ============================================
// Start Server
// ============================================
app.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════════╗
  ║   🚀 ATA Shopify SaaS Server Running    ║
  ║──────────────────────────────────────────║
  ║   Port:    ${String(PORT).padEnd(29)}║
  ║   Env:     ${String(process.env.NODE_ENV || 'development').padEnd(29)}║
  ║   Health:  http://localhost:${PORT}/health${' '.repeat(Math.max(0, 9 - String(PORT).length))}║
  ╚══════════════════════════════════════════╝
  `);
});

module.exports = app;
