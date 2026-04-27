/**
 * Supabase Client Configuration
 * Uses the SERVICE ROLE key for server-side operations (bypasses RLS).
 * Never expose this key to the client/browser.
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey || supabaseUrl.includes('placeholder')) {
  console.error('❌ Missing or placeholder Supabase credentials in .env');
  console.error('Please configure SUPABASE_URL and SUPABASE_SERVICE_KEY manually.');
}

const supabase = createClient(supabaseUrl || 'https://placeholder.supabase.co', supabaseServiceKey || 'placeholder', {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

module.exports = { supabase };
