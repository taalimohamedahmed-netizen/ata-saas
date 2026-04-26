const axios = require('axios');

async function sendText(customerPhone, text) {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token         = process.env.WHATSAPP_ACCESS_TOKEN;
  const phone         = formatPhone(customerPhone);
  if (!phone || !phoneNumberId || !token) throw new Error('WhatsApp not configured');

  const res = await axios.post(
    `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`,
    { messaging_product: 'whatsapp', to: phone, type: 'text', text: { body: text } },
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, timeout: 10000 }
  );
  return res.data;
}

async function extractAmountFromImage(mediaId) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;

  // Step 1: Get Meta download URL
  const metaRes = await axios.get(
    `https://graph.facebook.com/v19.0/${mediaId}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const downloadUrl = metaRes.data?.url;
  if (!downloadUrl) throw new Error('Could not get media URL');

  // Step 2: Download image as base64
  const imgRes = await axios.get(downloadUrl, {
    headers: { Authorization: `Bearer ${token}` },
    responseType: 'arraybuffer',
  });
  const base64    = Buffer.from(imgRes.data).toString('base64');
  const mimeType  = imgRes.headers['content-type'] || 'image/jpeg';

  // Step 3: Send to Gemini vision via OpenRouter for OCR
  const aiRes = await axios.post(
    'https://openrouter.ai/api/v1/chat/completions',
    {
      model: process.env.OPENROUTER_MODEL || 'google/gemini-2.0-flash-001',
      messages: [{
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'This is a payment screenshot (Instapay or Vodafone Cash). Extract the transaction amount as a plain number only — digits and decimal point, no currency symbol, no commas, no spaces. Example: 150.00\nIf no amount found reply exactly: NOT_FOUND',
          },
          { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } },
        ],
      }],
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    }
  );

  const raw    = aiRes.data?.choices?.[0]?.message?.content?.trim() || '';
  const amount = parseFloat(raw.replace(/[^0-9.]/g, ''));
  return isNaN(amount) ? null : amount;
}

function formatPhone(phone) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 10 ? digits : null;
}

async function sendOrderConfirmation(customerPhone, order) {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token        = process.env.WHATSAPP_ACCESS_TOKEN;
  const templateName = process.env.WHATSAPP_TEMPLATE_NAME || 'order_confirmation';
  const templateLang = process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'ar';

  if (!phoneNumberId || !token) {
    throw new Error('WhatsApp not configured — set WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN in .env');
  }

  const phone = formatPhone(customerPhone);
  if (!phone) throw new Error(`Invalid phone number: ${customerPhone}`);

  const response = await axios.post(
    `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`,
    {
      messaging_product: 'whatsapp',
      to: phone,
      type: 'template',
      template: {
        name: templateName,
        language: { code: templateLang },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: order.customerName },
              { type: 'text', text: String(order.orderNumber) },
              { type: 'text', text: `${order.totalPrice} ${order.currency}` },
            ],
          },
        ],
      },
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    }
  );

  return response.data;
}

async function sendReply(customerPhone, messageBody) {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token        = process.env.WHATSAPP_ACCESS_TOKEN;

  if (!phoneNumberId || !token) throw new Error('WhatsApp not configured');

  const phone = formatPhone(customerPhone);
  if (!phone) throw new Error(`Invalid phone: ${customerPhone}`);

  const response = await axios.post(
    `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`,
    {
      messaging_product: 'whatsapp',
      to: phone,
      type: 'text',
      text: { body: messageBody },
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    }
  );

  return response.data;
}

async function upsertConversation(supabase, platformId, customerPhone, customerName) {
  const { data: existing } = await supabase
    .from('whatsapp_conversations')
    .select('id')
    .eq('platform_id', platformId)
    .eq('customer_phone', customerPhone)
    .maybeSingle();

  if (existing) return existing.id;

  const { data, error } = await supabase
    .from('whatsapp_conversations')
    .insert({
      platform_id: platformId,
      customer_phone: customerPhone,
      customer_name: customerName || customerPhone,
    })
    .select('id')
    .single();

  if (error) throw error;
  return data.id;
}

async function saveMessage(supabase, conversationId, direction, body, waMessageId = null) {
  const { error } = await supabase.from('whatsapp_messages').insert({
    conversation_id: conversationId,
    direction,
    body,
    wa_message_id: waMessageId,
    status: direction === 'outbound' ? 'sent' : 'received',
  });
  if (error) throw error;

  await supabase
    .from('whatsapp_conversations')
    .update({ last_message: body.slice(0, 100), last_message_at: new Date().toISOString() })
    .eq('id', conversationId);
}

module.exports = { sendOrderConfirmation, sendReply, sendText, extractAmountFromImage, upsertConversation, saveMessage, formatPhone };
