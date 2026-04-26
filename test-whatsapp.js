/**
 * WhatsApp Test Script
 * Run: node test-whatsapp.js
 * Tests the WhatsApp order confirmation directly without needing a Shopify webhook.
 */

require('dotenv').config();
const axios = require('axios');

const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const ACCESS_TOKEN    = process.env.WHATSAPP_ACCESS_TOKEN;
// Use hello_world to verify connection, then switch to order_confirmation once template is approved
const TEMPLATE_NAME   = 'hello_world';
const TEMPLATE_LANG   = 'en_US';

// ── Change these to test ──────────────────────────────
const TEST_PHONE    = '201000732037'; // الرقم اللي هيستلم (بدون +)
const CUSTOMER_NAME = 'تجربة العميل';
const ORDER_NUMBER  = '1001';
const TOTAL         = '350.00 EGP';
// ─────────────────────────────────────────────────────

async function run() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  WhatsApp Automation Test');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Check credentials
  if (!PHONE_NUMBER_ID || PHONE_NUMBER_ID === 'your-phone-number-id') {
    console.error('❌  WHATSAPP_PHONE_NUMBER_ID not set in .env');
    console.log('   → Set it to: 947551981784897');
    process.exit(1);
  }

  if (!ACCESS_TOKEN || ACCESS_TOKEN.includes('@')) {
    console.error('❌  WHATSAPP_ACCESS_TOKEN is wrong or not set in .env');
    console.log('   → Go to Meta → WhatsApp → API Setup → Generate Token');
    process.exit(1);
  }

  console.log('✅  Credentials found');
  console.log(`   Phone Number ID : ${PHONE_NUMBER_ID}`);
  console.log(`   Template        : ${TEMPLATE_NAME} (${TEMPLATE_LANG})`);
  console.log(`   Sending to      : +${TEST_PHONE}`);
  console.log(`   Customer        : ${CUSTOMER_NAME}`);
  console.log(`   Order #         : ${ORDER_NUMBER}`);
  console.log(`   Total           : ${TOTAL}`);
  console.log('');

  try {
    const response = await axios.post(
      `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: 'whatsapp',
        to: TEST_PHONE,
        type: 'template',
        template: {
          name: TEMPLATE_NAME,
          language: { code: TEMPLATE_LANG },
          // hello_world has no parameters — order_confirmation has 3
          ...(TEMPLATE_NAME !== 'hello_world' && {
            components: [
              {
                type: 'body',
                parameters: [
                  { type: 'text', text: CUSTOMER_NAME },
                  { type: 'text', text: ORDER_NUMBER },
                  { type: 'text', text: TOTAL },
                ],
              },
            ],
          }),
        },
      },
      {
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      }
    );

    console.log('✅  Message sent successfully!');
    console.log(`   Message ID: ${response.data?.messages?.[0]?.id}`);
    console.log(`   Status    : ${response.data?.messages?.[0]?.message_status || 'queued'}`);
    console.log('\n   ✔ الأتوميشن شغال — check your WhatsApp!\n');

  } catch (err) {
    const errData = err.response?.data?.error;
    console.error('❌  Failed to send message');
    console.log('');

    if (errData) {
      console.log(`   Code    : ${errData.code}`);
      console.log(`   Message : ${errData.message}`);
      console.log(`   Type    : ${errData.type}`);
      console.log('');

      if (errData.code === 190) {
        console.log('   → Token expired or invalid. Generate a new token from Meta.');
      } else if (errData.code === 132001) {
        console.log('   → Template not found or not approved yet in Meta Business Manager.');
        console.log(`     Check that "${TEMPLATE_NAME}" is APPROVED in WhatsApp > Message Templates.`);
      } else if (errData.code === 131030) {
        console.log('   → Phone number not in allowed list (test mode restriction).');
        console.log('     Add the recipient number in Meta > WhatsApp > API Setup > To field.');
      } else if (errData.code === 100) {
        console.log('   → Invalid parameter. Check Phone Number ID is correct.');
      }
    } else {
      console.log(`   Error: ${err.message}`);
    }

    process.exit(1);
  }
}

run();
