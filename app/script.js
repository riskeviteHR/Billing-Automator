
let state = { firm: null, tasks: [], clients: [], companies: [], activeCompanyId: null, gstTab: 'gst', adminUsername: '', report: { type: 'sales' }, categoryFilter: 'all', timeFilter: 'all', timeFrom: '', timeTo: '', vouchers: [], voucherSearch: '', advances: {}, reminders: [], currentTaskId: null, paymentTaskId: null, toastTimer: null, theme: 'light' };
const RUPEE_SYMBOL = '\u20B9';
const CATEGORIES = ['ITR Return', 'GST Return', 'Audit', 'Accounting', 'ROC Filing', 'Other'];
document.addEventListener('DOMContentLoaded', async () => {
  loadThemePreference();
  initUpdater();
  if (await handleDirectFileLaunch()) return;
  const licensed = await checkLicenseStatus();
  if (!licensed) {
    showStartupMessage('Unable to Load Application', 'The local server is not responding. Please start the app using `npm start`, `npm run dev`, or the packaged desktop application.');
    return;
  }
  const auth = await fetchAuthStatus();
  if (!auth.authenticated) { showLoginOverlay(); return; }
  await loadInitialData();
  setupEventListeners();
});
async function handleDirectFileLaunch() {
  if (location.protocol !== 'file:') return false;
  showStartupMessage('Opening Invoice Utility', 'This page was opened directly from a file. Trying to connect to the local app at http://localhost:3000 ...');
  try {
    const response = await fetch('http://localhost:3000/license-status');
    if (response.ok) {
      location.href = 'http://localhost:3000';
      return true;
    }
  } catch { /* fall through to help message */ }
  showStartupMessage('Open the Local App', 'This tool should be opened through the local server or desktop app, not by double-clicking `app/index.html`. Please run `npm start`, `npm run dev`, or open the packaged application from the `dist` folder.');
  return true;
}
function showStartupMessage(title, message) {
  document.querySelectorAll('.view').forEach((v) => v.classList.add('hidden'));
  document.getElementById('sidebar').classList.add('hidden');
  document.getElementById('startup-title').innerText = title;
  document.getElementById('startup-message').innerText = message;
  document.getElementById('startup-view').classList.remove('hidden');
}
function loadThemePreference() {
  const savedTheme = localStorage.getItem('invoice-theme');
  state.theme = savedTheme === 'dark' ? 'dark' : 'light';
  applyTheme(state.theme);
}
function applyTheme(theme) {
  state.theme = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', state.theme);
  const label = document.getElementById('theme-toggle-label');
  const icon = document.getElementById('theme-toggle-icon');
  if (label) label.innerText = state.theme === 'dark' ? 'Light Mode' : 'Dark Mode';
  if (icon) icon.innerText = state.theme === 'dark' ? '☀️' : '🌙';
}
function toggleTheme() {
  const nextTheme = state.theme === 'dark' ? 'light' : 'dark';
  localStorage.setItem('invoice-theme', nextTheme);
  applyTheme(nextTheme);
}
function toggleSidebar() {
  const collapsed = document.getElementById('app').classList.toggle('sidebar-collapsed');
  localStorage.setItem('sidebar-collapsed', collapsed ? '1' : '0');
  const expandBtn = document.getElementById('sidebar-expand-btn');
  if (expandBtn) expandBtn.classList.toggle('hidden', !collapsed);
}
function restoreSidebarCollapseState() {
  const collapsed = localStorage.getItem('sidebar-collapsed') === '1';
  document.getElementById('app').classList.toggle('sidebar-collapsed', collapsed);
  const expandBtn = document.getElementById('sidebar-expand-btn');
  if (expandBtn) expandBtn.classList.toggle('hidden', !collapsed);
}
async function fetchAuthStatus() {
  try {
    const data = await (await fetch('http://localhost:3000/auth/status')).json();
    if (data.username) state.adminUsername = data.username;
    return data;
  } catch { return { authenticated: false }; }
}
function showLoginOverlay() {
  const overlay = document.getElementById('login-overlay');
  overlay.classList.remove('hidden');
  document.getElementById('login-passkey').focus();
  document.getElementById('login-form').onsubmit = async (e) => {
    e.preventDefault();
    const err = document.getElementById('login-error');
    err.classList.add('hidden');
    const res = await fetch('http://localhost:3000/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ passkey: document.getElementById('login-passkey').value }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { err.innerText = data.error || 'Login failed.'; err.classList.remove('hidden'); return; }
    if (!state.firm) { location.reload(); return; }
    // Mid-session re-login (expired session): keep page state intact.
    overlay.classList.add('hidden');
    document.getElementById('login-form').reset();
  };
}
async function logout() {
  try { await fetch('http://localhost:3000/auth/logout', { method: 'POST' }); } catch { /* reload regardless */ }
  location.reload();
}
function showPasswordModal() { document.getElementById('password-modal').classList.remove('hidden'); }
function closePasswordModal() { document.getElementById('password-modal').classList.add('hidden'); document.getElementById('password-form').reset(); }
async function savePassword(e) {
  e.preventDefault();
  const newPasskey = document.getElementById('pw_new').value;
  if (newPasskey.length < 4) return showToast('New passkey must be at least 4 characters.', 'error');
  if (newPasskey !== document.getElementById('pw_confirm').value) return showToast('New passkeys do not match.', 'error');
  try {
    await requestJson('http://localhost:3000/auth/change-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ currentPasskey: document.getElementById('pw_current').value, newPasskey }) }, { title: 'Updating passkey...', message: 'Saving new passkey.' });
    closePasswordModal();
    showToast('Passkey updated.');
  } catch (error) { showToast(error.message, 'error'); }
}
async function checkLicenseStatus() {
  try {
    const res = await fetch('http://localhost:3000/license-status');
    const data = await res.json();
    document.getElementById('machine-id-display').innerText = data.machineId;
    document.getElementById('license-overlay').classList.toggle('hidden', data.isLicensed);
    if (!data.isLicensed) setupActivationListeners();
    return !!data.isLicensed;
  } catch { return false; }
}
function setupActivationListeners() {
  const btn = document.getElementById('activate-btn');
  btn.onclick = async () => {
    const key = document.getElementById('license-input').value.trim().toUpperCase();
    if (!key) return;
    const res = await fetch('http://localhost:3000/activate-license', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key }) });
    const data = await res.json();
    if (data.success) location.reload(); else { const err = document.getElementById('license-error'); err.innerText = data.error || 'Activation failed'; err.classList.remove('hidden'); }
  };
}
async function loadInitialData() {
  const profile = await getJson('http://localhost:3000/profile');
  if (!profile.firm_name) return showView('onboarding-view');
  state.firm = { name: profile.firm_name, partner: profile.partner_name, phone: profile.phone, email: profile.email, gstn: profile.gstn, upi_id: profile.upi_id, logo: profile.logo, bank_name: profile.bank_name, bank_account: profile.bank_account, bank_ifsc: profile.bank_ifsc };
  await Promise.all([fetchTasks(), fetchClients(), populateDashboardCompanySelect()]);
  updateDashboardInfo();
  showView('dashboard-view');
  setActiveNav('dashboard');
  const billsFilter = document.getElementById('bills-filter');
  if (billsFilter) billsFilter.value = state.gstTab;
  restoreBillboardCollapseState();
  restoreSidebarCollapseState();
}
async function fetchTasks() { state.tasks = await getJson('http://localhost:3000/tasks'); renderTasks(); updateStats(); renderBillboard(); fetchReminders(); }
async function fetchClients() { state.clients = await getJson('http://localhost:3000/clients'); updateClientSelects(); renderClientsTable(); }
function showView(id) {
  document.querySelectorAll('.view').forEach((v) => v.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
  // Sidebar shows everywhere post-login except true first-run onboarding (no firm yet).
  document.getElementById('sidebar').classList.toggle('hidden', id === 'onboarding-view' && !state.firm);
}
async function openInvoicesFolder() { await fetch('http://localhost:3000/open-folder'); }
function showProgress(title, message) {
  document.getElementById('progress-title').innerText = title || 'Working...';
  document.getElementById('progress-message').innerText = message || 'Please wait while we process your request.';
  document.getElementById('progress-modal').classList.remove('hidden');
}
function hideProgress() {
  document.getElementById('progress-modal').classList.add('hidden');
}
function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  toast.innerText = message;
  toast.className = `toast toast-${type}`;
  if (state.toastTimer) clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => {
    toast.className = 'toast hidden';
  }, 2800);
}
async function requestJson(url, options = {}, progress = null) {
  if (progress) showProgress(progress.title, progress.message);
  try {
    const response = await fetch(url, options);
    if (response.status === 401) { showLoginOverlay(); throw new Error('Session expired — please sign in again.'); }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Request failed.');
    return data;
  } finally {
    if (progress) hideProgress();
  }
}
async function getJson(url) {
  const response = await fetch(url);
  if (response.status === 401) { showLoginOverlay(); throw new Error('Session expired — please sign in again.'); }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Request failed.');
  return data;
}
const _requestJsonBase = requestJson;
requestJson = async function requestJsonWithFriendlyNetworkErrors(url, options = {}, progress = null) {
  try {
    return await _requestJsonBase(url, options, progress);
  } catch (error) {
    if (error instanceof TypeError && /fetch/i.test(error.message || '')) {
      throw new Error('Cannot reach the local app server. Please restart the desktop app and ensure the invoice workbook is not open in Excel.');
    }
    throw error;
  }
};
const _getJsonBase = getJson;
getJson = async function getJsonWithFriendlyNetworkErrors(url) {
  try {
    return await _getJsonBase(url);
  } catch (error) {
    if (error instanceof TypeError && /fetch/i.test(error.message || '')) {
      throw new Error('Cannot reach the local app server. Please restart the desktop app and ensure the invoice workbook is not open in Excel.');
    }
    throw error;
  }
};
async function offerWhatsappAutomation(action, exportPath) {
  const sendNow = window.confirm(`The ${action === 'send' ? 'invoice' : 'reminder'} Excel file is ready.\n\nDo you want to send the ${action === 'send' ? 'invoices' : 'reminders'} now?`);
  if (!sendNow) {
    showToast(`File created successfully at ${exportPath}`);
    return;
  }
  try {
    const data = await requestJson('http://localhost:3000/run-whatsapp-automation', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: exportPath }) }, { title: action === 'send' ? 'Starting invoice sending...' : 'Starting reminder sending...', message: 'Launching WhatsApp automation and selecting the generated Excel file.' });
    showToast(data.message || 'WhatsApp automation started successfully.');
  } catch (error) {
    showToast(`Automation Failed: ${error.message}`, 'error');
  }
}
let _paymentDisplayResolve = null;
function askPaymentDisplay() {
  return new Promise((resolve) => {
    _paymentDisplayResolve = resolve;
    document.getElementById('payment-display-modal').classList.remove('hidden');
  });
}
function resolvePaymentDisplay(choice) {
  document.getElementById('payment-display-modal').classList.add('hidden');
  if (_paymentDisplayResolve) { _paymentDisplayResolve(choice); _paymentDisplayResolve = null; }
}
function setupEventListeners() {
  document.getElementById('firm-details-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const logoInput = document.getElementById('logo');
    const save = async (logo) => {
      await fetch('http://localhost:3000/profile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ firm_name: document.getElementById('firm_name').value, partner_name: document.getElementById('partner_name').value, phone: document.getElementById('phone').value, email: document.getElementById('email').value, gstn: document.getElementById('gstn').value, upi_id: document.getElementById('upi_id_setup').value, logo, bank_name: document.getElementById('bank_name').value, bank_account: document.getElementById('bank_account').value, bank_ifsc: document.getElementById('bank_ifsc').value }) });
      await loadInitialData();
    };
    if (logoInput.files && logoInput.files[0]) { const reader = new FileReader(); reader.onload = (ev) => save(ev.target.result); reader.readAsDataURL(logoInput.files[0]); } else await save(state.firm?.logo || '');
  });
  document.getElementById('task-form')?.addEventListener('submit', saveTask);
  document.getElementById('client-form')?.addEventListener('submit', saveClient);
  document.getElementById('company-form')?.addEventListener('submit', saveNewCompany);
  document.getElementById('voucher-form')?.addEventListener('submit', saveVoucher);
  document.getElementById('password-form')?.addEventListener('submit', savePassword);
  document.getElementById('payment-form')?.addEventListener('submit', savePayment);
  document.addEventListener('keydown', handleKeyboardShortcuts);
  document.addEventListener('mousedown', closeComboListsOnOutsideClick);
  document.addEventListener('mousedown', (event) => {
    if (openPicker && !openPicker.panel.contains(event.target) && event.target.id !== `${openPicker.inputId}_display`) closeDatePicker();
  });
}
function activeViewId() { const v = Array.from(document.querySelectorAll('.view')).find((el) => !el.classList.contains('hidden')); return v ? v.id : ''; }
function openModalEl() { return Array.from(document.querySelectorAll('.modal')).find((el) => !el.classList.contains('hidden')) || null; }
function selectedTaskIds() { return Array.from(document.querySelectorAll('.row-select:checked')).map((cb) => cb.dataset.id); }
function isTypingTarget() { const t = document.activeElement; const tag = (t?.tagName || '').toLowerCase(); return ['input', 'textarea', 'select'].includes(tag) || t?.isContentEditable; }
function submitOpenModal(modal) { const form = modal.querySelector('form'); if (form) { if (form.requestSubmit) form.requestSubmit(); else form.querySelector('[type=submit]')?.click(); return true; } modal.querySelector('.btn-primary')?.click(); return true; }
function closeTopModal(modal) { const closeBtn = modal.querySelector('.close-btn, .btn-outline'); if (closeBtn) closeBtn.click(); else modal.classList.add('hidden'); }
function contextNew(view) {
  if (view === 'clients-view') return showAddClientModal();
  if (view === 'vouchers-view') return showVoucherModal();
  showView('dashboard-view'); setActiveNav('dashboard'); showAddTaskModal();
}
function focusSearch(view) {
  const id = view === 'clients-view' ? 'client-filter' : view === 'vouchers-view' ? 'voucher-search' : 'filter-search';
  const el = document.getElementById(id); if (el) { el.focus(); el.select?.(); }
}
function refreshCurrentView() {
  const view = activeViewId();
  if (view === 'clients-view') fetchClients();
  else if (view === 'vouchers-view') fetchVouchers();
  else if (view === 'reminders-view') fetchReminders();
  else if (view === 'reports-view') runReport();
  else fetchTasks();
  showToast('Refreshed.');
}
function handleKeyboardShortcuts(e) {
  const key = String(e.key || '').toLowerCase();
  const ctrl = e.ctrlKey || e.metaKey;
  const modal = openModalEl();
  const view = activeViewId();
  const typing = isTypingTarget();

  if (key === 'escape') { if (openPicker) { e.preventDefault(); closeDatePicker(); } else if (modal) { e.preventDefault(); closeTopModal(modal); } else if (typing) document.activeElement.blur(); return; }
  if (key === 'f5' && !ctrl) { e.preventDefault(); refreshCurrentView(); return; }
  if (ctrl && (key === 'enter' || key === 's')) { e.preventDefault(); if (modal) submitOpenModal(modal); return; }

  if (!ctrl) {
    if (key === 'delete' && !modal && !typing) { const ids = selectedTaskIds(); if (ids.length) { e.preventDefault(); deleteTask(ids[0]); } return; }
    // Legacy Alt shortcuts (kept for continuity).
    if (e.altKey && !e.shiftKey && !typing) {
      if (key === 'r') { e.preventDefault(); showReportsView(); }
      else if (key === 'v') { e.preventDefault(); showVouchersView(); }
      else if (key === 'c') { e.preventDefault(); showClientsView(); showAddClientModal(); }
      else if (key === 't') { e.preventDefault(); contextNew('dashboard-view'); }
    }
    return;
  }

  if (modal) return; // while a modal is open, only Save/Enter/Esc (handled above) act

  if (e.shiftKey) {
    if (key === 't') { e.preventDefault(); showView('dashboard-view'); setActiveNav('dashboard'); showAddTaskModal(); }
    else if (key === 'c') { e.preventDefault(); showAddClientModal(); }
    else if (key === 'v') { e.preventDefault(); showVoucherModal(); }
    else if (key === 'e') { e.preventDefault(); if (view === 'reports-view') downloadReport('xlsx'); else showReportsView(); }
    return;
  }

  const ids = selectedTaskIds();
  switch (key) {
    case 'n': e.preventDefault(); contextNew(view); break;
    case 'f': e.preventDefault(); focusSearch(view); break;
    case 'e': e.preventDefault(); if (ids.length === 1) editTask(ids[0]); else showToast('Select exactly one row to edit.', 'error'); break;
    case 'd': e.preventDefault(); if (ids.length) deleteTask(ids[0]); else showToast('Select a row to delete.', 'error'); break;
    case 'p': { e.preventDefault(); const t = ids.length ? state.tasks.find((x) => x.id === ids[0]) : null; if (t && t.invoiceNo) openInvoice(t.id); else showToast('Select an invoiced row to print.', 'error'); break; }
    case 'i': e.preventDefault(); if (ids.length) batchProcess('generate'); else showToast('Select rows to generate an invoice.', 'error'); break;
    case 'r': e.preventDefault(); if (ids.length) batchProcess('reminder'); else showRemindersView(); break;
    default: break;
  }
}
function showHelpView() { showView('help-view'); setActiveNav('help'); }
// --- Auto-update UI --------------------------------------------------------
// window.updater is exposed by preload.js via contextBridge; it only exists
// inside the Electron shell, so every call here is guarded.
function initUpdater() {
  if (!window.updater) return; // running in a plain browser tab / dev fetch, not Electron
  window.updater.getAppVersion().then((v) => {
    const el = document.getElementById('app-version');
    if (el) el.innerText = v || '—';
  }).catch(() => {});
  window.updater.onStatus((payload) => applyUpdateStatus(payload));
  window.updater.onProgress((payload) => applyUpdateProgress(payload));
}
function applyUpdateStatus(payload) {
  const statusEl = document.getElementById('update-status');
  const checkBtn = document.getElementById('check-update-btn');
  const restartBtn = document.getElementById('restart-update-btn');
  const progressWrap = document.getElementById('update-progress-wrap');
  if (!statusEl) return;
  statusEl.innerText = payload.message || '';
  statusEl.classList.toggle('update-status-error', payload.state === 'error');
  if (checkBtn) checkBtn.disabled = payload.state === 'checking' || payload.state === 'available';
  if (restartBtn) restartBtn.classList.toggle('hidden', payload.state !== 'downloaded');
  if (progressWrap && (payload.state === 'up-to-date' || payload.state === 'error' || payload.state === 'checking')) {
    progressWrap.classList.add('hidden');
  }
  if (payload.state === 'downloaded') showToast('Update downloaded — click "Restart and Update" to install.', 'success');
  if (payload.state === 'error') showToast(payload.message || 'Update check failed.', 'error');
}
function applyUpdateProgress(payload) {
  const wrap = document.getElementById('update-progress-wrap');
  const fill = document.getElementById('update-progress-fill');
  const label = document.getElementById('update-progress-label');
  if (!wrap || !fill || !label) return;
  wrap.classList.remove('hidden');
  const pct = Math.max(0, Math.min(100, payload.percent || 0));
  fill.style.width = `${pct}%`;
  label.innerText = `${pct}%`;
}
async function checkForUpdates() {
  if (!window.updater) { showToast('Updates are only available in the installed desktop app.', 'error'); return; }
  const statusEl = document.getElementById('update-status');
  if (statusEl) statusEl.innerText = 'Checking for updates...';
  try {
    const result = await window.updater.checkForUpdates();
    if (!result.ok) {
      if (statusEl) statusEl.innerText = result.message || 'Updates are only available in the installed app.';
    }
  } catch (error) {
    showToast(error.message || 'Update check failed.', 'error');
  }
}
function restartAndUpdate() {
  if (!window.updater) return;
  window.updater.restartAndInstall();
}
function updateDashboardInfo() { document.getElementById('display-firm-name').innerText = state.firm.name; document.getElementById('display-partner-name').innerText = `Owner: ${state.firm.partner}`; }
function showSettings() { document.getElementById('firm_name').value = state.firm.name || ''; document.getElementById('partner_name').value = state.firm.partner || ''; document.getElementById('phone').value = state.firm.phone || ''; document.getElementById('email').value = state.firm.email || ''; document.getElementById('gstn').value = state.firm.gstn || ''; document.getElementById('upi_id_setup').value = state.firm.upi_id || ''; document.getElementById('bank_name').value = state.firm.bank_name || ''; document.getElementById('bank_account').value = state.firm.bank_account || ''; document.getElementById('bank_ifsc').value = state.firm.bank_ifsc || ''; showView('onboarding-view'); setActiveNav('settings'); }
function updateClientSelects() { const select = document.getElementById('client_select'); while (select.options.length > 2) select.remove(2); state.clients.forEach((client) => { const option = document.createElement('option'); option.value = client.name; option.innerText = client.name; select.appendChild(option); }); resetSelectSearch('client_select'); }
function showClientsView() { fetchClients(); showView('clients-view'); setActiveNav('clients'); }
function showReportsView() {
  const select = document.getElementById('report-client');
  const current = select.value;
  while (select.options.length > 1) select.remove(1);
  state.clients.forEach((client) => { const option = document.createElement('option'); option.value = client.name; option.innerText = client.name; select.appendChild(option); });
  select.value = current;
  populateReportFYSelect();
  showView('reports-view');
  setActiveNav('reports');
  runReport();
}
// Indian financial year: April through March. Mirrors the server's fyLabel() so the FY
// picker here always matches what's actually stored on invoices.
function currentFYLabel() {
  const now = new Date();
  const startYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return `${String(startYear).slice(-2)}-${String(startYear + 1).slice(-2)}`;
}
function fyDateRange(fy) {
  const startYear = 2000 + parseInt(fy.slice(0, 2), 10);
  return { from: `${startYear}-04-01`, to: `${startYear + 1}-03-31` };
}
function populateReportFYSelect() {
  const select = document.getElementById('report-fy');
  if (!select) return;
  const current = select.value;
  const known = new Set(state.tasks.map((t) => t.invoiceFY).filter(Boolean));
  known.add(currentFYLabel());
  const years = [...known].sort().reverse();
  select.innerHTML = '<option value="">All Years</option>' + years.map((fy) => `<option value="${fy}">FY ${fy}</option>`).join('');
  select.value = years.includes(current) ? current : '';
}
function applyReportFYFilter(fy) {
  if (!fy) { setDateValue('report-from', ''); setDateValue('report-to', ''); }
  else { const { from, to } = fyDateRange(fy); setDateValue('report-from', from); setDateValue('report-to', to); }
  runReport();
}
async function showRemindersView() {
  showView('reminders-view');
  setActiveNav('reminders');
  await Promise.all([loadGlobalReminderToggle(), populateReminderCompanyFilter(), fetchReminders(), fetchReminderHistory()]);
}
async function loadGlobalReminderToggle() {
  try {
    const data = await getJson('http://localhost:3000/reminders/global');
    document.getElementById('auto-reminders-global').checked = !!data.enabled;
  } catch { /* leave default */ }
}
async function toggleGlobalReminders(enabled) {
  try {
    await requestJson('http://localhost:3000/reminders/global', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled }) }, { title: 'Updating...', message: 'Saving the Automatic Reminders setting.' });
    showToast(enabled ? 'Automatic reminders enabled.' : 'Automatic reminders disabled.');
    await fetchReminders();
  } catch (error) {
    document.getElementById('auto-reminders-global').checked = !enabled;
    showToast(error.message, 'error');
  }
}
async function populateReminderCompanyFilter() {
  const sel = document.getElementById('reminder-filter-company');
  if (!sel) return;
  const current = sel.value || 'all';
  try {
    const companies = state.companies && state.companies.length ? state.companies : (await getJson('http://localhost:3000/companies')).companies || [];
    sel.innerHTML = '<option value="all">All Companies</option>' + companies.map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`).join('');
    sel.value = current;
  } catch { /* leave as-is */ }
}
async function fetchReminders() {
  try {
    const billType = document.getElementById('reminder-filter-billtype')?.value || 'all';
    const company = document.getElementById('reminder-filter-company')?.value || 'all';
    const data = await getJson(`http://localhost:3000/reminders?billType=${billType}&company=${encodeURIComponent(company)}`);
    state.reminders = data.reminders || [];
    renderReminders();
    updateBell(state.reminders.filter((r) => r.due).length);
  } catch (error) { /* reminders are non-critical for the dashboard */ }
}
function updateBell(count) {
  const bell = document.getElementById('bell-count');
  if (!bell) return;
  bell.innerText = count;
  bell.classList.toggle('hidden', count <= 0);
}
function renderReminders() {
  const tbody = document.getElementById('reminders-list'); tbody.innerHTML = '';
  const searchEl = document.getElementById('reminder-search');
  const q = searchEl ? searchEl.value.trim().toLowerCase() : '';
  const filtered = (state.reminders || []).filter((r) => !q || r.invoiceNo.toLowerCase().includes(q) || r.party.toLowerCase().includes(q));
  filtered.forEach((r) => {
    let badge = 'badge-open', label = 'Off';
    if (r.active) { badge = r.due ? 'badge-red' : 'badge-green'; label = r.due ? 'Due now' : 'Scheduled'; }
    const safeInv = r.invoiceNo.replace(/'/g, "\\'");
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${escapeHtml(r.invoiceNo)}</td><td>${escapeHtml(r.party)}</td><td>${escapeHtml(r.company)}</td><td class="num">${RUPEE_SYMBOL}${Number(r.amountDue).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td><td>${r.lastReminderAt ? formatDateTime(r.lastReminderAt) : '—'}</td><td>${formatDate(r.nextReminderAt)}</td><td><span class="badge ${badge}">${label}</span></td><td><label class="switch"><input type="checkbox" ${r.invoiceEnabled ? 'checked' : ''} onchange="toggleInvoiceReminder('${safeInv}', this.checked)"><span class="slider round"></span></label></td>`;
    tbody.appendChild(tr);
  });
  document.getElementById('reminders-empty').classList.toggle('hidden', filtered.length > 0);
  document.getElementById('reminders-empty').innerText = q ? 'No invoices match your search.' : 'No unpaid invoices to remind about.';
}
async function toggleInvoiceReminder(invoiceNo, enabled) {
  try {
    await requestJson('http://localhost:3000/reminders/invoice-toggle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ invoiceNo, enabled }) }, { title: 'Updating...', message: 'Saving the reminder toggle for this invoice.' });
    showToast(enabled ? 'Reminders enabled for this invoice.' : 'Reminders disabled for this invoice.');
    await fetchReminders();
  } catch (error) { showToast(error.message, 'error'); await fetchReminders(); }
}
async function fetchReminderHistory() {
  try {
    const company = document.getElementById('reminder-filter-company')?.value || 'all';
    const data = await getJson(`http://localhost:3000/reminders/history?company=${encodeURIComponent(company)}`);
    state.reminderHistory = data.history || [];
    renderReminderHistory();
  } catch { /* history is non-critical */ }
}
function renderReminderHistory() {
  const tbody = document.getElementById('reminder-history-list'); if (!tbody) return;
  tbody.innerHTML = '';
  (state.reminderHistory || []).forEach((h) => {
    const badge = h.status === 'Sent' ? 'badge-green' : 'badge-red';
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${formatDateTime(h.sentAt)}</td><td>${escapeHtml(h.party)}</td><td>${escapeHtml(h.company)}</td><td>${escapeHtml(h.invoiceNo)}</td><td>${escapeHtml(h.channel)}</td><td><span class="badge ${badge}">${escapeHtml(h.status)}</span></td><td>${escapeHtml(h.failureReason || '-')}</td>`;
    tbody.appendChild(tr);
  });
  document.getElementById('reminder-history-empty').classList.toggle('hidden', (state.reminderHistory || []).length > 0);
}
// Mirrors the server's reminder cadence (first reminder 3 days after the invoice/due date,
// then every 3 days) purely for display — the server is the source of truth for sending.
function nextReminderDateFor(task) {
  const base = task.lastReminderAt ? new Date(task.lastReminderAt) : new Date(`${task.invoiceDate || task.date}T00:00:00`);
  if (isNaN(base.getTime())) return '';
  base.setDate(base.getDate() + 3);
  return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}-${String(base.getDate()).padStart(2, '0')}`;
}
function formatDateTime(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function setReportType(type) {
  state.report.type = type;
  document.querySelectorAll('.tab-btn[data-report]').forEach((btn) => btn.classList.toggle('active', btn.dataset.report === type));
  document.getElementById('report-client-wrap').classList.toggle('hidden', type !== 'ledger');
  document.getElementById('report-tally-btn').classList.toggle('hidden', !['sales', 'gst', 'nongst'].includes(type));
  runReport();
}
function reportQuery() {
  const params = new URLSearchParams();
  const from = document.getElementById('report-from').value; if (from) params.set('from', from);
  const to = document.getElementById('report-to').value; if (to) params.set('to', to);
  if (state.report.type === 'ledger') params.set('client', document.getElementById('report-client').value);
  return params.toString();
}
function renderReportMessage(message) {
  document.querySelector('#report-table thead').innerHTML = '';
  document.querySelector('#report-table tbody').innerHTML = '';
  document.querySelector('#report-table tfoot').innerHTML = '';
  const empty = document.getElementById('report-empty');
  empty.innerText = message;
  empty.classList.remove('hidden');
}
async function runReport() {
  if (document.getElementById('reports-view').classList.contains('hidden')) return;
  if (state.report.type === 'ledger' && !document.getElementById('report-client').value) return renderReportMessage('Select a client to view the party ledger.');
  try {
    const data = await getJson(`http://localhost:3000/reports/${state.report.type}?${reportQuery()}`);
    const fmt = (v, isNum) => isNum && v !== '' ? Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2 }) : (v ?? '');
    document.querySelector('#report-table thead').innerHTML = `<tr>${data.columns.map((col) => `<th${col.num ? ' class="num"' : ''}>${col.header}</th>`).join('')}</tr>`;
    document.querySelector('#report-table tbody').innerHTML = data.rows.map((row) => `<tr>${row.map((v, i) => `<td${data.columns[i].num ? ' class="num"' : ''}>${escapeHtml(String(fmt(v, data.columns[i].num)))}</td>`).join('')}</tr>`).join('');
    document.querySelector('#report-table tfoot').innerHTML = data.totals && data.rows.length ? `<tr>${data.totals.map((v, i) => `<td${data.columns[i].num ? ' class="num"' : ''}>${fmt(v, data.columns[i].num)}</td>`).join('')}</tr>` : '';
    const empty = document.getElementById('report-empty');
    empty.innerText = 'No data for the selected filters.';
    empty.classList.toggle('hidden', data.rows.length > 0);
  } catch (error) { showToast(error.message, 'error'); }
}
function downloadReport(format) {
  if (state.report.type === 'ledger' && !document.getElementById('report-client').value) return showToast('Select a client to download the party ledger.', 'error');
  const link = document.createElement('a');
  link.href = `http://localhost:3000/reports/${state.report.type}/download?format=${format}&${reportQuery()}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
}
async function fetchVouchers() {
  const data = await getJson('http://localhost:3000/vouchers');
  state.vouchers = data.vouchers || [];
  state.advances = data.advances || {};
  renderVouchers();
  renderAdvances();
}
function renderVouchers() {
  const tbody = document.getElementById('vouchers-list'); tbody.innerHTML = '';
  const search = state.voucherSearch.trim().toLowerCase();
  const filtered = state.vouchers.filter((v) => {
    if (!search) return true;
    const haystack = [
      v.voucherNo,
      formatDate(v.date),
      v.party,
      Number(v.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 }),
      v.reference,
      v.mode,
      v.invoiceNo
    ].join(' ').toLowerCase();
    return haystack.includes(search);
  });
  filtered.forEach((v) => {
    let adj;
    if (v.adjustmentType === 'Invoice') {
      adj = `<span class="badge badge-completed">${escapeHtml(v.invoiceNo || 'Invoice')}</span>`;
      if (Number(v.advanceAmount) > 0.005) {
        adj += ` <span class="badge badge-open" title="Excess kept as advance">+ Advance ${RUPEE_SYMBOL}${Number(v.advanceAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>`;
      }
    } else {
      adj = '<span class="badge badge-open">Advance</span>';
    }
    const tr = document.createElement('tr');
    const vno = v.voucherNo.replace(/'/g, "\\'");
    tr.innerHTML = `<td><strong>${escapeHtml(v.voucherNo)}</strong></td><td>${formatDate(v.date)}</td><td>${escapeHtml(v.party)}</td><td>${RUPEE_SYMBOL}${Number(v.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td><td>${escapeHtml(v.mode)}</td><td>${escapeHtml(v.reference) || '-'}</td><td>${adj}</td><td><button class="btn btn-outline btn-sm btn-danger" onclick="deleteVoucher('${vno}')">Delete</button></td>`;
    tbody.appendChild(tr);
  });
  const empty = document.getElementById('vouchers-empty');
  empty.innerText = search ? 'No vouchers match the current search.' : 'No vouchers recorded yet.';
  empty.classList.toggle('hidden', filtered.length > 0);
}
function setVoucherSearch(value) {
  state.voucherSearch = String(value || '');
  renderVouchers();
}
function renderAdvances() {
  const panel = document.getElementById('advances-panel');
  const parties = Object.keys(state.advances).filter((p) => state.advances[p] > 0.005);
  if (!parties.length) { panel.classList.add('hidden'); panel.innerHTML = ''; return; }
  panel.classList.remove('hidden');
  panel.innerHTML = `<span class="advances-title">Advance / On-account balances:</span>` + parties.map((p) => `<span class="advance-chip">${escapeHtml(p)}: <strong>${RUPEE_SYMBOL}${Number(state.advances[p]).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong></span>`).join('');
}
async function showVouchersView() { showView('vouchers-view'); setActiveNav('vouchers'); try { await fetchVouchers(); } catch (error) { showToast(error.message, 'error'); } }
function showVoucherModal() {
  document.getElementById('voucher-form').reset();
  setDateValue('v_date', normalizeDateInput(new Date()));
  const sel = document.getElementById('v_party');
  while (sel.options.length > 1) sel.remove(1);
  state.clients.forEach((c) => { const o = document.createElement('option'); o.value = c.name; o.innerText = c.name; sel.appendChild(o); });
  resetSelectSearch('v_party');
  document.getElementById('v_adjust').value = 'invoice';
  document.getElementById('v_invoice').innerHTML = '<option value="">-- Select Invoice --</option>';
  resetSelectSearch('v_invoice');
  toggleAdjustmentMode();
  document.getElementById('voucher-modal').classList.remove('hidden');
}
function closeVoucherModal() { document.getElementById('voucher-modal').classList.add('hidden'); document.getElementById('voucher-form').reset(); }
function currentAdjustMode() { return document.getElementById('v_adjust').value; }
async function openReceiptEntry(taskId) {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) return;
  if (!task.invoiceNo) return showToast('Generate the invoice first, then use Receipt Entry.', 'error');
  if (task.status === 'Invoice Cancelled') return showToast('This invoice has been cancelled and cannot take payments.', 'error');
  showVoucherModal();
  const partySelect = document.getElementById('v_party');
  const amountInput = document.getElementById('v_amount');
  const referenceInput = document.getElementById('v_reference');
  const balanceDue = getBalanceDue(task);
  partySelect.value = task.clientName || '';
  syncComboInput('v_party');
  amountInput.value = balanceDue > 0 ? balanceDue.toFixed(2) : '';
  referenceInput.value = task.invoiceNo || '';
  document.getElementById('v_adjust').value = 'invoice';
  toggleAdjustmentMode();
  await onVoucherPartyChange();
  document.getElementById('v_invoice').value = task.invoiceNo || '';
  syncComboInput('v_invoice');
}
function toggleAdjustmentMode() {
  const isInvoice = currentAdjustMode() === 'invoice';
  document.getElementById('v_invoice_wrap').classList.toggle('hidden', !isInvoice);
  if (isInvoice) onVoucherPartyChange();
}
async function onVoucherPartyChange() {
  if (currentAdjustMode() !== 'invoice') return;
  const party = document.getElementById('v_party').value;
  const sel = document.getElementById('v_invoice');
  const hint = document.getElementById('v_invoice_hint');
  sel.innerHTML = '<option value="">-- Select Invoice --</option>';
  resetSelectSearch('v_invoice');
  if (!party) { hint.classList.add('hidden'); return; }
  try {
    const invoices = await getJson(`http://localhost:3000/vouchers/open-invoices?party=${encodeURIComponent(party)}`);
    invoices.forEach((inv) => { const o = document.createElement('option'); o.value = inv.invoiceNo; o.innerText = `${inv.invoiceNo} — outstanding ${RUPEE_SYMBOL}${Number(inv.outstanding).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`; o.dataset.outstanding = inv.outstanding; sel.appendChild(o); });
    hint.classList.toggle('hidden', invoices.length > 0);
  } catch (error) { showToast(error.message, 'error'); }
}
async function saveVoucher(e) {
  e.preventDefault();
  const party = document.getElementById('v_party').value;
  const amount = Number(document.getElementById('v_amount').value) || 0;
  const adjustmentType = currentAdjustMode();
  const invoiceNo = document.getElementById('v_invoice').value;
  if (!document.getElementById('v_date').value) return showToast('Select a voucher date.', 'error');
  if (!party) return showToast('Select a party.', 'error');
  if (!(amount > 0)) return showToast('Enter an amount greater than zero.', 'error');
  if (adjustmentType === 'invoice' && !invoiceNo) return showToast('Select an invoice to adjust against, or choose New Reference.', 'error');
  try {
    const data = await requestJson('http://localhost:3000/vouchers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date: document.getElementById('v_date').value, party, amount, mode: document.getElementById('v_mode').value, reference: document.getElementById('v_reference').value.trim(), adjustmentType, invoiceNo }) }, { title: 'Saving voucher...', message: 'Recording voucher and updating billing.' });
    closeVoucherModal();
    await fetchVouchers();
    if (adjustmentType === 'invoice') await fetchTasks(); // keep the dashboard in sync
    let msg = `Voucher ${data.voucherNo || ''} saved.`;
    const invAllocs = data.invoiceAllocations || [];
    const advPart = Number(data.advanceAmount) || 0;
    if (invAllocs.length > 1 && advPart > 0.005) {
      msg += ` Applied across ${invAllocs.length} invoices; ${RUPEE_SYMBOL}${advPart.toLocaleString('en-IN', { minimumFractionDigits: 2 })} kept as advance.`;
    } else if (invAllocs.length > 1) {
      msg += ` Applied across ${invAllocs.length} invoices.`;
    } else if (advPart > 0.005 && invAllocs.length === 1) {
      msg += ` ${RUPEE_SYMBOL}${advPart.toLocaleString('en-IN', { minimumFractionDigits: 2 })} of excess kept as advance.`;
    }
    showToast(msg);
  } catch (error) { showToast(error.message, 'error'); }
}
function handleClientSelectChange() { if (document.getElementById('client_select').value === 'NEW') { showAddClientModal(); document.getElementById('client_select').value = ''; syncComboInput('client_select'); } }
function showAddClientModal(clientName = '') { document.getElementById('client-modal').classList.remove('hidden'); document.getElementById('client-modal-title').innerText = clientName ? 'Edit Client' : 'Add Client'; if (clientName) { const client = state.clients.find((c) => c.name === clientName); if (client) { document.getElementById('c_name').value = client.name; document.getElementById('c_email').value = client.email; document.getElementById('c_phone').value = client.phone; document.getElementById('c_gstn').value = client.gstn || ''; document.getElementById('c_address').value = client.address || ''; document.getElementById('c_status').value = client.status || 'Active'; document.getElementById('c_city').value = client.city || ''; document.getElementById('c_pincode').value = client.pincode || ''; } } }
function closeClientModal() { document.getElementById('client-modal').classList.add('hidden'); document.getElementById('client-form').reset(); }
async function fetchCompanies() {
  const data = await getJson('http://localhost:3000/companies');
  state.companies = data.companies || [];
  state.activeCompanyId = data.activeCompanyId || null;
  renderCompanyList();
}
function renderCompanyList() {
  const list = document.getElementById('company-list'); list.innerHTML = '';
  state.companies.forEach((company) => {
    const isActive = company.id === state.activeCompanyId;
    const row = document.createElement('div');
    row.className = 'company-row';
    row.innerHTML = `<span><strong>${company.name}</strong>${isActive ? ' <span class="badge badge-completed">Active</span>' : ''}</span>${isActive ? '' : `<button type="button" class="btn btn-outline btn-sm" onclick="switchCompany('${company.id.replace(/'/g, "\\'")}')">Switch</button>`}`;
    list.appendChild(row);
  });
}
async function showCompanyModal() { document.getElementById('company-modal').classList.remove('hidden'); try { await fetchCompanies(); } catch (error) { showToast(error.message, 'error'); } }
function closeCompanyModal() { document.getElementById('company-modal').classList.add('hidden'); document.getElementById('company-form').reset(); }
async function switchCompany(companyId) {
  try {
    await requestJson('http://localhost:3000/companies/switch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId }) }, { title: 'Switching company...', message: 'Loading company data.' });
    closeCompanyModal();
    await loadInitialData();
    showToast('Switched company successfully.');
  } catch (error) { showToast(error.message, 'error'); }
}
async function saveNewCompany(e) {
  e.preventDefault();
  const name = document.getElementById('new_company_name').value.trim();
  if (!name) return;
  try {
    await requestJson('http://localhost:3000/companies', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) }, { title: 'Creating company...', message: 'Setting up new company workspace.' });
    closeCompanyModal();
    await loadInitialData();
    showToast('Company created. Please complete its setup.');
  } catch (error) { showToast(error.message, 'error'); }
}
function findSimilarClients(name) {
  const norm = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const target = norm(name);
  if (!target) return [];
  return state.clients.filter((client) => {
    const current = norm(client.name);
    if (!current || current === target) return false;
    return current.includes(target) || target.includes(current);
  });
}
function wordCount(str) { const t = String(str || '').trim(); return t ? t.split(/\s+/).length : 0; }
async function saveClient(e) {
  e.preventDefault();
  const name = document.getElementById('c_name').value.trim();
  const email = document.getElementById('c_email').value.trim();
  const phone = document.getElementById('c_phone').value.trim();
  const address = document.getElementById('c_address').value.trim();
  if (wordCount(name) > 30) return showToast('Client name cannot exceed 30 words.', 'error');
  if (email) {
    if (email.length > 30) return showToast('Email cannot exceed 30 characters.', 'error');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showToast('Enter a valid email address.', 'error');
  }
  if (phone && !/^[6-9]\d{9}$/.test(phone)) return showToast('Enter a valid 10-digit phone number.', 'error');
  if (wordCount(address) > 20) return showToast('Address cannot exceed 20 words.', 'error');
  const isExisting = state.clients.some((client) => client.name.toLowerCase() === name.toLowerCase());
  if (!isExisting) {
    const similar = findSimilarClients(name);
    if (similar.length && !window.confirm(`Possible duplicate client detected:\n\n${similar.map((client) => `• ${client.name}`).join('\n')}\n\nDo you still want to create "${name}"?`)) return;
  }
  const city = document.getElementById('c_city').value.trim();
  const pincode = document.getElementById('c_pincode').value.trim();
  if (!city) return showToast('City is required.', 'error');
  if (!/^\d{6}$/.test(pincode)) return showToast('Pincode must be a 6-digit number.', 'error');
  try {
    await requestJson('http://localhost:3000/clients', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, email: document.getElementById('c_email').value, phone: document.getElementById('c_phone').value, gstn: document.getElementById('c_gstn').value, address: document.getElementById('c_address').value, status: document.getElementById('c_status').value, city, pincode }) }, { title: 'Saving client...', message: 'Updating client details.' });
    closeClientModal(); await fetchClients(); showToast('Client saved successfully.');
  } catch (error) { showToast(error.message, 'error'); }
}
function renderClientsTable() {
  const tbody = document.getElementById('clients-list'); tbody.innerHTML = '';
  const filter = (document.getElementById('client-filter')?.value || '').trim().toLowerCase();
  const list = filter ? state.clients.filter((client) => [client.name, client.email, client.phone, client.gstn, client.address, client.city, client.pincode, client.status].some((value) => String(value || '').toLowerCase().includes(filter))) : state.clients;
  list.forEach((client) => {
    const status = client.status || 'Active';
    const statusBadge = `<span class="badge ${status === 'Active' ? 'badge-completed' : 'badge-open'}">${status}</span>`;
    const cityLine = (client.city || client.pincode) ? `<br><small>${escapeHtml([client.city, client.pincode].filter(Boolean).join(' - '))}</small>` : '';
    const tr = document.createElement('tr');
    const cn = client.name.replace(/'/g, "\\'");
    tr.innerHTML = `<td><strong>${escapeHtml(client.name)}</strong></td><td>${escapeHtml(client.email) || '-'}<br><small>${escapeHtml(client.phone) || '-'}</small></td><td>${escapeHtml(client.gstn) || '-'}</td><td><small>${escapeHtml(client.address) || '-'}</small>${cityLine}</td><td>${statusBadge}</td><td><label class="switch"><input type="checkbox" ${client.remindersEnabled !== false ? 'checked' : ''} onchange="toggleClientReminders('${cn}', this.checked)"><span class="slider round"></span></label></td><td class="client-actions"><button class="btn btn-outline btn-sm" onclick="showAddClientModal('${cn}')">Edit</button><button class="btn btn-outline btn-sm btn-danger" onclick="deleteClient('${cn}')">Delete</button></td>`;
    tbody.appendChild(tr);
  });
}
async function toggleClientReminders(name, enabled) {
  try {
    await requestJson(`http://localhost:3000/clients/${encodeURIComponent(name)}/reminders`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled }) }, { title: 'Updating...', message: 'Saving the reminder toggle for this client.' });
    showToast(enabled ? 'Reminders enabled for this client.' : 'Reminders disabled for this client.');
    await fetchClients();
  } catch (error) { showToast(error.message, 'error'); await fetchClients(); }
}
function buildTaskRow(item = {}) { return `<div class="task-row"><div class="task-desc"><input type="text" placeholder="Task Description" required class="item-desc" value="${escapeHtml(item.desc || '')}"></div><div class="task-hsn"><input type="text" placeholder="HSN/SAC Code" class="item-hsn" value="${escapeHtml(item.hsn || '')}"></div><div class="task-amt"><input type="number" placeholder="Amount" required class="item-amount" value="${item.amt ?? ''}" oninput="calculateInvoicingTotals()"></div><button type="button" class="remove-task-btn" onclick="removeTaskRow(this)" title="Remove line item" aria-label="Remove line item">&times;</button></div>`; }
// Categories are free text server-side (see server.js buildTask) — CATEGORIES is just the
// starter set for the dropdown/billboard. Any custom category already used in the data, or
// typed via "+ Add Custom Category", is treated as a first-class category everywhere.
function customCategoriesInUse() {
  const extra = new Set();
  (state.tasks || []).forEach((t) => { if (t.category && !CATEGORIES.includes(t.category)) extra.add(t.category); });
  return Array.from(extra).sort();
}
function knownCategories() { return CATEGORIES.concat(customCategoriesInUse()); }
function fillCategorySelect(value) {
  const sel = document.getElementById('task_category');
  const known = knownCategories();
  const options = known.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`);
  if (value && !known.includes(value)) options.push(`<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`);
  options.push('<option value="__custom__">+ Add Custom Category...</option>');
  sel.innerHTML = options.join('');
  // An option for `value` always exists at this point (either from `known` or pushed above).
  sel.value = value || 'Other';
  handleCategorySelectChange();
}
function handleCategorySelectChange() {
  const sel = document.getElementById('task_category');
  const customInput = document.getElementById('task_category_custom');
  const isCustom = sel.value === '__custom__';
  customInput.classList.toggle('hidden', !isCustom);
  if (isCustom) customInput.focus(); else customInput.value = '';
}
function showAddTaskModal() { state.currentTaskId = null; document.getElementById('task-modal-title').innerText = 'Add Task'; document.getElementById('task-modal').classList.remove('hidden'); document.getElementById('task-form').reset(); resetSelectSearch('client_select'); setDateValue('task_date', normalizeDateInput(new Date())); document.getElementById('charge_gst').checked = state.gstTab === 'gst'; fillCategorySelect(state.categoryFilter !== 'all' ? state.categoryFilter : 'Other'); document.getElementById('tasks-list-inputs').innerHTML = buildTaskRow(); calculateInvoicingTotals(); }
function closeAddTaskModal() { document.getElementById('task-modal').classList.add('hidden'); document.getElementById('task-form').reset(); state.currentTaskId = null; }
function addTaskRow(item = {}) { document.getElementById('tasks-list-inputs').insertAdjacentHTML('beforeend', buildTaskRow(item)); }
function removeTaskRow(btn) { if (document.querySelectorAll('.task-row').length > 1) btn.parentElement.remove(); calculateInvoicingTotals(); }
function calculateInvoicingTotals() { let subtotal = 0; document.querySelectorAll('.item-amount').forEach((input) => { subtotal += Number(input.value) || 0; }); const gst = document.getElementById('charge_gst').checked ? subtotal * 0.18 : 0; const total = subtotal + gst; document.getElementById('display_subtotal').innerText = `${RUPEE_SYMBOL} ${subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`; document.getElementById('display_grand_total').innerText = `${RUPEE_SYMBOL} ${total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`; document.getElementById('amount_words').value = numberToWords(Math.floor(total)); }
async function saveTask(e) { e.preventDefault(); const items = Array.from(document.querySelectorAll('.task-row')).map((row) => ({ desc: row.querySelector('.item-desc').value.trim(), hsn: row.querySelector('.item-hsn').value.trim(), amt: Number(row.querySelector('.item-amount').value) || 0 })).filter((item) => item.desc); if (!items.length) return showToast('Please add at least one line item.', 'error'); if (!document.getElementById('client_select').value) return showToast('Select a client.', 'error'); if (!document.getElementById('task_date').value) return showToast('Select a task date.', 'error'); const categorySelectValue = document.getElementById('task_category').value; let category = categorySelectValue; if (categorySelectValue === '__custom__') { category = document.getElementById('task_category_custom').value.trim(); if (!category) return showToast('Enter a name for the custom category.', 'error'); } try { const payload = { clientName: document.getElementById('client_select').value, date: document.getElementById('task_date').value, chargeGst: document.getElementById('charge_gst').checked, category, items }; const url = state.currentTaskId ? `http://localhost:3000/tasks/${state.currentTaskId}` : 'http://localhost:3000/tasks'; const method = state.currentTaskId ? 'PUT' : 'POST'; await requestJson(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }, { title: state.currentTaskId ? 'Saving changes...' : 'Saving task...', message: state.currentTaskId ? 'Updating task and invoice data.' : 'Adding task without generating invoice.' }); closeAddTaskModal(); await fetchTasks(); showToast(state.currentTaskId ? 'Task updated successfully.' : 'Task added successfully.'); } catch (error) { showToast(error.message, 'error'); } }
async function editTask(taskId) { const task = state.tasks.find((item) => item.id === taskId); if (!task) return; if (task.status === 'Invoice Cancelled') return showToast('This invoice has been cancelled and cannot be edited.', 'error'); state.currentTaskId = taskId; document.getElementById('task-modal-title').innerText = task.invoiceNo ? `Edit Task (${task.invoiceNo})` : 'Edit Task'; document.getElementById('task-modal').classList.remove('hidden'); resetSelectSearch('client_select'); document.getElementById('client_select').value = task.clientName; syncComboInput('client_select'); setDateValue('task_date', normalizeDateInput(task.date)); document.getElementById('charge_gst').checked = task.gst === '18%'; fillCategorySelect(task.category); document.getElementById('tasks-list-inputs').innerHTML = ''; (task.items || []).forEach((item) => addTaskRow(item)); if (!(task.items || []).length) addTaskRow({ desc: task.details, amt: task.amount }); calculateInvoicingTotals(); }
function categoryOf(task) { return task.category && task.category.trim() ? task.category : 'Other'; }
function timeRange() {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  switch (state.timeFilter) {
    case 'month': return { from: iso(new Date(y, m, 1)), to: iso(new Date(y, m + 1, 0)) };
    case 'prevmonth': return { from: iso(new Date(y, m - 1, 1)), to: iso(new Date(y, m, 0)) };
    case 'quarter': { const q = Math.floor(m / 3) * 3; return { from: iso(new Date(y, q, 1)), to: iso(new Date(y, q + 3, 0)) }; }
    case 'fy': { const fy = m >= 3 ? y : y - 1; return { from: `${fy}-04-01`, to: `${fy + 1}-03-31` }; }
    case 'year': return { from: `${y}-01-01`, to: `${y}-12-31` };
    case 'custom': return { from: state.timeFrom || '', to: state.timeTo || '' };
    default: return { from: '', to: '' };
  }
}
function inTimeRange(task) { const { from, to } = timeRange(); const d = task.date || ''; return (!from || d >= from) && (!to || d <= to); }
function scopedTasks() {
  // Tasks scoped by the active Bills filter (all/gst/nongst) + time filter (billboard/stats share this).
  return state.tasks.filter((task) => {
    if (state.gstTab === 'gst') return task.gst === '18%' && inTimeRange(task);
    if (state.gstTab === 'nongst') return task.gst !== '18%' && inTimeRange(task);
    return inTimeRange(task);
  });
}
function filteredTasks() {
  const search = val('filter-search');
  const from = document.getElementById('filter-from')?.value || '';
  const to = document.getElementById('filter-to')?.value || '';
  const invStatus = document.getElementById('filter-inv-status')?.value || '';
  const payStatus = document.getElementById('filter-pay-status')?.value || '';
  return scopedTasks().filter((task) =>
    (state.categoryFilter === 'all' || categoryOf(task) === state.categoryFilter) &&
    (!search || matches(task.clientName, search) || matches(task.details, search) || matches(task.invoiceNo, search)) &&
    (!from || (task.date || '') >= from) && (!to || (task.date || '') <= to) &&
    (!invStatus || task.status === invStatus) &&
    (!payStatus || task.paymentStatus === payStatus));
}
function resetFilters() {
  ['filter-search', 'filter-inv-status', 'filter-pay-status'].forEach((id) => { const el = document.getElementById(id); if (el) el.value = ''; });
  setDateValue('filter-from', ''); setDateValue('filter-to', '');
  renderTasks();
}
const ICONS = {
  generate: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M12 18v-6"/><path d="M9 15h6"/></svg>',
  regenerate: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/></svg>',
  view: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>',
  edit: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
  download: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>',
  receipt: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1V2l-2 1-2-1-2 1-2-1-2 1-2-1z"/><path d="M8 8h8"/><path d="M8 12h5"/></svg>',
  trash: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>',
  ban: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><line x1="5.5" y1="5.5" x2="18.5" y2="18.5"/></svg>'
};
function renderTasks() {
  const tbody = document.getElementById('task-list'); tbody.innerHTML = '';
  const selectAll = document.getElementById('select-all-rows'); if (selectAll) selectAll.checked = false;
  filteredTasks().forEach((task) => {
    const safeId = task.id.replace(/'/g, "\\'");
    const isCancelled = task.status === 'Invoice Cancelled';
    const isGenerated = task.status === 'Invoice Generated';
    const genIcon = isGenerated ? ICONS.regenerate : ICONS.generate;
    const genTitle = isCancelled ? 'Invoice cancelled' : isGenerated ? 'Re-generate invoice' : 'Generate invoice';
    const invBadge = isGenerated ? 'badge-green' : isCancelled ? 'badge-gray' : 'badge-orange';
    const payBadge = task.paymentStatus === 'Payment Received' ? 'badge-green' : 'badge-red';
    const hasInv = !!task.invoiceNo;
    const client = escapeHtml(task.clientName);
    const details = escapeHtml(task.details || '-');
    const actions = [
      `<button class="icon-btn" title="${genTitle}" onclick="generateInvoice('${safeId}')" ${isCancelled ? 'disabled' : ''}>${genIcon}</button>`,
      `<button class="icon-btn" title="View details" onclick="showTaskDetail('${safeId}')">${ICONS.view}</button>`,
      `<button class="icon-btn" title="${isCancelled ? 'Cancelled invoices cannot be edited' : 'Edit task'}" onclick="editTask('${safeId}')" ${isCancelled ? 'disabled' : ''}>${ICONS.edit}</button>`,
      `<button class="icon-btn" title="Download invoice" onclick="openInvoice('${safeId}')" ${hasInv ? '' : 'disabled'}>${ICONS.download}</button>`,
      `<button class="icon-btn icon-receipt" title="${isCancelled ? 'Cancelled invoices cannot take payments' : 'Receipt entry'}" onclick="openReceiptEntry('${safeId}')" ${isCancelled ? 'disabled' : ''}>${ICONS.receipt}</button>`,
      `<button class="icon-btn icon-cancel-invoice" title="Cancel invoice" onclick="cancelInvoice('${safeId}')" ${isGenerated ? '' : 'disabled'}>${ICONS.ban}</button>`,
      `<button class="icon-btn icon-delete" title="Delete task" onclick="deleteTask('${safeId}')">${ICONS.trash}</button>`
    ].join('');
    const tr = document.createElement('tr');
    tr.dataset.taskId = task.id;
    tr.innerHTML = `<td class="col-select"><input type="checkbox" class="row-select" data-id="${task.id}"></td><td class="task-client ellip" title="${client}"><strong>${client}</strong></td><td class="task-details-cell ellip" title="${details}">${details}</td><td class="task-date">${formatDate(task.date)}</td><td class="task-amount">${RUPEE_SYMBOL}${Number(task.total || 0).toLocaleString('en-IN')}</td><td class="invoice-no ellip" title="${escapeHtml(task.invoiceNo || '-')}">${escapeHtml(task.invoiceNo || '-')}</td><td class="status-cell"><span class="badge ${invBadge}">${task.status}</span></td><td class="status-cell"><span class="badge ${payBadge}">${task.paymentStatus}</span></td><td class="action-cell"><div class="action-icons">${actions}</div></td>`;
    tbody.appendChild(tr);
  });
}
function showTaskDetail(taskId) {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) return;
  const items = (task.items || []).length ? task.items : [{ desc: task.details, amt: task.amount }];
  const rows = items.map((it, i) => `<tr><td>${i + 1}</td><td>${escapeHtml(it.desc || '-')}</td><td>${escapeHtml(it.hsn || '-')}</td><td class="num">${RUPEE_SYMBOL}${Number(it.amt || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>`).join('');
  const gstAmount = Number(task.total || 0) - Number(task.amount || 0);
  const field = (label, value) => `<div class="detail-row"><span class="detail-label">${label}</span><span class="detail-value">${escapeHtml(value)}</span></div>`;
  const reminderFields = task.invoiceNo && task.paymentStatus !== 'Payment Received'
    ? `${field('Last Reminder', task.lastReminderAt ? formatDateTime(task.lastReminderAt) : 'Not sent yet')}${field('Next Reminder', formatDate(nextReminderDateFor(task)))}`
    : '';
  document.getElementById('task-detail-body').innerHTML =
    `<div class="detail-grid">${field('Client', task.clientName)}${field('Date', formatDate(task.date))}${field('Service Category', task.category || 'Other')}${field('GST', task.gst === '18%' ? 'GST (18%)' : 'Non-GST')}${field('Invoice No', task.invoiceNo || '-')}${field('Status', task.status)}${field('Payment Status', task.paymentStatus)}${reminderFields}</div>` +
    `<div class="table-scroll" style="margin-top:16px"><table class="detail-items"><thead><tr><th>#</th><th>Description</th><th>HSN/SAC</th><th class="num">Amount</th></tr></thead><tbody>${rows}</tbody></table></div>` +
    `<div class="detail-totals"><div><span>Sub-total</span><strong>${RUPEE_SYMBOL}${Number(task.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong></div>${gstAmount > 0.005 ? `<div><span>GST</span><strong>${RUPEE_SYMBOL}${gstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong></div>` : ''}<div class="detail-grand"><span>Total</span><strong>${RUPEE_SYMBOL}${Number(task.total || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong></div></div>`;
  document.getElementById('task-detail-modal').classList.remove('hidden');
}
function closeTaskDetail() { document.getElementById('task-detail-modal').classList.add('hidden'); }
function flashTaskRows(taskIds) {
  taskIds.forEach((taskId) => {
    const row = document.querySelector(`tr[data-task-id="${taskId}"]`);
    if (!row) return;
    row.classList.remove('row-flash');
    void row.offsetWidth;
    row.classList.add('row-flash');
    setTimeout(() => row.classList.remove('row-flash'), 1200);
  });
}
function applyFilters() { renderTasks(); }
function navGst(tab) { showView('dashboard-view'); setGstTab(tab); }
function setGstTab(tab) {
  state.gstTab = tab;
  renderTasks();
  updateStats();
  renderBillboard();
  setActiveNav('dashboard');
  const billsFilter = document.getElementById('bills-filter');
  if (billsFilter) billsFilter.value = tab;
}
function setActiveNav(key) {
  document.querySelectorAll('[data-nav]').forEach((btn) => btn.classList.toggle('active', btn.dataset.nav === key));
}
function updateStats() {
  const tabTasks = scopedTasks();
  document.getElementById('stat-total').innerText = tabTasks.length;
  document.getElementById('stat-open').innerText = tabTasks.filter((task) => task.status === 'Invoice Pending').length;
  document.getElementById('stat-completed').innerText = tabTasks.filter((task) => task.status === 'Invoice Generated').length;
  const outstandingEl = document.getElementById('stat-outstanding');
  if (outstandingEl) outstandingEl.innerText = `${RUPEE_SYMBOL}${computeOutstandingTotal(tabTasks).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
}
// Mirrors the server's invoiceSummary outstanding calculation (total billed minus
// recorded payments/discounts, per invoice group) for the dashboard KPI card.
function computeOutstandingTotal(tasks) {
  const groups = {};
  tasks.forEach((task) => {
    if (!task.invoiceNo || task.status !== 'Invoice Generated') return;
    if (!groups[task.invoiceNo]) groups[task.invoiceNo] = { total: 0, paymentEntries: task.paymentEntries || [] };
    groups[task.invoiceNo].total += Number(task.total) || 0;
  });
  return Object.values(groups).reduce((sum, g) => {
    const applied = (g.paymentEntries || []).reduce((s2, e) => s2 + (Number(e.amountReceived) || 0) + (Number(e.discountGiven) || 0), 0);
    return sum + Math.max(g.total - applied, 0);
  }, 0);
}
const CATEGORY_ICONS = {
  all: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  'ITR Return': '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 13h6M9 17h6"/>',
  'GST Return': '<line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>',
  Audit: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>',
  Accounting: '<rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="14" x2="16" y2="14"/><line x1="8" y1="18" x2="16" y2="18"/>',
  'ROC Filing': '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
  Other: '<path d="m20.59 13.41-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82Z"/><circle cx="7" cy="7" r="1.5"/>'
};
function renderBillboard() {
  const container = document.getElementById('billboard');
  if (!container) return;
  const tasks = scopedTasks();
  const cards = [{ key: 'all', label: 'All', count: tasks.length }].concat(knownCategories().map((cat) => ({ key: cat, label: cat, count: tasks.filter((t) => categoryOf(t) === cat).length })));
  container.innerHTML = cards.map((card, index) => {
    const active = state.categoryFilter === card.key;
    const zero = !active && card.count === 0;
    // Staggered delay makes the row visibly unfold left-to-right when it's revealed.
    return `<button type="button" class="bill-card${active ? ' active' : ''}${zero ? ' zero' : ''}" style="animation-delay:${index * 35}ms" onclick="setCategoryFilter('${card.key.replace(/'/g, "\\'")}')"><span class="bill-icon"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${CATEGORY_ICONS[card.key] || CATEGORY_ICONS.Other}</svg></span><span class="bill-label">${card.label}</span><span class="bill-count">${card.count}</span></button>`;
  }).join('');
}
function toggleBillboardCollapse() {
  const section = document.getElementById('billboard-section');
  const collapsed = section.classList.toggle('collapsed');
  localStorage.setItem('billboard-collapsed', collapsed ? '1' : '0');
  document.getElementById('billboard-toggle-btn').title = collapsed ? 'Show categories' : 'Hide categories';
  if (!collapsed) renderBillboard(); // re-render so the reveal animation replays each time it opens
}
function restoreBillboardCollapseState() {
  const section = document.getElementById('billboard-section');
  if (!section) return;
  // Defaults to collapsed (single button) unless the user has already expanded it before.
  const collapsed = localStorage.getItem('billboard-collapsed') !== '0';
  section.classList.toggle('collapsed', collapsed);
  const btn = document.getElementById('billboard-toggle-btn');
  if (btn) btn.title = collapsed ? 'Show categories' : 'Hide categories';
}
async function populateDashboardCompanySelect() {
  const sel = document.getElementById('dashboard-company-select');
  if (!sel) return;
  try {
    const data = await getJson('http://localhost:3000/companies');
    state.companies = data.companies || [];
    state.activeCompanyId = data.activeCompanyId || null;
    sel.innerHTML = state.companies.map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`).join('');
    sel.value = state.activeCompanyId || (state.companies[0] && state.companies[0].id) || '';
  } catch { /* leave as-is */ }
}
function setCategoryFilter(key) { state.categoryFilter = key; renderBillboard(); renderTasks(); }
function setTimeFilter() {
  state.timeFilter = document.getElementById('time-filter').value;
  state.timeFrom = document.getElementById('time-from').value;
  state.timeTo = document.getElementById('time-to').value;
  document.getElementById('time-custom').classList.toggle('hidden', state.timeFilter !== 'custom');
  renderTasks(); updateStats(); renderBillboard();
}
function toggleSelectAll(cb) { document.querySelectorAll('#task-list .row-select').forEach((box) => { box.checked = cb.checked; }); }
async function generateInvoice(taskId) { try { const paymentDisplay = await askPaymentDisplay(); await requestJson('http://localhost:3000/generate-invoice', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ taskIds: [taskId], paymentDisplay }) }, { title: 'Generating invoice...', message: 'Preparing the PDF and updating task status.' }); await fetchTasks(); showToast('Invoice generated successfully.'); } catch (error) { showToast(error.message, 'error'); } }
async function batchProcess(action) {
  const ids = Array.from(document.querySelectorAll('.row-select:checked')).map((checkbox) => checkbox.dataset.id);
  if (!ids.length) return showToast(`Please select at least one row for ${action}.`, 'error');
  if (action === 'generate') {
    try {
      const paymentDisplay = await askPaymentDisplay();
      await requestJson('http://localhost:3000/generate-invoice', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ taskIds: ids, paymentDisplay }) }, { title: 'Generating invoices...', message: 'Validating selection and preparing invoice PDF.' });
      await fetchTasks();
      showToast('Invoice generation completed.');
    } catch (error) {
      showToast(error.message, 'error');
      return;
    }
  } else {
    const tasks = ids.map((id) => { const task = state.tasks.find((item) => item.id === id); const client = state.clients.find((entry) => entry.name === task.clientName); return { ...task, phone: client?.phone || '' }; });
    const pendingTasks = tasks.filter((task) => task.status !== 'Invoice Generated');
    if (pendingTasks.length) {
      flashTaskRows(pendingTasks.map((task) => task.id));
      showToast(`Only generated invoices can be used for ${action === 'send' ? 'WhatsApp export' : 'reminder export'}.`, 'error');
      return;
    }
    const endpoint = action === 'send' ? 'generate-whatsapp-excel' : 'generate-reminder-excel';
    try {
      const data = await requestJson(`http://localhost:3000/${endpoint}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tasks, firmName: state.firm.name }) }, { title: action === 'send' ? 'Preparing WhatsApp file...' : 'Preparing reminder file...', message: 'Generating export workbook.' });
      await offerWhatsappAutomation(action, data.path);
    } catch (error) {
      showToast(error.message, 'error');
      return;
    }
  }
  document.querySelectorAll('.row-select').forEach((checkbox) => { checkbox.checked = false; });
  const selectAll = document.getElementById('select-all-rows'); if (selectAll) selectAll.checked = false;
}
async function batchProcessSeparate() {
  const ids = Array.from(document.querySelectorAll('.row-select:checked')).map((checkbox) => checkbox.dataset.id);
  if (!ids.length) return showToast('Please select at least one row to generate.', 'error');
  try {
    const paymentDisplay = await askPaymentDisplay();
    const data = await requestJson('http://localhost:3000/generate-invoice-separate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ taskIds: ids, paymentDisplay }) }, { title: 'Generating separate invoices...', message: 'Creating one invoice per selected task.' });
    await fetchTasks();
    showToast(`${data.generated} separate invoice(s) generated${data.skipped ? `, ${data.skipped} skipped` : ''}.`);
  } catch (error) { showToast(error.message, 'error'); return; }
  document.querySelectorAll('.row-select').forEach((checkbox) => { checkbox.checked = false; });
  const selectAll = document.getElementById('select-all-rows'); if (selectAll) selectAll.checked = false;
}
function showBulkUploadModal() { document.getElementById('bulk-file').value = ''; document.getElementById('bulk-result').classList.add('hidden'); document.getElementById('bulk-upload-modal').classList.remove('hidden'); }
function closeBulkUploadModal() { document.getElementById('bulk-upload-modal').classList.add('hidden'); }
function downloadBulkTemplate() { const link = document.createElement('a'); link.href = 'http://localhost:3000/tasks/bulk-template'; document.body.appendChild(link); link.click(); link.remove(); }
async function submitBulkUpload() {
  const input = document.getElementById('bulk-file');
  if (!input.files || !input.files[0]) return showToast('Please choose an Excel file first.', 'error');
  const reader = new FileReader();
  reader.onload = async (ev) => {
    const fileBase64 = String(ev.target.result).split(',')[1] || '';
    try {
      const data = await requestJson('http://localhost:3000/tasks/bulk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fileBase64 }) }, { title: 'Uploading tasks...', message: 'Reading the workbook and creating tasks.' });
      const result = document.getElementById('bulk-result');
      result.classList.remove('hidden');
      result.innerHTML = `<strong>${data.created} task(s) added.</strong>${(data.errors || []).length ? `<br>Skipped ${data.errors.length} row(s):<br>${data.errors.map((e) => escapeHtml(e)).join('<br>')}` : ''}`;
      await fetchTasks();
      showToast(`${data.created} task(s) added.`);
    } catch (error) { showToast(error.message, 'error'); }
  };
  reader.readAsDataURL(input.files[0]);
}
function showClientBulkUploadModal() { document.getElementById('client-bulk-file').value = ''; document.getElementById('client-bulk-result').classList.add('hidden'); document.getElementById('client-bulk-upload-modal').classList.remove('hidden'); }
function closeClientBulkUploadModal() { document.getElementById('client-bulk-upload-modal').classList.add('hidden'); }
function downloadClientBulkTemplate() { const link = document.createElement('a'); link.href = 'http://localhost:3000/clients/bulk-template'; document.body.appendChild(link); link.click(); link.remove(); }
async function submitClientBulkUpload() {
  const input = document.getElementById('client-bulk-file');
  if (!input.files || !input.files[0]) return showToast('Please choose an Excel file first.', 'error');
  const reader = new FileReader();
  reader.onload = async (ev) => {
    const fileBase64 = String(ev.target.result).split(',')[1] || '';
    try {
      const data = await requestJson('http://localhost:3000/clients/bulk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fileBase64 }) }, { title: 'Uploading clients...', message: 'Reading the workbook and creating clients.' });
      const result = document.getElementById('client-bulk-result');
      result.classList.remove('hidden');
      result.innerHTML = `<strong>${data.created} client(s) added.</strong>${(data.errors || []).length ? `<br>Skipped ${data.errors.length} row(s):<br>${data.errors.map((e) => escapeHtml(e)).join('<br>')}` : ''}`;
      await fetchClients();
      showToast(`${data.created} client(s) added.`);
    } catch (error) { showToast(error.message, 'error'); }
  };
  reader.readAsDataURL(input.files[0]);
}
function openInvoice(taskId) { const task = state.tasks.find((item) => item.id === taskId); if (!task?.invoiceFile) return; window.open(`http://localhost:3000/view-invoice?filename=${encodeURIComponent(task.invoiceFile)}&monthYear=${encodeURIComponent(task.invoiceMonth)}`, '_blank'); }
function confirmAction(message) { return Promise.resolve(window.confirm(message)); }
async function cancelInvoice(taskId) {
  const task = state.tasks.find((t) => t.id === taskId);
  if (!task) return;
  if (!(await confirmAction(`Cancel invoice ${task.invoiceNo} for "${task.clientName}"? It keeps its number but is marked Cancelled and excluded from reports/outstanding.`))) return;
  try {
    await requestJson(`http://localhost:3000/tasks/${encodeURIComponent(taskId)}/cancel-invoice`, { method: 'POST' }, { title: 'Cancelling invoice...', message: 'Marking the invoice as cancelled.' });
    await fetchTasks(); showToast('Invoice cancelled.');
  } catch (error) { showToast(error.message, 'error'); }
}
async function deleteTask(taskId) {
  const task = state.tasks.find((t) => t.id === taskId);
  if (!task) return;
  const warn = task.invoiceNo ? `\n\nInvoice ${task.invoiceNo} and its PDF will also be removed.` : '';
  if (!(await confirmAction(`Delete this task for "${task.clientName}"?${warn}`))) return;
  try {
    await requestJson(`http://localhost:3000/tasks/${encodeURIComponent(taskId)}`, { method: 'DELETE' }, { title: 'Deleting task...', message: 'Removing the task.' });
    await fetchTasks(); showToast('Task deleted.');
  } catch (error) { showToast(error.message, 'error'); }
}
async function deleteClient(name) {
  if (!(await confirmAction(`Delete client "${name}"? This cannot be undone.`))) return;
  try {
    await requestJson(`http://localhost:3000/clients/${encodeURIComponent(name)}`, { method: 'DELETE' }, { title: 'Deleting client...', message: 'Removing the client.' });
    await fetchClients(); showToast('Client deleted.');
  } catch (error) { showToast(error.message, 'error'); }
}
async function deleteVoucher(voucherNo) {
  if (!(await confirmAction(`Delete voucher "${voucherNo}"? Any payment it applied to an invoice will be reversed.`))) return;
  try {
    await requestJson(`http://localhost:3000/vouchers/${encodeURIComponent(voucherNo)}`, { method: 'DELETE' }, { title: 'Deleting voucher...', message: 'Reversing and removing the voucher.' });
    await fetchVouchers(); await fetchTasks(); showToast('Voucher deleted.');
  } catch (error) { showToast(error.message, 'error'); }
}
function getBalanceDue(task) {
  const groupTotal = task.invoiceNo
    ? state.tasks.filter((t) => t.invoiceNo === task.invoiceNo).reduce((s, t) => s + (Number(t.total) || 0), 0)
    : (Number(task.total) || 0);
  const applied = (task.paymentEntries || []).reduce((sum, entry) => sum + (Number(entry.amountReceived) || 0) + (Number(entry.discountGiven) || 0), 0);
  return Math.max(groupTotal - applied, 0);
}
function showPaymentModal(taskId) {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) return;
  state.paymentTaskId = taskId;
  const balanceDue = getBalanceDue(task);
  const groupTotal = task.invoiceNo ? state.tasks.filter((t) => t.invoiceNo === task.invoiceNo).reduce((s, t) => s + (Number(t.total) || 0), 0) : (Number(task.total) || 0);
  const entries = task.paymentEntries || [];
  const histSection = document.getElementById('payment_history_section');
  const histList = document.getElementById('payment_history_list');
  histList.innerHTML = '';
  if (entries.length) {
    entries.forEach((entry) => {
      const row = document.createElement('div');
      row.className = 'payment-history-row';
      const parts = [];
      if (Number(entry.amountReceived)) parts.push(`<span class="payment-history-amount">Received: ${RUPEE_SYMBOL}${Number(entry.amountReceived).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>`);
      if (Number(entry.discountGiven)) parts.push(`<span class="payment-history-discount">Discount: ${RUPEE_SYMBOL}${Number(entry.discountGiven).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>`);
      row.innerHTML = `<span class="payment-history-date">${entry.date || ''}</span><span style="display:flex;gap:12px">${parts.join('')}</span>`;
      histList.appendChild(row);
    });
    histSection.classList.remove('hidden');
  } else {
    histSection.classList.add('hidden');
  }
  document.getElementById('payment-modal').classList.remove('hidden');
  document.getElementById('payment_invoice_total').innerText = `${RUPEE_SYMBOL} ${groupTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
  document.getElementById('payment_amount_received').value = balanceDue.toFixed(2);
  document.getElementById('payment_discount_given').value = '0.00';
  document.getElementById('payment_balance_due').innerText = `${RUPEE_SYMBOL} ${balanceDue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
  document.getElementById('payment_error').classList.add('hidden');
  document.getElementById('payment_error').innerText = '';
  updatePaymentTotal();
}
function closePaymentModal() { document.getElementById('payment-modal').classList.add('hidden'); document.getElementById('payment-form').reset(); document.getElementById('payment_error').classList.add('hidden'); document.getElementById('payment_error').innerText = ''; document.getElementById('payment_history_section').classList.add('hidden'); document.getElementById('payment_history_list').innerHTML = ''; state.paymentTaskId = null; }
function updatePaymentTotal() { const task = state.tasks.find((item) => item.id === state.paymentTaskId); const balanceDue = task ? getBalanceDue(task) : 0; const total = (Number(document.getElementById('payment_amount_received').value) || 0) + (Number(document.getElementById('payment_discount_given').value) || 0); document.getElementById('payment_total_applied').innerText = `${RUPEE_SYMBOL} ${total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`; const error = document.getElementById('payment_error'); if (total - balanceDue > 0.001) { error.innerText = 'Total applied cannot exceed the balance due.'; error.classList.remove('hidden'); } else { error.innerText = ''; error.classList.add('hidden'); } }
async function cancelPayment(taskId) { if (!window.confirm('Cancel the recorded payment for this invoice? This clears all payment entries and marks it as Payment Pending.')) return; try { await requestJson('http://localhost:3000/cancel-payment', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ taskId }) }, { title: 'Cancelling payment...', message: 'Reverting payment status and refreshing invoice PDF.' }); await fetchTasks(); showToast('Payment cancelled successfully.'); } catch (error) { showToast(error.message, 'error'); } }
async function savePayment(e) { e.preventDefault(); const task = state.tasks.find((item) => item.id === state.paymentTaskId); const amountReceived = Number(document.getElementById('payment_amount_received').value) || 0; const discountGiven = Number(document.getElementById('payment_discount_given').value) || 0; const totalApplied = amountReceived + discountGiven; const balanceDue = task ? getBalanceDue(task) : 0; if (totalApplied - balanceDue > 0.001) return showToast('Total applied cannot exceed the balance due.', 'error'); try { await requestJson('http://localhost:3000/record-payment', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ taskId: state.paymentTaskId, amountReceived, discountGiven }) }, { title: 'Updating payment...', message: 'Recording payment and refreshing invoice PDF.' }); closePaymentModal(); await fetchTasks(); showToast('Payment updated successfully.'); } catch (error) { showToast(error.message, 'error'); } }
function val(id) { return document.getElementById(id)?.value.trim().toLowerCase() || ''; }
function matches(value, filter) { return !filter || String(value || '').toLowerCase().includes(filter); }
// Unified combobox: one text input drives a floating list, backed by the real <select>
// (kept in the DOM, visually hidden) so every existing .value/.onchange/population call keeps working.
function comboWrap(selectId) { return document.getElementById(selectId)?.closest('.searchable-select') || null; }
function comboSearchInput(selectId) { return comboWrap(selectId)?.querySelector('.searchable-select-search') || null; }
function comboListEl(selectId) { return comboWrap(selectId)?.querySelector('.combo-list') || null; }
const comboHighlightIndex = {}; // selectId -> index of the keyboard-highlighted option in its current rendered list
function renderComboList(selectId, query) {
  const select = document.getElementById(selectId);
  const list = comboListEl(selectId);
  if (!select || !list) return;
  const q = (query || '').trim().toLowerCase();
  const opts = Array.from(select.options).filter((opt) => opt.value);
  const matched = q ? opts.filter((opt) => opt.textContent.toLowerCase().includes(q)) : opts;
  comboHighlightIndex[selectId] = matched.length ? 0 : -1;
  list.innerHTML = matched.length
    ? matched.map((opt, i) => `<div class="combo-option${opt.value === select.value ? ' active' : ''}${i === 0 ? ' highlighted' : ''}" data-value="${escapeHtml(opt.value)}">${escapeHtml(opt.textContent)}</div>`).join('')
    : '<div class="combo-empty">No matches found</div>';
}
// Moves the keyboard highlight up/down through the currently rendered options (wraps at the ends).
function moveComboHighlight(selectId, delta) {
  const list = comboListEl(selectId);
  const options = list ? Array.from(list.querySelectorAll('.combo-option')) : [];
  if (!options.length) return;
  const current = comboHighlightIndex[selectId];
  const idx = (((typeof current === 'number' ? current : 0) + delta) % options.length + options.length) % options.length;
  comboHighlightIndex[selectId] = idx;
  options.forEach((el, i) => el.classList.toggle('highlighted', i === idx));
  options[idx].scrollIntoView({ block: 'nearest' });
}
function openComboList(selectId) { comboListEl(selectId)?.classList.remove('hidden'); }
function closeComboList(selectId) { comboListEl(selectId)?.classList.add('hidden'); }
function closeAllComboLists() { document.querySelectorAll('.combo-list').forEach((list) => list.classList.add('hidden')); }
function closeComboListsOnOutsideClick(event) {
  document.querySelectorAll('.searchable-select').forEach((wrap) => { if (!wrap.contains(event.target)) wrap.querySelector('.combo-list')?.classList.add('hidden'); });
}
function filterSelectOptions(selectId, query) { renderComboList(selectId, query); openComboList(selectId); }
function syncComboInput(selectId) {
  const select = document.getElementById(selectId);
  const input = comboSearchInput(selectId);
  if (!select || !input) return;
  const opt = select.options[select.selectedIndex];
  input.value = (opt && opt.value) ? opt.textContent : '';
}
function resetSelectSearch(selectId) { syncComboInput(selectId); closeComboList(selectId); }
function pickComboOption(selectId, value) {
  const select = document.getElementById(selectId);
  if (!select) return;
  select.value = value;
  select.dispatchEvent(new Event('change', { bubbles: true }));
  syncComboInput(selectId);
  closeComboList(selectId);
}
function handleComboMousedown(event) {
  event.preventDefault(); // keeps the search input focused so the click still lands on the option
  const optionEl = event.target.closest('.combo-option');
  if (!optionEl) return;
  pickComboOption(event.currentTarget.dataset.select, optionEl.dataset.value);
}
function comboKeydown(event, selectId) {
  if (event.key === 'Escape') { closeComboList(selectId); event.target.blur(); return; }
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    const list = comboListEl(selectId);
    if (list && list.classList.contains('hidden')) renderComboList(selectId, event.target.value);
    openComboList(selectId);
    moveComboHighlight(selectId, event.key === 'ArrowDown' ? 1 : -1);
    return;
  }
  if (event.key === 'Enter') {
    event.preventDefault();
    const options = Array.from(comboListEl(selectId)?.querySelectorAll('.combo-option') || []);
    const idx = comboHighlightIndex[selectId];
    const target = (typeof idx === 'number' && options[idx]) ? options[idx] : options[0];
    if (target) pickComboOption(selectId, target.dataset.value);
  }
}
function normalizeDateInput(value) { if (!value) return ''; if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value; const parsed = new Date(value); if (!Number.isNaN(parsed.getTime())) return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`; const parts = String(value).split(',')[0].split('/'); return parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : ''; }
function formatDate(value) { const normalized = normalizeDateInput(value); return normalized ? new Date(`${normalized}T00:00:00`).toLocaleDateString('en-IN') : ''; }
// Custom themed calendar dropdown replacing the native (unstylable) browser date picker.
// Each date field is a hidden ISO input (id) — read by every existing .value/onchange call
// elsewhere in the app, unchanged — paired with a visible typeable "id_display" text input
// showing dd-mm-yyyy. The calendar and manual typing both just write through setDateValue().
let openPicker = null; // { inputId, panel, year, month, view }
function isoOf(y, m, d) { return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`; }
function displayFormat(iso) { if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return ''; const [y, m, d] = iso.split('-'); return `${d}-${m}-${y}`; }
function parseDisplayDate(text) {
  const match = String(text || '').trim().match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (!match) return '';
  const day = parseInt(match[1], 10), month = parseInt(match[2], 10), year = parseInt(match[3], 10);
  if (month < 1 || month > 12) return '';
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return '';
  return isoOf(year, month - 1, day);
}
function syncDateDisplay(id) {
  const display = document.getElementById(`${id}_display`);
  const hidden = document.getElementById(id);
  if (display && hidden) display.value = displayFormat(hidden.value);
}
function setDateValue(id, iso) {
  const hidden = document.getElementById(id);
  if (!hidden) return;
  hidden.value = iso;
  syncDateDisplay(id);
  hidden.dispatchEvent(new Event('change', { bubbles: true }));
}
function handleDateTyped(id, text) {
  const iso = parseDisplayDate(text);
  if (!iso) return; // wait for a complete, valid dd-mm-yyyy before committing
  const hidden = document.getElementById(id);
  if (!hidden) return;
  hidden.value = iso;
  hidden.dispatchEvent(new Event('change', { bubbles: true }));
  if (openPicker && openPicker.inputId === id) {
    openPicker.year = parseInt(iso.slice(0, 4), 10); openPicker.month = parseInt(iso.slice(5, 7), 10) - 1; openPicker.view = 'day';
    renderDatePicker(); positionDatePicker();
  }
}
function handleDateBlur(id) { syncDateDisplay(id); }
function openDatePicker(inputId) {
  if (openPicker && openPicker.inputId === inputId) return closeDatePicker();
  closeDatePicker();
  const hidden = document.getElementById(inputId);
  const display = document.getElementById(`${inputId}_display`);
  if (!hidden || !display) return;
  const base = hidden.value ? new Date(`${hidden.value}T00:00:00`) : new Date();
  const panel = document.createElement('div');
  panel.className = 'datepicker-panel';
  document.body.appendChild(panel);
  openPicker = { inputId, panel, year: base.getFullYear(), month: base.getMonth(), view: 'day' };
  renderDatePicker();
  positionDatePicker();
  window.addEventListener('scroll', positionDatePicker, true);
  window.addEventListener('resize', positionDatePicker);
}
function closeDatePicker() {
  if (!openPicker) return;
  openPicker.panel.remove();
  window.removeEventListener('scroll', positionDatePicker, true);
  window.removeEventListener('resize', positionDatePicker);
  openPicker = null;
}
function positionDatePicker() {
  if (!openPicker) return;
  const display = document.getElementById(`${openPicker.inputId}_display`);
  if (!display) return closeDatePicker();
  const rect = display.getBoundingClientRect();
  const panel = openPicker.panel;
  const panelWidth = panel.offsetWidth || 280;
  const panelHeight = panel.offsetHeight || 320;
  let left = rect.left;
  if (left + panelWidth > window.innerWidth - 8) left = window.innerWidth - panelWidth - 8;
  if (left < 8) left = 8;
  let top = rect.bottom + 6;
  if (top + panelHeight > window.innerHeight - 8) top = Math.max(8, rect.top - panelHeight - 6);
  panel.style.left = `${left}px`;
  panel.style.top = `${top}px`;
}
function renderDatePicker() {
  const view = openPicker.view || 'day';
  if (view === 'year') return renderYearView();
  if (view === 'month') return renderMonthView();
  renderDayView();
}
function renderDayView() {
  const { panel, inputId, year, month } = openPicker;
  const hidden = document.getElementById(inputId);
  const selected = hidden.value || '';
  const today = normalizeDateInput(new Date());
  const startWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();
  const monthLabel = new Date(year, month, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });
  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push({ d: daysInPrevMonth - startWeekday + 1 + i, outside: true });
  for (let d = 1; d <= daysInMonth; d++) cells.push({ d, iso: isoOf(year, month, d), outside: false });
  for (let d = 1; cells.length % 7 !== 0; d++) cells.push({ d, outside: true });
  const weekdays = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  panel.innerHTML = `
    <div class="datepicker-header">
      <button type="button" class="datepicker-nav" data-nav="-1" aria-label="Previous month">&#8249;</button>
      <button type="button" class="datepicker-title" data-action="show-month">${monthLabel}</button>
      <button type="button" class="datepicker-nav" data-nav="1" aria-label="Next month">&#8250;</button>
    </div>
    <div class="datepicker-weekdays">${weekdays.map((w) => `<span>${w}</span>`).join('')}</div>
    <div class="datepicker-grid">${cells.map((c) => c.outside
    ? `<button type="button" class="datepicker-day outside" disabled>${c.d}</button>`
    : `<button type="button" class="datepicker-day${c.iso === selected ? ' selected' : ''}${c.iso === today ? ' today' : ''}" data-iso="${c.iso}">${c.d}</button>`).join('')}</div>
    <div class="datepicker-footer">
      <button type="button" class="datepicker-link" data-action="clear">Clear</button>
      <button type="button" class="datepicker-link" data-action="today">Today</button>
    </div>`;
  panel.onclick = (e) => {
    const navBtn = e.target.closest('[data-nav]');
    if (navBtn) {
      let m = openPicker.month + parseInt(navBtn.dataset.nav, 10); let y = openPicker.year;
      if (m < 0) { m = 11; y -= 1; } else if (m > 11) { m = 0; y += 1; }
      openPicker.month = m; openPicker.year = y;
      renderDatePicker(); positionDatePicker();
      return;
    }
    if (e.target.closest('[data-action="show-month"]')) { openPicker.view = 'month'; renderDatePicker(); positionDatePicker(); return; }
    const dayBtn = e.target.closest('.datepicker-day:not(.outside)');
    if (dayBtn) return setDatePickerValue(dayBtn.dataset.iso);
    const actionBtn = e.target.closest('[data-action]');
    if (actionBtn) setDatePickerValue(actionBtn.dataset.action === 'today' ? today : '');
  };
}
function renderMonthView() {
  const { panel, year, month } = openPicker;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  panel.innerHTML = `
    <div class="datepicker-header">
      <button type="button" class="datepicker-nav" data-nav-year="-1" aria-label="Previous year">&#8249;</button>
      <button type="button" class="datepicker-title" data-action="show-year">${year}</button>
      <button type="button" class="datepicker-nav" data-nav-year="1" aria-label="Next year">&#8250;</button>
    </div>
    <div class="datepicker-cell-grid">${months.map((m, i) => `<button type="button" class="datepicker-cell${i === month ? ' selected' : ''}" data-month="${i}">${m}</button>`).join('')}</div>`;
  panel.onclick = (e) => {
    const navYear = e.target.closest('[data-nav-year]');
    if (navYear) { openPicker.year += parseInt(navYear.dataset.navYear, 10); renderMonthView(); positionDatePicker(); return; }
    if (e.target.closest('[data-action="show-year"]')) { openPicker.view = 'year'; renderDatePicker(); positionDatePicker(); return; }
    const monthCell = e.target.closest('[data-month]');
    if (monthCell) { openPicker.month = parseInt(monthCell.dataset.month, 10); openPicker.view = 'day'; renderDatePicker(); positionDatePicker(); }
  };
}
function renderYearView() {
  const { panel, year } = openPicker;
  const startYear = year - (year % 12);
  const years = Array.from({ length: 12 }, (_, i) => startYear + i);
  panel.innerHTML = `
    <div class="datepicker-header">
      <button type="button" class="datepicker-nav" data-nav-block="-1" aria-label="Previous years">&#8249;</button>
      <span class="datepicker-title">${years[0]}–${years[11]}</span>
      <button type="button" class="datepicker-nav" data-nav-block="1" aria-label="Next years">&#8250;</button>
    </div>
    <div class="datepicker-cell-grid">${years.map((y) => `<button type="button" class="datepicker-cell${y === year ? ' selected' : ''}" data-year="${y}">${y}</button>`).join('')}</div>`;
  panel.onclick = (e) => {
    const navBlock = e.target.closest('[data-nav-block]');
    if (navBlock) { openPicker.year += parseInt(navBlock.dataset.navBlock, 10) * 12; renderYearView(); positionDatePicker(); return; }
    const yearCell = e.target.closest('[data-year]');
    if (yearCell) { openPicker.year = parseInt(yearCell.dataset.year, 10); openPicker.view = 'month'; renderDatePicker(); positionDatePicker(); }
  };
}
function setDatePickerValue(iso) {
  if (!openPicker) return;
  const id = openPicker.inputId;
  closeDatePicker();
  setDateValue(id, iso);
}
function escapeHtml(value) { return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function numberToWords(num) { const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']; const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']; if (num === 0) return 'Zero'; const makeWords = (n) => n < 20 ? a[n] : n < 100 ? b[Math.floor(n / 10)] + (n % 10 ? ` ${a[n % 10]}` : '') : n < 1000 ? `${a[Math.floor(n / 100)]} Hundred${n % 100 ? ` and ${makeWords(n % 100)}` : ''}` : n < 100000 ? `${makeWords(Math.floor(n / 1000))} Thousand${n % 1000 ? ` ${makeWords(n % 1000)}` : ''}` : n < 10000000 ? `${makeWords(Math.floor(n / 100000))} Lakh${n % 100000 ? ` ${makeWords(n % 100000)}` : ''}` : `${makeWords(Math.floor(n / 10000000))} Crore${n % 10000000 ? ` ${makeWords(n % 10000000)}` : ''}`; return `${makeWords(num)} Rupees`; }
