/**
 * Webhook Routes
 * POST /webhooks/shopify/orders/create — new Shopify order → automation trigger
 * GET  /webhooks/whatsapp              — Meta webhook verification
 * POST /webhooks/whatsapp              — incoming WhatsApp messages + state machine
 *
 * Automation States:
 *   idle → new_order → awaiting_confirmation → awaiting_payment_method
 *   → awaiting_payment_screenshot → completed | manual_review | cancelled
 */

const express = require('express');
const crypto  = require('crypto');
const { supabase } = require('../config/supabase');
const {
  sendOrderConfirmation, sendText, extractAmountFromImage,
  upsertConversation, saveMessage, formatPhone,
} = require('../services/whatsappService');

const router = express.Router();

// ─── helpers ───────────────────────────────────────────────
async function setConvState(convId, state, contextPatch = {}) {
  const { data: current } = await supabase
    .from('whatsapp_conversations')
    .select('context')
    .eq('id', convId)
    .single();

  const merged = { ...(current?.context || {}), ...contextPatch };

  await supabase
    .from('whatsapp_conversations')
    .update({ state, context: merged })
    .eq('id', convId);
}

async function botReply(supabase, conv, text) {
  await sendText(conv.customer_phone, text);
  await saveMessage(supabase, conv.id, 'outbound', text, null);
}

// ─── STATE MACHINE ──────────────────────────────────────────
async function processAutomation(conv, message) {
  const state   = conv.state   || 'idle';
  const context = conv.context || {};
  const msgType = message.type;
  const raw     = (message.text?.body || '').trim();
  const txt     = raw.toLowerCase();

  const reply = (text) => botReply(supabase, conv, text);

  // ── new_order ── customer replied for the first time ──────
  if (state === 'new_order') {
    const { order_number, order_price, currency, customer_name } = context;
    await reply(
      `مرحباً ${customer_name}! 👋\n\n` +
      `طلبك رقم *#${order_number}* بقيمة *${order_price} ${currency}* وصلنا ✅\n\n` +
      `رد بـ *1* لتأكيد الطلب ✅\n` +
      `رد بـ *2* لإلغاء الطلب ❌`
    );
    await setConvState(conv.id, 'awaiting_confirmation');
    return;
  }

  // ── awaiting_confirmation ──────────────────────────────────
  if (state === 'awaiting_confirmation') {
    const yes = ['1','yes','نعم','تأكيد','اكيد','confirm','ok','okay','موافق','تمام'].some(k => txt.includes(k));
    const no  = ['2','no','لا','الغاء','cancel','إلغاء','بلاش'].some(k => txt.includes(k));

    if (yes) {
      await reply(
        `ممتاز! 🎉 اختر طريقة الدفع:\n\n` +
        `*1️⃣ Instapay*\n` +
        `*2️⃣ Vodafone Cash*\n` +
        `*3️⃣ كاش عند الاستلام (COD)*\n\n` +
        `رد برقم اختيارك`
      );
      await setConvState(conv.id, 'awaiting_payment_method');

    } else if (no) {
      await reply('تم إلغاء طلبك. شكراً لتواصلك معنا 🙏\nلو احتجت أي حاجة تاني كلمنا.');
      await setConvState(conv.id, 'cancelled');

    } else {
      await reply('من فضلك رد بـ *1* لتأكيد الطلب أو *2* لإلغائه');
    }
    return;
  }

  // ── awaiting_payment_method ────────────────────────────────
  if (state === 'awaiting_payment_method') {
    const isInstapay  = txt.includes('1') || txt.includes('instapay');
    const isVodafone  = txt.includes('2') || txt.includes('vodafone') || txt.includes('vf') || txt.includes('فودافون');
    const isCOD       = txt.includes('3') || txt.includes('cod') || txt.includes('كاش') || txt.includes('استلام');

    const { order_price, currency } = context;

    if (isInstapay && !isVodafone) {
      const account = process.env.INSTAPAY_ACCOUNT || 'your-instapay@instapay';
      await reply(
        `💳 *Instapay*\n\n` +
        `برجاء تحويل مبلغ *${order_price} ${currency}* على:\n\n` +
        `📱 ${account}\n\n` +
        `بعد التحويل ابعتلنا screenshot للتأكيد 📸`
      );
      await setConvState(conv.id, 'awaiting_payment_screenshot', { payment_method: 'instapay' });

    } else if (isVodafone) {
      const account = process.env.VODAFONE_CASH_ACCOUNT || '01XXXXXXXXX';
      await reply(
        `💳 *Vodafone Cash*\n\n` +
        `برجاء تحويل مبلغ *${order_price} ${currency}* على:\n\n` +
        `📱 ${account}\n\n` +
        `بعد التحويل ابعتلنا screenshot للتأكيد 📸`
      );
      await setConvState(conv.id, 'awaiting_payment_screenshot', { payment_method: 'vodafone' });

    } else if (isCOD) {
      await reply(
        `✅ تمام!\n\n` +
        `طلبك *#${context.order_number}* مؤكد والدفع سيكون عند الاستلام.\n\n` +
        `شكراً لثقتك بينا 🙏`
      );
      await setConvState(conv.id, 'completed', { payment_method: 'cod' });

    } else {
      await reply('من فضلك اختر:\n*1* — Instapay\n*2* — Vodafone Cash\n*3* — كاش عند الاستلام');
    }
    return;
  }

  // ── awaiting_payment_screenshot ────────────────────────────
  if (state === 'awaiting_payment_screenshot') {
    if (msgType !== 'image' || !message.image?.id) {
      await reply('من فضلك ابعت screenshot لإتمام التحقق 📸');
      return;
    }

    await reply('جاري مراجعة الدفع... ⏳');

    try {
      const extracted     = await extractAmountFromImage(message.image.id);
      const expected      = parseFloat(context.order_price);
      const tolerance     = expected * 0.01; // 1% tolerance
      const isMatch       = extracted !== null && Math.abs(extracted - expected) <= Math.max(tolerance, 1);

      console.log(`💳 OCR: extracted=${extracted} expected=${expected} match=${isMatch}`);

      if (isMatch) {
        await reply(
          `✅ *تم التحقق من الدفع بنجاح!*\n\n` +
          `طلبك *#${context.order_number}* مؤكد ومدفوع.\n` +
          `سيتم الشحن خلال 2-5 أيام عمل.\n\n` +
          `شكراً لثقتك بينا 🙏`
        );
        await setConvState(conv.id, 'completed', { extracted_amount: extracted });
      } else {
        await reply('شكراً، من فضلك انتظر 5 دقائق للمراجعة ⏱️');
        await setConvState(conv.id, 'manual_review', { extracted_amount: extracted, expected_amount: expected });
        console.warn(`⚠️  Manual review needed — extracted: ${extracted}, expected: ${expected}`);
      }
    } catch (err) {
      console.error('❌ OCR error:', err.message);
      await reply('شكراً، من فضلك انتظر 5 دقائق للمراجعة ⏱️');
      await setConvState(conv.id, 'manual_review', {});
    }
    return;
  }

  // ── completed / cancelled — allow reopening ────────────────
  if (state === 'completed' || state === 'cancelled' || state === 'manual_review') {
    // Don't auto-reply — agent can handle from inbox
    return;
  }
}

// ═══════════════════════════════════════════════════════════
// POST /webhooks/shopify/orders/create
// ═══════════════════════════════════════════════════════════
router.post(
  '/shopify/orders/create',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const hmacHeader = req.headers['x-shopify-hmac-sha256'];
    const secret     = process.env.SHOPIFY_API_SECRET;

    if (!hmacHeader || !secret) {
      console.warn('⚠️  Webhook: missing HMAC or secret');
      return res.status(401).send('Unauthorized');
    }

    const expectedHmac = crypto
      .createHmac('sha256', secret)
      .update(req.body)
      .digest('base64');

    if (expectedHmac !== hmacHeader) {
      console.error('❌ Webhook: invalid HMAC signature');
      return res.status(401).send('Unauthorized');
    }

    res.status(200).send('OK');

    try {
      const order      = JSON.parse(req.body.toString());
      const shopDomain = req.headers['x-shopify-shop-domain'];

      console.log(`\n📦 New order webhook: #${order.order_number} from ${shopDomain}`);

      const { data: platform } = await supabase
        .from('platforms')
        .select('id, shop_domain, owner_id')
        .eq('shop_domain', shopDomain)
        .eq('is_active', true)
        .single();

      if (!platform) {
        console.warn(`⚠️  No active platform found for: ${shopDomain}`);
        return;
      }

      // Save order to DB
      await supabase.from('orders').upsert(
        {
          platform_id:        platform.id,
          shopify_id:         order.id,
          order_number:       String(order.order_number),
          email:              order.email,
          total_price:        parseFloat(order.total_price) || 0,
          currency:           order.currency,
          financial_status:   order.financial_status,
          fulfillment_status: order.fulfillment_status,
          customer_name:      order.customer
            ? `${order.customer.first_name || ''} ${order.customer.last_name || ''}`.trim()
            : null,
          shopify_data:       order,
          ordered_at:         order.created_at,
          updated_at:         new Date().toISOString(),
        },
        { onConflict: 'platform_id,shopify_id' }
      );

      const phone = (
        order.billing_address?.phone  ||
        order.shipping_address?.phone ||
        order.customer?.phone         ||
        order.phone
      );

      if (!phone) {
        console.log(`⚠️  No phone on order #${order.order_number} — skipping WhatsApp`);
        return;
      }

      const customerName = order.customer
        ? `${order.customer.first_name || ''} ${order.customer.last_name || ''}`.trim()
        : 'Customer';

      const cleanPhone = formatPhone(phone);
      if (!cleanPhone) return;

      // Build automation context
      const orderContext = {
        order_id:      String(order.id),
        order_number:  String(order.order_number),
        order_price:   order.total_price,
        currency:      order.currency,
        customer_name: customerName || 'Customer',
      };

      // Upsert conversation & set state = new_order
      const convId = await upsertConversation(supabase, platform.id, cleanPhone, customerName || null);
      await supabase
        .from('whatsapp_conversations')
        .update({ state: 'new_order', context: orderContext })
        .eq('id', convId);

      // Send template (opens the WhatsApp conversation window)
      const templateName = process.env.WHATSAPP_TEMPLATE_NAME || 'hello_world';
      const templateLang = process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'en_US';
      await sendOrderConfirmation(phone, {
        customerName: customerName || 'Customer',
        orderNumber:  order.order_number,
        totalPrice:   order.total_price,
        currency:     order.currency,
      });

      const notifyMsg = `🔔 طلب جديد #${order.order_number} — ${order.total_price} ${order.currency} (${customerName}) — تم إرسال template`;
      await saveMessage(supabase, convId, 'outbound', notifyMsg);

      console.log(`✅ Order automation started for #${order.order_number} → ${cleanPhone}`);
    } catch (err) {
      console.error('❌ Shopify webhook error:', err.message);
    }
  }
);

// ═══════════════════════════════════════════════════════════
// GET /webhooks/whatsapp — Meta verification
// ═══════════════════════════════════════════════════════════
router.get('/whatsapp', (req, res) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    console.log('✅ WhatsApp webhook verified');
    return res.status(200).send(challenge);
  }
  res.status(403).send('Forbidden');
});

// ═══════════════════════════════════════════════════════════
// POST /webhooks/whatsapp — incoming messages + automation
// ═══════════════════════════════════════════════════════════
router.post('/whatsapp', express.json(), async (req, res) => {
  res.status(200).send('OK'); // Always respond fast to Meta

  try {
    const entry  = req.body?.entry?.[0];
    const change = entry?.changes?.[0]?.value;
    if (!change?.messages?.length) return;

    const message       = change.messages[0];
    const customerPhone = message.from;
    const customerName  = change.contacts?.[0]?.profile?.name || customerPhone;
    const waMessageId   = message.id;

    // Build message body — embed media ID for UI rendering
    let body;
    const type = message.type;
    if (type === 'text') {
      body = message.text?.body || '';
    } else if (type === 'image' && message.image?.id) {
      body = `[media:image:${message.image.id}]${message.image.caption ? ' ' + message.image.caption : ''}`;
    } else if (type === 'audio' && message.audio?.id) {
      body = `[media:audio:${message.audio.id}]`;
    } else if (type === 'video' && message.video?.id) {
      body = `[media:video:${message.video.id}]${message.video.caption ? ' ' + message.video.caption : ''}`;
    } else if (type === 'document' && message.document?.id) {
      body = `[media:document:${message.document.id}:${message.document.filename || 'document'}]`;
    } else if (type === 'sticker' && message.sticker?.id) {
      body = `[media:image:${message.sticker.id}]`;
    } else {
      body = `[${type}]`;
    }

    // Find or create conversation (with state + context)
    let { data: conv } = await supabase
      .from('whatsapp_conversations')
      .select('id, state, context')
      .eq('customer_phone', customerPhone)
      .order('last_message_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!conv) {
      const { data: platform } = await supabase
        .from('platforms').select('id').eq('is_active', true).limit(1).maybeSingle();

      if (!platform) {
        console.log(`⚠️  Incoming from ${customerPhone} — no active platform`);
        return;
      }

      const { data: newConv } = await supabase
        .from('whatsapp_conversations')
        .upsert(
          { platform_id: platform.id, customer_phone: customerPhone, customer_name: customerName,
            last_message: body, last_message_at: new Date().toISOString(), state: 'idle', context: {} },
          { onConflict: 'platform_id,customer_phone' }
        )
        .select('id, state, context')
        .single();

      conv = newConv;
    }

    if (!conv) {
      console.log(`⚠️  Could not find or create conversation for ${customerPhone}`);
      return;
    }

    // Save inbound message
    await saveMessage(supabase, conv.id, 'inbound', body, waMessageId);
    console.log(`📨 Incoming from ${customerName} (${customerPhone}) [${conv.state}]: ${body.slice(0, 60)}`);

    // Run automation state machine (non-blocking — errors logged, not thrown)
    try {
      await processAutomation(conv, message);
    } catch (automationErr) {
      console.error('❌ Automation error:', automationErr.message);
    }

  } catch (err) {
    console.error('❌ WhatsApp incoming error:', err.message);
  }
});

module.exports = router;
