/**
 * ATA SaaS - Dashboard JavaScript
 * Handles form submission, UI states, and toast notifications.
 */

function copyWebhookUrl(btn) {
  const url = window._webhookUrl;
  if (!url) return;
  navigator.clipboard.writeText(url).then(() => {
    btn.innerHTML = '<i class="ph-bold ph-check" style="font-size:14px;color:#34d399;"></i>';
    setTimeout(() => { btn.innerHTML = '<i class="ph-bold ph-copy" style="font-size:14px;"></i>'; }, 2000);
  });
}

function copyText(elementId, btn) {
  const text = document.getElementById(elementId)?.textContent?.trim();
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    const orig = btn.innerHTML;
    btn.innerHTML = '<i class="ph-bold ph-check" style="color:var(--green);"></i>';
    setTimeout(() => { btn.innerHTML = orig; }, 2000);
  });
}

let _supabaseClient = null;

async function getSupabase() {
  if (_supabaseClient) return _supabaseClient;
  const res = await fetch('/api/config');
  const { supabaseUrl, supabaseAnonKey } = await res.json();
  _supabaseClient = supabase.createClient(supabaseUrl, supabaseAnonKey);
  return _supabaseClient;
}

async function authFetch(url, options = {}) {
  const sb = await getSupabase();
  const { data: { session } } = await sb.auth.getSession();
  return fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      'Authorization': `Bearer ${session.access_token}`,
    },
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  // Auth check — redirect to login if not signed in
  const sb = await getSupabase();
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { window.location.href = '/login.html'; return; }

  // Show user email in navbar
  document.getElementById('nav-user-email').textContent = session.user.email;
  document.getElementById('logout-btn').style.display = 'flex';

  document.getElementById('logout-btn').addEventListener('click', async () => {
    await sb.auth.signOut();
    window.location.href = '/login.html';
  });

  // Use real user ID as owner_id
  document.getElementById('owner-id').value = session.user.id;

  // DOM Elements
  const connectForm = document.getElementById('connect-form');
  const shopInput = document.getElementById('shop-domain');
  const ownerInput = document.getElementById('owner-id');
  const connectBtn = document.getElementById('connect-btn');
  const toastContainer = document.getElementById('toast-container');
  const brandCardsContainer = document.getElementById('brand-cards-container');

  // Views
  const viewHome = document.getElementById('view-home');
  const viewBrand = document.getElementById('view-brand');
  let currentBrandId = null;

  // Modal Elements
  let currentSyncPlatformId = null;

  // Settings Elements
  const settingsModal = document.getElementById('settings-modal');
  const settingsForm = document.getElementById('settings-form');
  const saveSettingsBtn = document.getElementById('save-settings-btn');
  const closeSettingsBtn = document.getElementById('close-settings-btn');

  // State
  let connectedStores = []; // Will fetch from API in real implementation
  let isSystemReady = false;

  // Initialize
  init();

  async function init() {
    await checkSystemSettings();
    
    if (!isSystemReady) return;

    const urlParams = new URLSearchParams(window.location.search);
    const successMsg = urlParams.get('success');
    const errorMsg = urlParams.get('error');
    if (successMsg) { showToast(successMsg, 'success'); window.history.replaceState({}, document.title, window.location.pathname); }
    if (errorMsg) { showToast(errorMsg, 'error'); window.history.replaceState({}, document.title, window.location.pathname); }

    // Save hash before showHomeView overwrites it
    const _savedHash = location.hash;
    showHomeView({ skipHash: true });
    loadStoresFromDB(_savedHash);

    // Setup navigation
    setupNavigation();
  }

  function setAppHash(hash) {
    history.replaceState(null, '', '#' + hash);
  }

  function showHomeView({ skipHash = false } = {}) {
    viewHome.style.display = 'block';
    viewBrand.style.display = 'none';
    document.getElementById('back-to-home-btn').style.display = 'none';
    document.getElementById('brand-nav-label').style.display = 'none';
    if (window.hideBrandNavItems) window.hideBrandNavItems();
    stopMessagePolling();
    if (!skipHash) setAppHash('home');
  }

  function showBrandView(store) {
    currentBrandId = store.id;
    viewHome.style.display = 'none';
    viewBrand.style.display = 'flex';
    document.getElementById('back-to-home-btn').style.display = 'flex';
    document.getElementById('brand-nav-label').style.display = 'inline';
    if (window.showBrandNavItems) window.showBrandNavItems();
    document.getElementById('brand-nav-label').textContent = store.domain;
    document.getElementById('bv-avatar').textContent = store.domain.charAt(0).toUpperCase();
    document.getElementById('bv-domain').textContent = store.domain;
    document.getElementById('bv-synced').textContent = store.lastSynced ? 'Last synced: ' + store.lastSynced : 'Never synced';
    document.getElementById('bv-full-sync-label').textContent = 'Sync Data';
    document.getElementById('brand-chat-subtitle').textContent = store.domain;

    // Load stats for this brand
    loadBrandStats(store.id);
    // Reset tabs
    tabLoaded = { orders: false, products: false, customers: false, chat: false, inbox: false };
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.style.display = 'none');
    document.querySelector('.tab-btn[data-tab="orders"]').classList.add('active');
    document.getElementById('tab-orders').style.display = 'block';
    loadOrders(store.id);
    tabLoaded.orders = true;
    setAppHash('brand/' + encodeURIComponent(store.domain) + '/orders');

    // Sync buttons
    document.getElementById('bv-full-sync-btn').onclick = () => { startFullSync(store.id, store.domain, !!store.lastSynced); };
  }

  async function loadBrandStats(platformId) {
    try {
      const res = await authFetch(`/api/stores/${platformId}/stats`);
      const s = await res.json();
      document.getElementById('bv-stat-products').textContent = (s.products || 0).toLocaleString();
      document.getElementById('bv-stat-orders').textContent = (s.orders || 0).toLocaleString();
      document.getElementById('bv-stat-customers').textContent = (s.customers || 0).toLocaleString();
    } catch (_) {}
  }

  function setupNavigation() {
    document.getElementById('back-to-home-btn').addEventListener('click', () => { showHomeView(); });
    document.getElementById('nav-brand-link')?.addEventListener('click', (e) => { e.preventDefault(); showHomeView(); });

    // Connect modal
    document.getElementById('open-connect-modal-btn').addEventListener('click', () => {
      document.getElementById('connect-modal').classList.add('active');
    });
    document.getElementById('close-connect-modal-btn').addEventListener('click', () => {
      document.getElementById('connect-modal').classList.remove('active');
    });

    // WhatsApp configure link
    document.getElementById('wa-configure-link')?.addEventListener('click', (e) => {
      e.preventDefault();
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(t => t.style.display = 'none');
      document.querySelector('.tab-btn[data-tab="whatsapp"]').classList.add('active');
      document.getElementById('tab-whatsapp').style.display = 'block';
    });
  }

  // --- Connect Form Handler ---
  connectForm.addEventListener('submit', (e) => {
    e.preventDefault();
    
    const subdomain = shopInput.value.trim().toLowerCase();
    const ownerId = ownerInput.value;
    const clientId = document.getElementById('client-id').value.trim();
    const clientSecret = document.getElementById('client-secret').value.trim();

    if (!subdomain) { showToast('Please enter a store name', 'error'); return; }
    if (!clientId || !clientSecret) { showToast('Please enter your Client ID and Secret', 'error'); return; }

    const fullDomain = `${subdomain}.myshopify.com`;

    connectBtn.classList.add('btn-loading');
    connectBtn.disabled = true;

    // Open Shopify OAuth in a small popup (no full page redirect)
    const authUrl = `/auth?shop=${fullDomain}&owner_id=${ownerId}&client_id=${clientId}&client_secret=${clientSecret}`;
    const popup = window.open(
      authUrl,
      'shopify_oauth',
      'width=600,height=700,top=100,left=100,scrollbars=yes'
    );

    // Listen for success message from the popup
    const messageHandler = (event) => {
      if (event.origin !== window.location.origin) return;
      
      if (event.data.type === 'SHOPIFY_CONNECTED') {
        window.removeEventListener('message', messageHandler);
        clearInterval(popupChecker);
        connectBtn.classList.remove('btn-loading');
        connectBtn.disabled = false;
        
        if (event.data.success) {
          showToast(`✅ ${event.data.shop} connected! Syncing data...`, 'success');
          connectForm.reset();
          // Refresh stores list after a moment to show the new store
          setTimeout(loadStoresFromDB, 2000);
        } else {
          showToast(`❌ Error: ${event.data.error}`, 'error');
        }
      }
    };
    window.addEventListener('message', messageHandler);

    // Fallback: if popup is closed manually, re-enable the button
    const popupChecker = setInterval(() => {
      if (popup && popup.closed) {
        clearInterval(popupChecker);
        window.removeEventListener('message', messageHandler);
        connectBtn.classList.remove('btn-loading');
        connectBtn.disabled = false;
      }
    }, 500);
  });

  // --- Toast Notifications ---
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let iconClass = 'ph-info text-primary';
    if (type === 'success') iconClass = 'ph-check-circle text-green-500';
    if (type === 'error') iconClass = 'ph-warning-circle text-destructive';

    toast.innerHTML = `
      <i class="ph-fill ${iconClass} text-xl"></i>
      <div>${message}</div>
    `;

    toastContainer.appendChild(toast);

    // Remove toast after animation ends
    setTimeout(() => {
      if (toastContainer.contains(toast)) {
        toastContainer.removeChild(toast);
      }
    }, 5000);
  }

  // --- Load Stores from Database ---
  async function loadStoresFromDB(savedHash = '') {
    try {
      const res = await authFetch('/api/stores');
      const data = await res.json();
      if (data.stores) {
        connectedStores = data.stores.map(s => ({
          id: s.id,
          domain: s.shop_domain,
          status: s.is_active ? 'active' : 'inactive',
          lastSynced: s.last_synced_at ? new Date(s.last_synced_at).toLocaleString() : null
        }));
        renderStores();
        populateHomeChatSelect();
        restoreFromHash(savedHash || location.hash);
      }
    } catch (err) {
      console.error('Failed to load stores:', err);
    }
  }

  function restoreFromHash(hash) {
    const h = (hash || location.hash).replace('#', '');
    if (!h || h === 'home') return;
    const parts = h.split('/');
    if (parts[0] !== 'brand' || !parts[1]) return;
    const domain = decodeURIComponent(parts[1]);
    // Match by domain OR by id (backward compat)
    const store = connectedStores.find(s => s.domain === domain || s.id === domain);
    if (!store) return;
    showBrandView(store);
    const tab = parts[2];
    if (tab && tab !== 'orders') {
      setTimeout(() => {
        const tabBtn = document.querySelector(`.tab-btn[data-tab="${tab}"]`);
        if (tabBtn) tabBtn.click();
      }, 50);
    }
  }

  function populateHomeChatSelect() {
    const select = document.getElementById('home-chat-store-select');
    if (!select) return;
    select.innerHTML = '<option value="">— اختار براند —</option>';
    connectedStores.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = s.domain;
      select.appendChild(opt);
    });
    if (connectedStores.length === 1) select.value = connectedStores[0].id;
  }

  function renderStores() {
    brandCardsContainer.innerHTML = '';

    connectedStores.forEach(store => {
      const card = document.createElement('div');
      card.className = 'section-card hover:border-primary transition-colors cursor-pointer group flex flex-col p-0 mb-0 h-full';
      card.innerHTML = `
        <div class="p-6 border-b border-border flex-1">
          <div class="flex items-center gap-4 mb-6">
            <div class="w-12 h-12 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold text-xl group-hover:bg-primary group-hover:text-white transition-colors">
              ${store.domain.charAt(0).toUpperCase()}
            </div>
            <div class="flex-1 min-w-0">
              <div class="font-bold text-foreground text-sm truncate">${store.domain}</div>
              <div class="text-xs text-muted-foreground mt-1 truncate">${store.lastSynced ? 'Synced: ' + store.lastSynced : 'Never synced'}</div>
            </div>
          </div>
          <div class="grid grid-cols-3 gap-2" id="brand-stats-${store.id}">
            <div class="bg-muted/50 rounded-md p-2 text-center border border-border">
              <div class="brand-stat-val text-lg font-bold text-foreground leading-none">—</div>
              <div class="brand-stat-lbl text-[10px] uppercase text-muted-foreground mt-1">Products</div>
            </div>
            <div class="bg-muted/50 rounded-md p-2 text-center border border-border">
              <div class="brand-stat-val text-lg font-bold text-foreground leading-none">—</div>
              <div class="brand-stat-lbl text-[10px] uppercase text-muted-foreground mt-1">Orders</div>
            </div>
            <div class="bg-muted/50 rounded-md p-2 text-center border border-border">
              <div class="brand-stat-val text-lg font-bold text-foreground leading-none">—</div>
              <div class="brand-stat-lbl text-[10px] uppercase text-muted-foreground mt-1">Customers</div>
            </div>
          </div>
        </div>
        <div class="p-4 bg-muted/30 flex justify-end">
          <button class="btn btn-secondary btn-sm w-full group-hover:bg-primary group-hover:text-white group-hover:border-primary transition-colors">
            Enter Environment <i class="ph ph-arrow-right"></i>
          </button>
        </div>
      `;
      card.addEventListener('click', () => showBrandView(store));
      brandCardsContainer.appendChild(card);

      // Load stats for each card
      loadCardStats(store.id);
    });

    // Add "Connect New Store" card
    const addCard = document.createElement('div');
    addCard.className = 'section-card border-dashed border-2 bg-transparent hover:border-primary hover:bg-muted/30 transition-colors cursor-pointer flex flex-col items-center justify-center p-0 mb-0 min-h-[220px] text-muted-foreground hover:text-primary';
    addCard.innerHTML = '<i class="ph ph-plus-circle text-4xl mb-2"></i><span class="font-medium text-sm">Deploy New Environment</span>';
    addCard.addEventListener('click', () => document.getElementById('connect-modal').classList.add('active'));
    brandCardsContainer.appendChild(addCard);
  }

  async function loadCardStats(platformId) {
    try {
      const res = await authFetch(`/api/stores/${platformId}/stats`);
      const s = await res.json();
      const row = document.getElementById(`brand-stats-${platformId}`);
      if (row) {
        const vals = row.querySelectorAll('.brand-stat-val');
        vals[0].textContent = (s.products || 0).toLocaleString();
        vals[1].textContent = (s.orders || 0).toLocaleString();
        vals[2].textContent = (s.customers || 0).toLocaleString();
      }
    } catch (_) {}
  }

  // --- System Settings Logic ---
  async function checkSystemSettings() {
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      
      if (!data.configured) {
        settingsModal?.classList.add('active');
        isSystemReady = false;
        showToast('System configuration required', 'error');
      } else {
        isSystemReady = true;
      }
    } catch (error) {
      console.error('Failed to check settings:', error);
      isSystemReady = false;
    }
  }

  settingsForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    saveSettingsBtn.classList.add('btn-loading');
    saveSettingsBtn.disabled = true;

    const payload = {
      supabaseUrl: document.getElementById('supabase-url').value.trim(),
      supabaseServiceKey: document.getElementById('supabase-service-key').value.trim(),
    };

    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      const data = await res.json();
      
      if (data.success) {
        showToast('Settings saved successfully! You can now connect stores.', 'success');
        settingsModal?.classList.remove('active');
        isSystemReady = true;

        // Resume initialization
        init();
      } else {
        throw new Error(data.error || 'Failed to save settings');
      }
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      saveSettingsBtn?.classList.remove('btn-loading');
      if (saveSettingsBtn) saveSettingsBtn.disabled = false;
    }
  });

  closeSettingsBtn?.addEventListener('click', () => {
    settingsModal?.classList.remove('active');
  });

  // --- Tabs ---
  let tabLoaded = { orders: false, products: false, customers: false, chat: false, inbox: false };

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(t => t.style.display = 'none');

      btn.classList.add('active');
      const tab = btn.dataset.tab;
      document.getElementById(`tab-${tab}`).style.display = 'block';
      if (currentBrandId) {
        const s = connectedStores.find(x => x.id === currentBrandId);
        if (s) setAppHash('brand/' + encodeURIComponent(s.domain) + '/' + tab);
      }

      if (!currentBrandId) return;
      if (tab === 'chat') {
        if (!tabLoaded.chat) { tabLoaded.chat = true; initBrandChat(); }
        return;
      }
      if (tab === 'inbox') {
        if (!tabLoaded.inbox) { tabLoaded.inbox = true; loadInbox(currentBrandId); }
        return;
      }
      if (!tabLoaded[tab]) {
        tabLoaded[tab] = true;
        if (tab === 'orders') loadOrders(currentBrandId);
        if (tab === 'products') loadProducts(currentBrandId);
        if (tab === 'customers') loadCustomers(currentBrandId);
      }
    });
  });

  async function loadOrders(platformId) {
    const loading = document.getElementById('orders-loading');
    const table = document.getElementById('orders-table');
    const empty = document.getElementById('orders-empty');
    try {
      const res = await authFetch(`/api/stores/${platformId}/orders`);
      const data = await res.json();
      loading.style.display = 'none';
      if (!data.orders || data.orders.length === 0) { empty.style.display = 'block'; return; }
      const tbody = document.getElementById('orders-tbody');
      tbody.innerHTML = data.orders.map(o => {
        const payBadge = `<span class="badge badge-${o.financial_status || 'pending'}">${o.financial_status || '—'}</span>`;
        const fulfillBadge = o.fulfillment_status
          ? `<span class="badge badge-${o.fulfillment_status}">${o.fulfillment_status}</span>`
          : `<span class="badge badge-unfulfilled">unfulfilled</span>`;
        const date = o.ordered_at ? new Date(o.ordered_at).toLocaleDateString() : '—';
        return `<tr>
          <td class="font-medium text-foreground">#${o.order_number || o.shopify_id}</td>
          <td>${o.customer_name || '—'}</td>
          <td class="text-muted-foreground">${o.email || '—'}</td>
          <td class="font-medium">${parseFloat(o.total_price || 0).toFixed(2)} ${o.currency || ''}</td>
          <td>${payBadge}</td>
          <td>${fulfillBadge}</td>
          <td class="text-muted-foreground">${date}</td>
        </tr>`;
      }).join('');
      table.style.display = 'table';
    } catch (e) {
      loading.textContent = 'Failed to load orders.';
    }
  }

  async function loadProducts(platformId) {
    const loading = document.getElementById('products-loading');
    const table = document.getElementById('products-table');
    const empty = document.getElementById('products-empty');
    try {
      const res = await authFetch(`/api/stores/${platformId}/products`);
      const data = await res.json();
      loading.style.display = 'none';
      if (!data.products || data.products.length === 0) { empty.style.display = 'block'; return; }
      const tbody = document.getElementById('products-tbody');
      tbody.innerHTML = data.products.map(p => {
        const img = p.image_url
          ? `<img src="${p.image_url}" class="w-8 h-8 rounded object-cover border border-border" alt="">`
          : `<div class="w-8 h-8 rounded bg-muted flex items-center justify-center text-muted-foreground border border-border"><i class="ph ph-image"></i></div>`;
        const statusColor = p.status === 'active' ? 'text-green-600' : p.status === 'draft' ? 'text-amber-600' : 'text-muted-foreground';
        return `<tr>
          <td>${img}</td>
          <td class="font-medium text-foreground">${p.title || '—'}</td>
          <td class="text-muted-foreground">${p.vendor || '—'}</td>
          <td class="text-muted-foreground">${p.product_type || '—'}</td>
          <td class="font-medium">$${parseFloat(p.price || 0).toFixed(2)}</td>
          <td>${p.inventory_qty ?? '—'}</td>
          <td><span class="${statusColor} font-medium capitalize">${p.status || '—'}</span></td>
        </tr>`;
      }).join('');
      table.style.display = 'table';
    } catch (e) {
      loading.textContent = 'Failed to load products.';
    }
  }

  // --- Webhook Config Form ---
  (async () => {
    try {
      const res = await authFetch('/api/settings/webhook-config');
      const cfg = await res.json();
      if (cfg.appUrl)      document.getElementById('wh-app-url').value        = cfg.appUrl;
      if (cfg.verifyToken) document.getElementById('wh-verify-token').value   = cfg.verifyToken;
      if (cfg.appUrl) showWebhookUrls(cfg.appUrl, cfg.verifyToken);
    } catch (_) {}
  })();

  function showWebhookUrls(appUrl, verifyToken) {
    const box = document.getElementById('wh-urls-box');
    if (!box || !appUrl) return;
    document.getElementById('wh-callback-url').textContent  = `${appUrl}/webhooks/whatsapp`;
    document.getElementById('wh-verify-display').textContent = verifyToken || '';
    box.style.display = 'block';
  }

  document.getElementById('webhook-config-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn         = document.getElementById('wh-save-btn');
    const appUrl      = document.getElementById('wh-app-url').value.trim();
    const verifyToken = document.getElementById('wh-verify-token').value.trim();

    if (!appUrl) { showToast('Enter the public URL first', 'error'); return; }

    btn.classList.add('btn-loading'); btn.disabled = true;
    try {
      const res  = await authFetch('/api/settings/webhook-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appUrl, verifyToken }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      showWebhookUrls(appUrl, verifyToken);
      showToast('Webhook config saved!', 'success');
    } catch (err) {
      showToast('Failed: ' + err.message, 'error');
    } finally {
      btn.classList.remove('btn-loading'); btn.disabled = false;
    }
  });

  // --- WhatsApp Settings ---
  (async () => {
    try {
      // Set webhook URL
      const webhookUrl = `${window.location.origin}/webhooks/shopify/orders/create`;
      const urlEl = document.getElementById('webhook-url-display');
      if (urlEl) urlEl.textContent = webhookUrl;
      window._webhookUrl = webhookUrl;

      // Load saved WhatsApp settings
      const res = await authFetch('/api/settings/whatsapp');
      const cfg = await res.json();

      if (cfg.phoneNumberId) document.getElementById('wa-phone-id').value = cfg.phoneNumberId;
      if (cfg.accessToken)   document.getElementById('wa-token').placeholder = cfg.accessToken;
      if (cfg.templateName)  document.getElementById('wa-template-name').value = cfg.templateName;
      if (cfg.templateLanguage) document.getElementById('wa-template-lang').value = cfg.templateLanguage;

      // Update badge & configured flag
      const badge = document.getElementById('wa-status-badge');
      if (cfg.configured) {
        badge.textContent = '✅ Configured';
        badge.style.cssText = 'font-size:11px;padding:3px 10px;border-radius:100px;background:var(--green-bg);color:var(--green);border:1px solid var(--green-border);';
        _waAlreadyConfigured = true;
      }
    } catch (_) {}
  })();

  // Track if WA is already configured (token saved before)
  let _waAlreadyConfigured = false;

  document.getElementById('wa-settings-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('wa-save-btn');
    btn.classList.add('btn-loading');
    btn.disabled = true;

    const phoneNumberId    = document.getElementById('wa-phone-id').value.trim();
    const accessToken      = document.getElementById('wa-token').value.trim();
    const templateName     = document.getElementById('wa-template-name').value.trim();
    const templateLanguage = document.getElementById('wa-template-lang').value;

    // If token field is empty but already configured → keep existing token (don't require re-entry)
    if (!phoneNumberId) {
      showToast('Phone Number ID is required', 'error');
      btn.classList.remove('btn-loading');
      btn.disabled = false;
      return;
    }
    if (!accessToken && !_waAlreadyConfigured) {
      showToast('Access Token is required', 'error');
      btn.classList.remove('btn-loading');
      btn.disabled = false;
      return;
    }

    try {
      const payload = { phoneNumberId, templateName, templateLanguage };
      if (accessToken) payload.accessToken = accessToken; // only send if user typed a new one

      const res = await authFetch('/api/settings/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      // Update badge
      const badge = document.getElementById('wa-status-badge');
      badge.textContent = '✅ Configured';
      badge.style.cssText = 'font-size:11px;padding:3px 10px;border-radius:100px;background:var(--green-bg);color:var(--green);border:1px solid var(--green-border);';

      if (accessToken) {
        document.getElementById('wa-token').value = '';
        document.getElementById('wa-token').placeholder = '••••••••' + accessToken.slice(-6);
      }

      _waAlreadyConfigured = true;
      showToast('WhatsApp settings saved!', 'success');
    } catch (err) {
      showToast('Failed to save: ' + err.message, 'error');
    } finally {
      btn.classList.remove('btn-loading');
      btn.disabled = false;
    }
  });

  // --- WhatsApp Test Button ---
  document.getElementById('wa-test-btn')?.addEventListener('click', async () => {
    const btn    = document.getElementById('wa-test-btn');
    const phone  = document.getElementById('wa-test-phone').value.trim();
    const result = document.getElementById('wa-test-result');

    if (!phone) { showToast('Enter a phone number first', 'error'); return; }

    btn.classList.add('btn-loading');
    btn.disabled = true;
    result.style.display = 'none';

    try {
      const res  = await authFetch('/api/settings/whatsapp/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, platformId: currentBrandId }),
      });
      const data = await res.json();

      if (data.success) {
        result.style.display = 'block';
        result.style.background = 'var(--green-bg)';
        result.style.border = '1px solid var(--green-border)';
        result.style.color  = 'var(--green)';
        result.innerHTML = `<i class="ph-bold ph-check-circle"></i> <strong>Message sent!</strong> Template: <code>${data.template}</code> — Check your WhatsApp & the Inbox tab`;
        showToast('Test message sent successfully!', 'success');

        // Reload inbox if open
        if (currentBrandId && document.getElementById('tab-inbox')?.style.display !== 'none') {
          loadInbox(currentBrandId);
        }
      } else {
        throw new Error(data.error);
      }
    } catch (err) {
      result.style.display = 'block';
      result.style.background = 'var(--red-bg)';
      result.style.border = '1px solid var(--red-border)';
      result.style.color  = 'var(--red)';
      result.innerHTML = `<i class="ph-bold ph-warning-circle"></i> <strong>Failed:</strong> ${err.message}`;
      showToast('Test failed: ' + err.message, 'error');
    } finally {
      btn.classList.remove('btn-loading');
      btn.disabled = false;
    }
  });

  // --- Full Sync ---
  const fullsyncModal = document.getElementById('fullsync-modal');
  document.getElementById('fullsync-close-btn').addEventListener('click', () => {
    fullsyncModal.classList.remove('active');
  });

  async function startFullSync(platformId, shopDomain, isIncremental = false) {
    // Reset modal
    document.getElementById('fullsync-shop').textContent = `${shopDomain} — ${isIncremental ? 'Updating new data only' : 'Full sync (first time)'}`;
    document.getElementById('fullsync-status-text').textContent = 'Starting...';
    document.getElementById('fullsync-elapsed').textContent = '0s elapsed';
    document.getElementById('fullsync-bar').style.width = '0%';
    document.getElementById('fullsync-close-btn').disabled = true;
    ['products', 'orders', 'customers'].forEach(s => {
      document.querySelector(`#stage-${s} .stage-icon`).textContent = '⏳';
      document.getElementById(`stage-${s}-count`).textContent = '—';
    });
    fullsyncModal.classList.add('active');

    let pollInterval;
    try {
      const res = await authFetch(`/api/sync/${platformId}/full`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ forceFullSync: !isIncremental }),
      });
      const { jobId, error } = await res.json();
      if (error) throw new Error(error);

      pollInterval = setInterval(async () => {
        try {
          const r = await authFetch(`/api/sync/job/${jobId}`);
          const job = await r.json();

          document.getElementById('fullsync-elapsed').textContent = `${job.elapsed}s elapsed`;

          const stageOrder = ['products', 'orders', 'customers'];
          let doneCount = 0;
          stageOrder.forEach(s => {
            const p = job.progress[s];
            const icon = p.action === 'done' ? '✅' : (p.action === 'fetching' || p.action === 'saving') ? '🔄' : '⏳';
            const label = p.action === 'fetching' ? ' fetching...' : p.action === 'saving' ? ' saving...' : p.action === 'done' ? ' saved' : '';
            const count = p.count > 0 ? p.count.toLocaleString() + label : '—';
            document.querySelector(`#stage-${s} .stage-icon`).textContent = icon;
            document.getElementById(`stage-${s}-count`).textContent = count;
            if (p.action === 'done') doneCount++;
          });

          // Progress bar based on stages completed
          const currentStage = stageOrder.findIndex(s => job.progress[s].action !== 'pending' && job.progress[s].action !== 'done');
          const baseProgress = (doneCount / 3) * 100;
          document.getElementById('fullsync-bar').style.width = `${Math.min(baseProgress + (currentStage >= 0 ? 5 : 0), 99)}%`;

          const activeStage = stageOrder.find(s => job.progress[s].action === 'fetching' || job.progress[s].action === 'saving');
          if (activeStage) {
            const p = job.progress[activeStage];
            document.getElementById('fullsync-status-text').textContent =
              `${p.action === 'fetching' ? 'Fetching' : 'Saving'} ${activeStage}... ${p.count.toLocaleString()} records`;
          }

          if (job.status === 'done') {
            clearInterval(pollInterval);
            document.getElementById('fullsync-bar').style.width = '100%';
            document.getElementById('fullsync-status-text').textContent = `Done in ${job.elapsed}s`;
            document.getElementById('fullsync-close-btn').disabled = false;
            const r = job.result;
            showToast(`Full sync complete! ${r.products.toLocaleString()} products, ${r.orders.toLocaleString()} orders, ${r.customers.toLocaleString()} customers.`, 'success');

            // Update stats immediately
            const _p = document.getElementById('bv-stat-products');
            const _o = document.getElementById('bv-stat-orders');
            const _c = document.getElementById('bv-stat-customers');
            if (_p) _p.innerText = r.products.toLocaleString();
            if (_o) _o.innerText = r.orders.toLocaleString();
            if (_c) _c.innerText = r.customers.toLocaleString();

            // Reset tab cache so next click reloads fresh data
            tabLoaded.orders = false;
            tabLoaded.products = false;
            tabLoaded.customers = false;

            loadStoresFromDB();
          } else if (job.status === 'error') {
            clearInterval(pollInterval);
            document.getElementById('fullsync-status-text').textContent = `Error: ${job.error}`;
            document.getElementById('fullsync-close-btn').disabled = false;
            showToast(`Full sync failed: ${job.error}`, 'error');
          }
        } catch (pollErr) {
          console.error('Poll error:', pollErr);
        }
      }, 2000);
    } catch (err) {
      document.getElementById('fullsync-status-text').textContent = `Error: ${err.message}`;
      document.getElementById('fullsync-close-btn').disabled = false;
      showToast(`Could not start sync: ${err.message}`, 'error');
    }
  }

  // --- AI Chat (Home + Brand) ---
  let homeChatHistory = [];
  let brandChatHistory = [];

  // Home chat UI interactions (elements may not exist in current layout)
  const homeChatPanel = document.getElementById('home-chat-panel');
  const homeChatInput = document.getElementById('home-chat-input');
  const closeChatBtn = document.getElementById('close-chat-btn');

  homeChatInput?.addEventListener('focus', () => {
    if (homeChatPanel?.classList.contains('collapsed')) {
      homeChatPanel.classList.remove('collapsed');
      homeChatPanel.classList.add('expanded');
    }
  });

  closeChatBtn?.addEventListener('click', () => {
    homeChatPanel?.classList.remove('expanded');
    homeChatPanel?.classList.add('collapsed');
  });

  // Home chat
  document.getElementById('home-chat-send-btn')?.addEventListener('click', sendHomeChatMessage);
  homeChatInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendHomeChatMessage(); }
  });

  async function sendHomeChatMessage() {
    const input = document.getElementById('home-chat-input');
    if (!input) return;
    const message = input.value.trim();
    if (!message) return;
    const platformId = document.getElementById('home-chat-store-select')?.value;
    if (!platformId) { showToast('اختار براند الأول', 'error'); return; }
    input.value = '';
    appendMsg('home-chat-messages', 'user', message);
    const btn = document.getElementById('home-chat-send-btn');
    if (btn) { btn.classList.add('btn-loading'); btn.disabled = true; }
    input.disabled = true;
    const typingEl = appendTypingTo('home-chat-messages');
    try {
      const res = await authFetch('/api/chat', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ message, history:homeChatHistory, platformId }) });
      const data = await res.json();
      typingEl?.remove();
      if (data.error) throw new Error(data.error);
      appendMsg('home-chat-messages', 'ai', data.reply);
      homeChatHistory.push({ role:'user', content:message }, { role:'assistant', content:data.reply });
      if (homeChatHistory.length > 20) homeChatHistory = homeChatHistory.slice(-20);
    } catch (err) {
      typingEl?.remove();
      appendMsg('home-chat-messages', 'ai', '❌ Error: ' + err.message);
    } finally {
      if (btn) { btn.classList.remove('btn-loading'); btn.disabled = false; }
      input.disabled = false;
      input.focus();
    }
  }

  // Brand chat
  function initBrandChat() {
    document.getElementById('brand-chat-send-btn').addEventListener('click', sendBrandChatMessage);
    document.getElementById('brand-chat-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendBrandChatMessage(); }
    });
  }

  async function sendBrandChatMessage() {
    const input = document.getElementById('brand-chat-input');
    const message = input.value.trim();
    if (!message || !currentBrandId) return;
    input.value = '';
    appendMsg('brand-chat-messages', 'user', message);
    const btn = document.getElementById('brand-chat-send-btn');
    btn.classList.add('btn-loading'); btn.disabled = true; input.disabled = true;
    const typingEl = appendTypingTo('brand-chat-messages');
    try {
      const res = await authFetch('/api/chat', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ message, history:brandChatHistory, platformId:currentBrandId }) });
      const data = await res.json(); typingEl.remove();
      if (data.error) throw new Error(data.error);
      appendMsg('brand-chat-messages', 'ai', data.reply);
      brandChatHistory.push({ role:'user', content:message }, { role:'assistant', content:data.reply });
      if (brandChatHistory.length > 20) brandChatHistory = brandChatHistory.slice(-20);
    } catch (err) { typingEl.remove(); appendMsg('brand-chat-messages', 'ai', '❌ Error: ' + err.message); }
    finally { btn.classList.remove('btn-loading'); btn.disabled = false; input.disabled = false; input.focus(); }
  }

  function appendMsg(containerId, role, text) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const wrapper = document.createElement('div');
    wrapper.className = role === 'user' ? 'flex justify-end' : 'flex justify-start';
    const bubble = document.createElement('div');
    bubble.className = role === 'user' 
      ? 'bg-primary text-primary-foreground p-3 rounded-2xl rounded-tr-sm max-w-[85%] border shadow-sm' 
      : 'bg-muted text-foreground p-3 rounded-2xl rounded-tl-sm max-w-[85%] border border-border shadow-sm';
    bubble.textContent = text;
    wrapper.appendChild(bubble);
    container.appendChild(wrapper);
    container.scrollTop = container.scrollHeight;
  }

  function appendTypingTo(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return null;
    const wrapper = document.createElement('div');
    wrapper.className = 'flex justify-start';
    wrapper.innerHTML = '<div class="bg-muted text-foreground p-3 rounded-2xl rounded-tl-sm border border-border shadow-sm flex gap-1"><span class="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce"></span><span class="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce" style="animation-delay:0.1s"></span><span class="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce" style="animation-delay:0.2s"></span></div>';
    container.appendChild(wrapper);
    container.scrollTop = container.scrollHeight;
    return wrapper;
  }

  // ═══════════════ INBOX ═══════════════
  let currentConversationId = null;
  let _msgPollingTimer = null;

  function startMessagePolling(conv) {
    stopMessagePolling();
    _msgPollingTimer = setInterval(async () => {
      if (!currentConversationId) return;
      try {
        const res = await authFetch(`/api/conversations/${currentConversationId}/messages`);
        const data = await res.json();
        const msgs = data.messages || [];
        const messagesEl = document.getElementById('inbox-messages');
        if (!messagesEl) return;
        // Only re-render if count changed
        const current = messagesEl.querySelectorAll('.inbox-msg').length;
        if (msgs.length !== current) {
          messagesEl.innerHTML = '';
          msgs.forEach(msg => {
            const isOut = msg.direction === 'outbound';
            const time  = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const wrapper = document.createElement('div');
            wrapper.className = `flex flex-col max-w-[75%] ${isOut ? 'self-end items-end' : 'self-start items-start'}`;
            wrapper.innerHTML = `
              <div class="${isOut ? 'bg-primary text-primary-foreground p-2.5 rounded-2xl rounded-tr-sm' : 'bg-muted text-foreground p-2.5 rounded-2xl rounded-tl-sm border border-border shadow-sm'} text-sm leading-relaxed break-words">${renderMsgBody(msg.body)}</div>
              <div class="text-[10px] text-muted-foreground mt-1">${isOut ? 'You · ' : ''}${time}</div>
            `;
            messagesEl.appendChild(wrapper);
          });
          messagesEl.scrollTop = messagesEl.scrollHeight;
          // Update sidebar preview
          if (msgs.length > 0) {
            const last = msgs[msgs.length - 1];
            const preview = document.querySelector(`.inbox-conv-item[data-id="${currentConversationId}"] .inbox-conv-preview`);
            if (preview) preview.textContent = last.body.slice(0, 45);
          }
        }
      } catch (_) {}
    }, 4000);
  }

  function stopMessagePolling() {
    if (_msgPollingTimer) { clearInterval(_msgPollingTimer); _msgPollingTimer = null; }
  }

  async function loadInbox(platformId) {
    const convList = document.getElementById('inbox-conv-list');
    convList.innerHTML = '<div class="inbox-placeholder">Loading...</div>';

    try {
      const res = await authFetch(`/api/stores/${platformId}/conversations`);
      const data = await res.json();
      const conversations = data.conversations || [];

      document.getElementById('inbox-conv-count').textContent =
        conversations.length ? `${conversations.length}` : '';

      if (conversations.length === 0) {
        convList.innerHTML = '<div class="inbox-placeholder">No conversations yet.<br>Messages will appear here when customers reply to WhatsApp confirmations.</div>';
        return;
      }

      convList.innerHTML = '';
      conversations.forEach(conv => renderConvItem(conv));
    } catch (err) {
      convList.innerHTML = `<div class="inbox-placeholder" style="color:var(--red);">Failed to load</div>`;
    }
  }

  function renderConvItem(conv) {
    const convList = document.getElementById('inbox-conv-list');
    const item = document.createElement('div');
    item.className = 'inbox-conv-item px-4 py-3 border-b border-border hover:bg-muted/50 cursor-pointer transition-colors flex items-start gap-3';
    item.dataset.id = conv.id;

    const name    = conv.customer_name || conv.customer_phone;
    const initial = name.charAt(0).toUpperCase();
    const time    = conv.last_message_at ? inboxRelativeTime(new Date(conv.last_message_at)) : '';
    const preview = conv.last_message ? conv.last_message.slice(0, 45) : '—';

    item.innerHTML = `
      <div class="w-10 h-10 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center text-white font-bold flex-shrink-0">${initial}</div>
      <div class="flex-1 min-w-0">
        <div class="font-semibold text-sm text-foreground truncate">${escHtml(name)}</div>
        <div class="text-xs text-muted-foreground truncate mt-0.5">${escHtml(preview)}</div>
      </div>
      <div class="text-[10px] text-muted-foreground whitespace-nowrap">${time}</div>
    `;

    item.addEventListener('click', () => openConversation(conv));
    convList.appendChild(item);
  }

  async function openConversation(conv) {
    currentConversationId = conv.id;

    document.querySelectorAll('.inbox-conv-item').forEach(el => el.classList.remove('active'));
    document.querySelector(`.inbox-conv-item[data-id="${conv.id}"]`)?.classList.add('active');

    const name   = conv.customer_name || conv.customer_phone;
    const thread = document.getElementById('inbox-thread');

    thread.innerHTML = `
      <div class="flex items-center justify-between p-4 bg-background border-b border-border flex-shrink-0">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center text-white font-bold flex-shrink-0">${escHtml(name.charAt(0).toUpperCase())}</div>
          <div>
            <div class="font-semibold text-sm text-foreground">${escHtml(name)}</div>
            <div class="text-xs text-muted-foreground">${escHtml(conv.customer_phone)}</div>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <span class="badge bg-green-100 text-green-800 border-transparent">● Open</span>
          <button id="ai-toggle-btn" class="btn btn-secondary btn-sm" title="Toggle AI" onclick="toggleAI('${conv.id}', this)">
            <i class="ph-bold ph-robot"></i> <span id="ai-toggle-lbl">AI Off</span>
          </button>
          <button class="btn btn-secondary btn-sm"><i class="ph-bold ph-dots-three"></i></button>
        </div>
      </div>
      <div class="flex-1 overflow-y-auto p-4 flex flex-col gap-3 bg-gray-50/50" id="inbox-messages">
        <div class="text-center text-muted-foreground/50 text-sm py-10">Loading messages...</div>
      </div>
      <div class="bg-background border-t border-border flex-shrink-0">
        <div class="flex gap-0 px-4 border-b border-border">
          <div class="px-4 py-2 text-xs font-semibold text-primary border-b-2 border-primary cursor-pointer">Reply</div>
          <div class="px-4 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground cursor-pointer">Note</div>
        </div>
        <div class="flex gap-2 p-3">
          <input type="file" id="inbox-media-input" accept="image/*,audio/*,video/*,.pdf,.doc,.docx" style="display:none;">
          <button id="inbox-attach-btn" class="btn btn-secondary btn-sm flex-shrink-0" title="Attach file">
            <i class="ph ph-paperclip text-lg"></i>
          </button>
          <input type="text" id="inbox-reply-input" class="form-input flex-1" placeholder="Type a message...">
          <button id="inbox-reply-send" class="btn btn-primary btn-sm flex-shrink-0">
            <span class="btn-text"><i class="ph ph-paper-plane-tilt text-lg"></i></span>
            <div class="spinner"></div>
          </button>
        </div>
      </div>
    `;

    // Render customer profile panel
    const panel = document.getElementById('inbox-customer-panel');
    if (panel) {
      panel.innerHTML = `
        <div class="p-4 border-b border-border">
          <div class="flex items-center gap-3 mb-4">
            <div class="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold flex-shrink-0">${escHtml(name.charAt(0).toUpperCase())}</div>
            <div>
              <div class="font-bold text-sm text-foreground">${escHtml(name)}</div>
              <div class="text-[11px] text-muted-foreground">WhatsApp Customer</div>
            </div>
          </div>
          <div class="flex items-start gap-2 text-xs text-muted-foreground mb-2"><i class="ph ph-phone mt-0.5 text-muted-foreground/70"></i><span class="text-foreground font-medium">${escHtml(conv.customer_phone)}</span></div>
        </div>
        <div class="p-4 border-b border-border">
          <div class="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-3">Stats</div>
          <div class="grid grid-cols-2 gap-2">
            <div class="bg-muted/50 border border-border rounded-md p-2 text-center"><div class="text-sm font-bold text-foreground">—</div><div class="text-[10px] uppercase text-muted-foreground mt-0.5">Orders</div></div>
            <div class="bg-muted/50 border border-border rounded-md p-2 text-center"><div class="text-sm font-bold text-foreground">—</div><div class="text-[10px] uppercase text-muted-foreground mt-0.5">Spent</div></div>
          </div>
        </div>
        <div class="p-4 border-b border-border">
          <div class="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-3">Conversation</div>
          <div class="flex items-start gap-2 text-xs text-muted-foreground mb-2"><i class="ph ph-clock mt-0.5 text-muted-foreground/70"></i><span>${conv.last_message_at ? new Date(conv.last_message_at).toLocaleDateString() : 'No messages'}</span></div>
          ${conv.last_message ? `<div class="text-xs text-muted-foreground mt-2 p-2 bg-muted/50 rounded-md border border-border">${escHtml(conv.last_message.slice(0,80))}${conv.last_message.length>80?'...':''}</div>` : ''}
        </div>
      `;
    }

    document.getElementById('inbox-reply-send').addEventListener('click', () => sendInboxReply(conv));
    document.getElementById('inbox-reply-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendInboxReply(conv); }
    });

    document.getElementById('inbox-attach-btn').addEventListener('click', () => {
      document.getElementById('inbox-media-input').click();
    });
    document.getElementById('inbox-media-input').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) sendInboxMedia(conv, file);
      e.target.value = '';
    });

    await loadMessages(conv.id);
    startMessagePolling(conv);
  }

  async function loadMessages(conversationId) {
    const messagesEl = document.getElementById('inbox-messages');
    try {
      const res = await authFetch(`/api/conversations/${conversationId}/messages`);
      const data = await res.json();
      const messages = data.messages || [];

      // Update AI toggle button state
      const aiBtn = document.getElementById('ai-toggle-btn');
      const aiLbl = document.getElementById('ai-toggle-lbl');
      if (aiBtn && aiLbl) {
        const on = data.ai_enabled;
        aiBtn.style.background   = on ? 'var(--indigo)' : '';
        aiBtn.style.color        = on ? '#fff' : '';
        aiBtn.style.borderColor  = on ? 'var(--indigo)' : '';
        aiLbl.textContent        = on ? 'AI On' : 'AI Off';
      }

      if (messages.length === 0) {
        messagesEl.innerHTML = '<div class="inbox-placeholder">No messages yet.</div>';
        return;
      }

      messagesEl.innerHTML = '';
      messages.forEach(msg => {
        const isOut = msg.direction === 'outbound';
        const time  = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const wrapper = document.createElement('div');
        wrapper.className = `flex flex-col max-w-[75%] ${isOut ? 'self-end items-end' : 'self-start items-start'}`;
        wrapper.innerHTML = `
          <div class="${isOut ? 'bg-primary text-primary-foreground p-2.5 rounded-2xl rounded-tr-sm' : 'bg-muted text-foreground p-2.5 rounded-2xl rounded-tl-sm border border-border shadow-sm'} text-sm leading-relaxed break-words">${renderMsgBody(msg.body)}</div>
          <div class="text-[10px] text-muted-foreground mt-1">${isOut ? 'You · ' : ''}${time}</div>
        `;
        messagesEl.appendChild(wrapper);
      });

      messagesEl.scrollTop = messagesEl.scrollHeight;
    } catch (err) {
      messagesEl.innerHTML = `<div class="inbox-placeholder" style="color:var(--red);">Failed to load messages</div>`;
    }
  }

  async function sendInboxReply(conv) {
    const input  = document.getElementById('inbox-reply-input');
    const btn    = document.getElementById('inbox-reply-send');
    const body   = input.value.trim();
    if (!body) return;

    input.value = '';
    btn.classList.add('btn-loading');
    btn.disabled = true;
    input.disabled = true;

    try {
      const res = await authFetch(`/api/conversations/${conv.id}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: body }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to send');

      const messagesEl = document.getElementById('inbox-messages');
      const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const wrapper = document.createElement('div');
      wrapper.className = 'flex flex-col max-w-[75%] self-end items-end';
      wrapper.innerHTML = `
        <div class="bg-primary text-primary-foreground p-2.5 rounded-2xl rounded-tr-sm text-sm leading-relaxed break-words">${escHtml(body)}</div>
        <div class="text-[10px] text-muted-foreground mt-1">You · ${time}</div>
      `;
      messagesEl.appendChild(wrapper);
      messagesEl.scrollTop = messagesEl.scrollHeight;

      // Update preview in sidebar
      const sidebarItem = document.querySelector(`.inbox-conv-item[data-id="${conv.id}"] .inbox-conv-preview`);
      if (sidebarItem) sidebarItem.textContent = body.slice(0, 45);

      showToast('Message sent!', 'success');
    } catch (err) {
      showToast('Failed to send: ' + err.message, 'error');
      input.value = body;
    } finally {
      btn.classList.remove('btn-loading');
      btn.disabled = false;
      input.disabled = false;
      input.focus();
    }
  }

  window.toggleAI = async function(convId, btn) {
    const lbl = document.getElementById('ai-toggle-lbl');
    btn.disabled = true;
    try {
      const res = await authFetch(`/api/conversations/${convId}/ai`, { method: 'PATCH' });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      const on = data.ai_enabled;
      btn.style.background = on ? 'var(--indigo)' : '';
      btn.style.color = on ? '#fff' : '';
      btn.style.borderColor = on ? 'var(--indigo)' : '';
      lbl.textContent = on ? 'AI On' : 'AI Off';
      showToast(on ? '🤖 AI تلقائي شغال' : '🤖 AI تلقائي متوقف', on ? 'success' : 'info');
    } catch (err) {
      showToast('فشل: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  };

  async function sendInboxMedia(conv, file) {
    const btn = document.getElementById('inbox-attach-btn');
    btn.disabled = true;
    const origIcon = btn.innerHTML;
    btn.innerHTML = '<div class="spinner" style="width:16px;height:16px;border-width:2px;"></div>';
    try {
      const res = await authFetch(`/api/conversations/${conv.id}/send-media`, {
        method: 'POST',
        headers: {
          'Content-Type': file.type,
          'X-Filename': file.name,
        },
        body: file,
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to send');

      const messagesEl = document.getElementById('inbox-messages');
      const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const wrapper = document.createElement('div');
      wrapper.className = 'flex flex-col max-w-[75%] self-end items-end';
      const bodyText = `[media:${data.waType}:${data.mediaId}]`;
      wrapper.innerHTML = `
        <div class="bg-primary text-primary-foreground p-2.5 rounded-2xl rounded-tr-sm text-sm leading-relaxed break-words">${renderMsgBody(bodyText)}</div>
        <div class="text-[10px] text-muted-foreground mt-1">You · ${time}</div>
      `;
      messagesEl.appendChild(wrapper);
      messagesEl.scrollTop = messagesEl.scrollHeight;
      showToast('File sent!', 'success');
    } catch (err) {
      showToast('Failed to send file: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = origIcon;
    }
  }

  function inboxRelativeTime(date) {
    const diff = Date.now() - date;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'now';
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    return `${Math.floor(hours / 24)}d`;
  }

  function escHtml(str) {
    const d = document.createElement('div');
    d.appendChild(document.createTextNode(String(str)));
    return d.innerHTML;
  }

  function renderMsgBody(body) {
    const mediaMatch = body.match(/^\[media:(image|audio|video|document):([^\]:]+)(?::([^\]]+))?\](.*)?$/s);
    if (!mediaMatch) return escHtml(body);
    const [, mediaType, mediaId, extra, caption] = mediaMatch;
    const src = `/api/media/${mediaId}`;
    const cap = caption?.trim() ? `<div style="font-size:12px;margin-top:4px;opacity:.8;">${escHtml(caption.trim())}</div>` : '';
    if (mediaType === 'image') {
      return `<img src="${src}" style="max-width:220px;max-height:220px;border-radius:8px;display:block;cursor:pointer;" onclick="window.open('${src}','_blank')" onerror="this.outerHTML='[image]'">${cap}`;
    }
    if (mediaType === 'audio') {
      return `<audio controls style="max-width:220px;"><source src="${src}"></audio>`;
    }
    if (mediaType === 'video') {
      return `<video controls style="max-width:220px;max-height:180px;border-radius:8px;"><source src="${src}"></video>${cap}`;
    }
    if (mediaType === 'document') {
      return `<a href="${src}" target="_blank" style="display:flex;align-items:center;gap:6px;text-decoration:none;color:inherit;"><i class="ph-bold ph-file-text" style="font-size:20px;"></i><span>${escHtml(extra || 'Document')}</span></a>`;
    }
    return escHtml(body);
  }

  async function loadCustomers(platformId) {
    const loading = document.getElementById('customers-loading');
    const table = document.getElementById('customers-table');
    const empty = document.getElementById('customers-empty');
    try {
      const res = await authFetch(`/api/stores/${platformId}/customers`);
      const data = await res.json();
      loading.style.display = 'none';
      if (!data.customers || data.customers.length === 0) { empty.style.display = 'block'; return; }
      const tbody = document.getElementById('customers-tbody');
      tbody.innerHTML = data.customers.map(c => {
        const name = [c.first_name, c.last_name].filter(Boolean).join(' ') || '—';
        return `<tr>
          <td class="font-medium text-foreground">${name}</td>
          <td class="text-muted-foreground">${c.email || '—'}</td>
          <td class="text-muted-foreground">${c.phone || '—'}</td>
          <td>${c.orders_count ?? 0}</td>
          <td class="font-medium">$${parseFloat(c.total_spent || 0).toFixed(2)}</td>
        </tr>`;
      }).join('');
      table.style.display = 'table';
    } catch (e) {
      loading.textContent = 'Failed to load customers.';
    }
  }

});
