const express = require('express');
const axios   = require('axios');
const { updateEnv, isSystemConfigured } = require('../utils/envManager');

const router = express.Router();

router.get('/', (req, res) => {
  res.json({ configured: isSystemConfigured() });
});

router.post('/', (req, res) => {
  try {
    const { supabaseUrl, supabaseServiceKey } = req.body;
    const updates = {};
    if (supabaseUrl) updates['SUPABASE_URL'] = supabaseUrl;
    if (supabaseServiceKey) updates['SUPABASE_SERVICE_KEY'] = supabaseServiceKey;
    if (Object.keys(updates).length > 0) updateEnv(updates);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to save settings' });
  }
});

// WhatsApp Settings
router.get('/whatsapp', (req, res) => {
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
  const token   = process.env.WHATSAPP_ACCESS_TOKEN   || '';
  res.json({
    configured: !!(phoneId && token && phoneId !== 'your-phone-number-id'),
    phoneNumberId:    phoneId,
    accessToken:      token ? '••••••••' + token.slice(-6) : '',
    templateName:     process.env.WHATSAPP_TEMPLATE_NAME     || 'order_confirmation',
    templateLanguage: process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'ar',
  });
});

router.post('/whatsapp', (req, res) => {
  try {
    const { phoneNumberId, accessToken, templateName, templateLanguage } = req.body;
    const updates = {};
    if (phoneNumberId)    updates['WHATSAPP_PHONE_NUMBER_ID']    = phoneNumberId;
    if (accessToken)      updates['WHATSAPP_ACCESS_TOKEN']        = accessToken;
    if (templateName)     updates['WHATSAPP_TEMPLATE_NAME']       = templateName;
    if (templateLanguage) updates['WHATSAPP_TEMPLATE_LANGUAGE']   = templateLanguage;
    if (Object.keys(updates).length > 0) updateEnv(updates);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Webhook config — save public URL + verify token
router.get('/webhook-config', (req, res) => {
  res.json({
    appUrl:      process.env.APP_URL || '',
    verifyToken: process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || '',
  });
});

router.post('/webhook-config', (req, res) => {
  try {
    const { appUrl, verifyToken } = req.body;
    const updates = {};
    if (appUrl)      updates['APP_URL'] = appUrl.replace(/\/$/, ''); // remove trailing slash
    if (verifyToken) updates['WHATSAPP_WEBHOOK_VERIFY_TOKEN'] = verifyToken;
    if (Object.keys(updates).length > 0) updateEnv(updates);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// WhatsApp Test — send a real message and log it to inbox
router.post('/whatsapp/test', async (req, res) => {
  try {
    const { phone, platformId } = req.body;
    if (!phone) return res.status(400).json({ success: false, error: 'Phone number is required' });

    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const token         = process.env.WHATSAPP_ACCESS_TOKEN;
    const templateName  = process.env.WHATSAPP_TEMPLATE_NAME  || 'hello_world';
    const templateLang  = process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'en_US';

    if (!phoneNumberId || !token || phoneNumberId === 'your-phone-number-id') {
      return res.status(400).json({ success: false, error: 'WhatsApp not configured — save Phone Number ID and Access Token first' });
    }

    // Clean phone number
    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length < 10) return res.status(400).json({ success: false, error: 'Invalid phone number' });

    // Build template payload
    const templatePayload = {
      name: templateName,
      language: { code: templateLang },
    };

    // Add body params if NOT hello_world (hello_world has no params)
    if (templateName !== 'hello_world') {
      templatePayload.components = [{
        type: 'body',
        parameters: [
          { type: 'text', text: 'Test Customer' },
          { type: 'text', text: 'TEST-001' },
          { type: 'text', text: '0.00 TEST' },
        ],
      }];
    }

    // Send via Meta API
    const waRes = await axios.post(
      `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`,
      { messaging_product: 'whatsapp', to: cleanPhone, type: 'template', template: templatePayload },
      { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, timeout: 12000 }
    );

    const messageId = waRes.data?.messages?.[0]?.id || null;

    // Log to Supabase inbox if platformId provided
    if (platformId) {
      try {
        const { supabase } = require('../config/supabase');
        const { upsertConversation, saveMessage } = require('../services/whatsappService');
        const convId = await upsertConversation(supabase, platformId, cleanPhone, 'Test');
        await saveMessage(supabase, convId, 'outbound', `[TEST] Template: ${templateName}`, messageId);
      } catch (dbErr) {
        console.warn('⚠️  Could not save test message to inbox:', dbErr.message);
      }
    }

    res.json({ success: true, messageId, template: templateName });
  } catch (err) {
    const apiErr = err.response?.data?.error;
    const msg = apiErr
      ? `(${apiErr.code}) ${apiErr.message}`
      : err.message;
    res.status(500).json({ success: false, error: msg, code: apiErr?.code });
  }
});

module.exports = router;
