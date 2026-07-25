
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec, execFile, spawn } = require('child_process');
const ExcelJS = require('exceljs');
const puppeteer = require('puppeteer');
const QRCode = require('qrcode');
const crypto = require('crypto');
const licenseManager = require('./license-manager');
const adminAuth = require('./admin-auth');
const app = express();
const PORT = 3000;
const GST_RATE = 0.18;
const DESKTOP_PATH = path.join(os.homedir(), 'Desktop', 'Invoices Utility');
const COMPANIES_ROOT = path.join(DESKTOP_PATH, 'Companies');
const REGISTRY_PATH = path.join(DESKTOP_PATH, 'companies.json');
let activeCompanyId = null; // resolved by migrateToCompanies() before the server starts
const companyDir = (id) => path.join(COMPANIES_ROOT, id);
const dbPathFor = (id) => path.join(companyDir(id), 'Invoice_Database.xlsx');
const invoiceRootFor = (id) => path.join(companyDir(id), 'Invoices raised');
const whatsappRootFor = (id) => path.join(companyDir(id), 'Whatsapp integration');
const WA_AUTOMATION_DIR = path.join(__dirname, 'WA Automation');
const WA_AUTOMATION_EXE = path.join(WA_AUTOMATION_DIR, 'WhatsAppAutomationPro.exe');
const WA_AUTOMATION_EXE_PATCHED = path.join(WA_AUTOMATION_DIR, 'WhatsAppAutomationPro Patched.exe');
const WA_AUTOMATION_LAUNCHER = path.join(__dirname, 'wa_automation_launcher2.ps1');
const INVOICE_COLUMNS = [
  { header: 'Task ID', key: 'taskId', width: 26 },
  { header: 'Date Created', key: 'createdAt', width: 18 },
  { header: 'Invoice No', key: 'invoiceNo', width: 18 },
  { header: 'Client Name', key: 'clientName', width: 26 },
  { header: 'Task Details', key: 'details', width: 42 },
  { header: 'Amount', key: 'amount', width: 14 },
  { header: 'GST Charge', key: 'gst', width: 12 },
  { header: 'Total', key: 'total', width: 14 },
  { header: 'Status', key: 'status', width: 20 },
  { header: 'Payment Status', key: 'paymentStatus', width: 20 },
  { header: 'Line Items', key: 'lineItems', width: 60 },
  { header: 'Invoice Date', key: 'invoiceDate', width: 18 },
  { header: 'Invoice File', key: 'invoiceFile', width: 44 },
  { header: 'Invoice Month', key: 'invoiceMonth', width: 20 },
  { header: 'Invoice Group ID', key: 'invoiceGroupId', width: 20 },
  { header: 'Payment Entries', key: 'paymentEntries', width: 60 },
  { header: 'Payment Display', key: 'paymentDisplay', width: 15 },
  { header: 'Service Category', key: 'category', width: 18 },
  { header: 'Reminder DateTime', key: 'reminderDateTime', width: 20 },
  { header: 'Reminder Enabled', key: 'reminderEnabled', width: 16 },
  { header: 'Last Reminder At', key: 'lastReminderAt', width: 20 },
  { header: 'Financial Year', key: 'invoiceFY', width: 12 }
];
const CLIENT_COLUMNS = [
  { header: 'Client Name', key: 'name', width: 30 },
  { header: 'Email', key: 'email', width: 25 },
  { header: 'Phone', key: 'phone', width: 15 },
  { header: 'GSTN', key: 'gstn', width: 20 },
  { header: 'Address', key: 'address', width: 40 },
  { header: 'Created At', key: 'createdAt', width: 18 },
  { header: 'Status', key: 'status', width: 12 },
  { header: 'City', key: 'city', width: 18 },
  { header: 'Pincode', key: 'pincode', width: 12 },
  { header: 'Reminders Enabled', key: 'remindersEnabled', width: 16 }
];
const PROFILE_ROWS = [['firm_name', ''], ['partner_name', ''], ['phone', ''], ['email', ''], ['gstn', ''], ['upi_id', ''], ['logo', ''], ['lastInvoiceNo', '0'], ['bank_name', ''], ['bank_account', ''], ['bank_ifsc', ''], ['lastInvoiceNoGST', '0'], ['lastInvoiceNoNonGST', '0'], ['lastVoucherNo', '0'], ['auto_reminders_enabled', '1']];
const VOUCHER_COLUMNS = [
  { header: 'Voucher No', key: 'voucherNo', width: 20 },
  { header: 'Date', key: 'date', width: 14 },
  { header: 'Party', key: 'party', width: 28 },
  { header: 'Amount', key: 'amount', width: 14 },
  { header: 'Payment Mode', key: 'mode', width: 14 },
  { header: 'Reference No', key: 'reference', width: 22 },
  { header: 'Adjustment Type', key: 'adjustmentType', width: 16 },
  { header: 'Invoice No', key: 'invoiceNo', width: 18 },
  { header: 'Created At', key: 'createdAt', width: 18 },
  { header: 'Advance Amount', key: 'advanceAmount', width: 14 }
];
const REMINDER_HISTORY_COLUMNS = [
  { header: 'Date/Time', key: 'sentAt', width: 20 },
  { header: 'Client', key: 'party', width: 28 },
  { header: 'Company', key: 'company', width: 24 },
  { header: 'Invoice No', key: 'invoiceNo', width: 18 },
  { header: 'Channel', key: 'channel', width: 14 },
  { header: 'Status', key: 'status', width: 14 },
  { header: 'Failure Reason', key: 'failureReason', width: 50 }
];
app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.static(path.join(__dirname, 'app')));
app.get('/license-status', async (req, res) => {
  const localLicense = licenseManager.readLicense();
  const machineId = licenseManager.getMachineID();
  if (!localLicense) return res.json({ isLicensed: false, machineId });
  if (localLicense.machineId && localLicense.machineId !== machineId) {
    return res.json({ isLicensed: false, machineId, error: 'License is bound to another machine.' });
  }
  const result = await licenseManager.verifyWithServer(localLicense.key);
  if (result.success) {
    isLicensed = true;
    licenseInfo = { key: localLicense.key, expiry: result.expiry };
    startWaAutomationWatchdog();
    return res.json({ isLicensed: true, expiry: result.expiry, machineId });
  }
  isLicensed = false;
  return res.json({ isLicensed: false, machineId, error: result.error || result.message || 'Unknown error' });
});
app.post('/activate-license', async (req, res) => {
  const { key } = req.body;
  const result = await licenseManager.activateWithServer(key);
  if (result.success) {
    licenseManager.saveLicense({ key, activatedAt: new Date(), expiry: result.expiry, machineId: licenseManager.getMachineID() });
    isLicensed = true;
    startWaAutomationWatchdog();
    return res.json({ success: true, expiry: result.expiry });
  }
  return res.json({ success: false, error: result.error || result.message || 'Unknown error' });
});
// ---- Admin session auth ------------------------------------------------------
// Sessions live in memory only: every app restart requires a fresh login.
const sessions = new Map(); // token -> expiry epoch ms
const SESSION_TTL = 12 * 60 * 60 * 1000;
function parseCookies(req) {
  const header = req.headers.cookie;
  if (!header) return {};
  const out = {};
  header.split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx > 0) { try { out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim()); } catch { /* skip malformed */ } }
  });
  return out;
}
function sessionFromReq(req) {
  const token = parseCookies(req).authToken;
  if (!token) return null;
  const expiry = sessions.get(token);
  if (!expiry || expiry < Date.now()) { sessions.delete(token); return null; }
  sessions.set(token, Date.now() + SESSION_TTL); // sliding renewal
  return token;
}
setInterval(() => { for (const [token, expiry] of sessions) if (expiry < Date.now()) sessions.delete(token); }, 30 * 60 * 1000).unref();
app.post('/auth/login', (req, res) => {
  const passkey = (req.body && (req.body.passkey ?? req.body.password)) || '';
  if (!adminAuth.verifyPasskey(passkey)) return res.status(401).json({ error: 'Invalid passkey.' });
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, Date.now() + SESSION_TTL);
  res.setHeader('Set-Cookie', `authToken=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200`);
  res.json({ success: true });
});
app.get('/auth/status', (req, res) => {
  const ok = !!sessionFromReq(req);
  res.json({ authenticated: ok, username: ok ? adminAuth.readAdmin()?.username : undefined });
});
app.post('/auth/logout', (req, res) => {
  const token = parseCookies(req).authToken;
  if (token) sessions.delete(token);
  res.setHeader('Set-Cookie', 'authToken=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
  res.json({ success: true });
});
// The gate: every route registered below this point requires a valid session.
// Static files, license routes and the auth routes above stay open.
app.use((req, res, next) => { if (sessionFromReq(req)) return next(); res.status(401).json({ error: 'Not authenticated.' }); });
app.post('/auth/change-password', (req, res) => {
  try {
    adminAuth.changePasskey(req.body || {});
    res.json({ success: true });
  } catch (error) { res.status(400).json({ error: error.message }); }
});
const ensureDir = (p) => { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); };
const json = (v, f = []) => { try { return v ? JSON.parse(typeof v === 'string' ? v : v.text || 'null') : f; } catch { return f; } };
const s = (v) => v == null ? '' : typeof v === 'object' && v.text ? v.text : String(v);
const n = (v) => Number.isFinite(Number(v)) ? Number(v) : 0;
const statusOf = (v) => (v === 'Invoice Generated' || v === 'Invoice Cancelled') ? v : 'Invoice Pending';
const paymentOf = (v) => v === 'Payment Received' ? 'Payment Received' : 'Payment Pending';
const withinRoot = (targetPath, rootPath) => {
  const resolvedTarget = path.resolve(targetPath);
  const resolvedRoot = path.resolve(rootPath);
  return resolvedTarget === resolvedRoot || resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`);
};
function browserExecutableCandidates() {
  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  const programFiles = process.env.PROGRAMFILES || 'C:\\Program Files';
  const programFilesX86 = process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)';
  return [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    path.join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(localAppData, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(programFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(programFilesX86, 'Microsoft', 'Edge', 'Application', 'msedge.exe')
  ].filter(Boolean);
}
async function launchPdfBrowser() {
  const launchErrors = [];
  const launchOptions = { headless: 'new' };
  const attempt = async (label, options) => {
    try {
      return await puppeteer.launch(options);
    } catch (error) {
      launchErrors.push(`${label}: ${error.message}`);
      return null;
    }
  };
  let browser = null;
  if (typeof puppeteer.executablePath === 'function') {
    try {
      const bundledPath = puppeteer.executablePath();
      if (bundledPath && fs.existsSync(bundledPath)) {
        browser = await attempt('bundled-browser', { ...launchOptions, executablePath: bundledPath });
      }
    } catch {
      // Ignore and continue with other discovery strategies.
    }
  }
  if (!browser) {
    browser = await attempt('chrome-channel', { ...launchOptions, channel: 'chrome' });
  }
  if (!browser) {
    for (const executablePath of browserExecutableCandidates()) {
      if (!fs.existsSync(executablePath)) continue;
      browser = await attempt(`path:${executablePath}`, { ...launchOptions, executablePath });
      if (browser) break;
    }
  }
  if (!browser) {
    browser = await attempt('puppeteer-default', launchOptions);
  }
  if (browser) return browser;
  const details = launchErrors.slice(0, 4).join(' | ');
  throw new Error(`Could not start browser for invoice PDF generation. Please install Google Chrome or Microsoft Edge. ${details}`);
}
function runWhatsappAutomation(excelPath) {
  return new Promise((resolve, reject) => {
    if (!excelPath) return reject(new Error('Excel file path is required.'));
    if (!fs.existsSync(excelPath)) return reject(new Error('Selected Excel file was not found.'));
    if (!fs.existsSync(WA_AUTOMATION_EXE) && !fs.existsSync(WA_AUTOMATION_EXE_PATCHED)) return reject(new Error('WhatsAppAutomationPro.exe was not found in the WA Automation folder.'));
    if (!fs.existsSync(WA_AUTOMATION_LAUNCHER)) return reject(new Error('WhatsApp automation launcher script is missing.'));
    execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', WA_AUTOMATION_LAUNCHER, '-ExcelPath', excelPath], { cwd: __dirname, windowsHide: false, timeout: 120000 }, (error, stdout, stderr) => {
      if (error) return reject(new Error((stderr || stdout || error.message).trim()));
      resolve((stdout || 'WhatsApp automation started.').trim());
    });
  });
}
// ---- Keep WhatsApp Automation running continuously once the app is licensed -----
let waWatchdogStarted = false;
function isWaAutomationRunning() {
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-Command',
      "(Get-Process | Where-Object { $_.MainWindowTitle -eq 'WhatsApp Automation Pro' } | Select-Object -First 1) -ne $null"
    ], { windowsHide: true, timeout: 15000 }, (error, stdout) => {
      if (error) return resolve(false);
      resolve(String(stdout).trim().toLowerCase() === 'true');
    });
  });
}
function launchWaAutomationBackground() {
  const exePath = fs.existsSync(WA_AUTOMATION_EXE_PATCHED) ? WA_AUTOMATION_EXE_PATCHED
    : (fs.existsSync(WA_AUTOMATION_EXE) ? WA_AUTOMATION_EXE : null);
  if (!exePath) return;
  try {
    const child = spawn(exePath, [], { cwd: WA_AUTOMATION_DIR, detached: true, stdio: 'ignore' });
    child.unref();
  } catch (err) {
    console.error('Failed to launch WhatsApp automation in background:', err.message);
  }
}
async function ensureWaAutomationRunning() {
  try {
    const running = await isWaAutomationRunning();
    if (!running) launchWaAutomationBackground();
  } catch (err) {
    console.error('WhatsApp automation watchdog check failed:', err.message);
  }
}
// Launches the WA Automation app in the background if it isn't already open, then
// re-checks every 5 minutes so it keeps running continuously instead of a one-off start.
function startWaAutomationWatchdog() {
  if (waWatchdogStarted) return;
  waWatchdogStarted = true;
  ensureWaAutomationRunning();
  setInterval(ensureWaAutomationRunning, 5 * 60 * 1000);
}
function normalizeDate(v) {
  if (!v) return '';
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  let d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime()) && typeof v === 'string') {
    const p = v.split(',')[0].split('/');
    if (p.length === 3) d = new Date(`${p[2]}-${p[1]}-${p[0]}`);
  }
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const displayDate = (v) => normalizeDate(v) ? new Date(`${normalizeDate(v)}T00:00:00`).toLocaleDateString('en-IN') : '';
const monthYear = (v) => normalizeDate(v) ? new Date(`${normalizeDate(v)}T00:00:00`).toLocaleString('en-US', { month: 'long', year: 'numeric' }) : new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' });
const safeName = (v) => String(v || '').replace(/[<>:"/\\|?*\x00-\x1F]/g, '-').replace(/\s+/g, ' ').trim();
function totals(items, chargeGst) { const subtotal = items.reduce((sum, item) => sum + n(item.amt), 0); const gstAmount = chargeGst ? subtotal * GST_RATE : 0; return { subtotal, gstAmount, total: subtotal + gstAmount }; }
function buildTask(body, existing = {}) {
  const items = (Array.isArray(body.items) ? body.items : existing.items || []).map((item) => ({ desc: String(item.desc || '').trim(), hsn: String(item.hsn || '').trim(), amt: n(item.amt) })).filter((item) => item.desc);
  const chargeGst = !!body.chargeGst;
  const t = totals(items, chargeGst);
  return { id: existing.id || body.taskId || `TASK-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, date: normalizeDate(body.date) || existing.date || normalizeDate(new Date()), clientName: String(body.clientName || existing.clientName || '').trim(), items, details: items.map((item) => item.desc).join(', '), amount: t.subtotal, gst: chargeGst ? '18%' : '0%', total: t.total, category: String(body.category != null ? body.category : existing.category || '').trim() };
}
async function loadWorkbook() { const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(dbPathFor(activeCompanyId)); return wb; }
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function normalizeWorkbookError(error) {
  if (!error) return new Error('Unknown workbook error.');
  if (error.code === 'EPERM' || error.code === 'EBUSY') {
    return new Error('Invoice database is locked. Please close "Invoice_Database.xlsx" in Excel or any sync/backup app, then try again.');
  }
  return error instanceof Error ? error : new Error(String(error));
}
async function writeWorkbookSafe(workbook, targetPath = dbPathFor(activeCompanyId)) {
  const waits = [0, 250, 700];
  let lastError = null;
  for (const waitMs of waits) {
    if (waitMs) await delay(waitMs);
    try {
      await workbook.xlsx.writeFile(targetPath);
      return;
    } catch (error) {
      lastError = error;
      if (error.code !== 'EPERM' && error.code !== 'EBUSY') break;
    }
  }
  throw normalizeWorkbookError(lastError);
}
const headers = (sheet) => { const map = {}; sheet.getRow(1).eachCell((cell, i) => { map[cell.value] = i; }); return map; };
const setupInvoiceSheet = (sheet) => { sheet.columns = INVOICE_COLUMNS; };
const setupClientSheet = (sheet) => { sheet.columns = CLIENT_COLUMNS; };
const setupVoucherSheet = (sheet) => { sheet.columns = VOUCHER_COLUMNS; };
const setupReminderHistorySheet = (sheet) => { sheet.columns = REMINDER_HISTORY_COLUMNS; };
function writeTask(row, task) {
  [task.id, task.date, task.invoiceNo || '', task.clientName, task.details, task.amount, task.gst, task.total, task.status, task.paymentStatus, JSON.stringify(task.items || []), task.invoiceDate || '', task.invoiceFile || '', task.invoiceMonth || '', task.invoiceGroupId || '', JSON.stringify(task.paymentEntries || []), task.paymentDisplay || '', task.category || '', task.reminderDateTime || '', task.reminderEnabled === false ? '0' : '1', task.lastReminderAt || '', task.invoiceFY || ''].forEach((value, index) => { row.getCell(index + 1).value = value; });
}
async function initExcelDB() {
  try {
    ensureDir(companyDir(activeCompanyId));
    ensureDir(invoiceRootFor(activeCompanyId));
    if (!fs.existsSync(dbPathFor(activeCompanyId))) {
      const wb = new ExcelJS.Workbook();
      setupInvoiceSheet(wb.addWorksheet('Invoices'));
      setupClientSheet(wb.addWorksheet('Clients'));
      const profile = wb.addWorksheet('Profile');
      profile.columns = [{ header: 'Key', key: 'key', width: 20 }, { header: 'Value', key: 'value', width: 50 }];
      profile.addRows(PROFILE_ROWS);
      setupVoucherSheet(wb.addWorksheet('Vouchers'));
      setupReminderHistorySheet(wb.addWorksheet('ReminderHistory'));
      await writeWorkbookSafe(wb);
      return;
    }
    const wb = await loadWorkbook();
    let invoice = wb.getWorksheet('Invoices');
    if (!invoice) invoice = wb.addWorksheet('Invoices');
    const h = headers(invoice);
    const migrationNeeded = !h['Task ID'] || !h['Status'] || !h['Payment Status'] || !h['Line Items'] || !h['Invoice Date'] || !h['Invoice File'] || !h['Invoice Month'] || !h['Invoice Group ID'] || !h['Payment Entries'];
    if (migrationNeeded) {
      const rows = [];
      invoice.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        const date = normalizeDate(s(h['Date Created'] ? row.getCell(h['Date Created']).value : ''));
        const invoiceNo = s(h['Invoice No'] ? row.getCell(h['Invoice No']).value : '');
        const details = s(h['Task Details'] ? row.getCell(h['Task Details']).value : '');
        const amount = n(h['Amount'] ? row.getCell(h['Amount']).value : 0);
        rows.push({
          taskId: s(h['Task ID'] ? row.getCell(h['Task ID']).value : '') || `TASK-${Date.now()}-${rowNumber}`,
          createdAt: date || normalizeDate(new Date()),
          invoiceNo,
          clientName: s(h['Client Name'] ? row.getCell(h['Client Name']).value : ''),
          details,
          amount,
          gst: s(h['GST Charge'] ? row.getCell(h['GST Charge']).value : '0%') || '0%',
          total: n(h['Total'] ? row.getCell(h['Total']).value : amount),
          status: statusOf(s(h['Status'] ? row.getCell(h['Status']).value : invoiceNo ? 'Invoice Generated' : 'Invoice Pending')),
          paymentStatus: paymentOf(s(h['Payment Status'] ? row.getCell(h['Payment Status']).value : 'Payment Pending')),
          lineItems: JSON.stringify(json(h['Line Items'] ? row.getCell(h['Line Items']).value : '', details ? [{ desc: details, amt: amount }] : [])),
          invoiceDate: normalizeDate(s(h['Invoice Date'] ? row.getCell(h['Invoice Date']).value : '')) || date,
          invoiceFile: s(h['Invoice File'] ? row.getCell(h['Invoice File']).value : ''),
          invoiceMonth: s(h['Invoice Month'] ? row.getCell(h['Invoice Month']).value : '') || (invoiceNo ? monthYear(date) : ''),
          invoiceGroupId: s(h['Invoice Group ID'] ? row.getCell(h['Invoice Group ID']).value : '') || invoiceNo || `TASK-${rowNumber}`,
          paymentEntries: JSON.stringify(json(h['Payment Entries'] ? row.getCell(h['Payment Entries']).value : '', []))
        });
      });
      invoice.spliceRows(1, invoice.rowCount);
      setupInvoiceSheet(invoice);
      rows.forEach((r) => invoice.addRow(r));
    } else {
      setupInvoiceSheet(invoice);
    }
    let clients = wb.getWorksheet('Clients');
    if (!clients) clients = wb.addWorksheet('Clients');
    setupClientSheet(clients);
    let vouchers = wb.getWorksheet('Vouchers');
    if (!vouchers) vouchers = wb.addWorksheet('Vouchers');
    setupVoucherSheet(vouchers);
    let reminderHistory = wb.getWorksheet('ReminderHistory');
    if (!reminderHistory) reminderHistory = wb.addWorksheet('ReminderHistory');
    setupReminderHistorySheet(reminderHistory);
    let profile = wb.getWorksheet('Profile');
    if (!profile) {
      profile = wb.addWorksheet('Profile');
      profile.columns = [{ header: 'Key', key: 'key', width: 20 }, { header: 'Value', key: 'value', width: 50 }];
      profile.addRows(PROFILE_ROWS);
    } else {
      const existingKeys = new Set();
      profile.eachRow((row, i) => { if (i > 1) existingKeys.add(row.getCell(1).value); });
      PROFILE_ROWS.forEach(([key, defaultVal]) => { if (!existingKeys.has(key)) profile.addRow([key, defaultVal]); });
      // One-time seed: pre-split workbooks have a single lastInvoiceNo counter. Both new
      // series start from that value so no new number can collide with a historical one.
      const hadGstCounter = existingKeys.has('lastInvoiceNoGST');
      const hadNonGstCounter = existingKeys.has('lastInvoiceNoNonGST');
      if (!hadGstCounter || !hadNonGstCounter) {
        let legacyLast = '0';
        profile.eachRow((row, i) => { if (i > 1 && row.getCell(1).value === 'lastInvoiceNo') legacyLast = String(row.getCell(2).value || '0'); });
        profile.eachRow((row, i) => {
          if (i > 1 && row.getCell(1).value === 'lastInvoiceNoGST' && !hadGstCounter) row.getCell(2).value = legacyLast;
          if (i > 1 && row.getCell(1).value === 'lastInvoiceNoNonGST' && !hadNonGstCounter) row.getCell(2).value = legacyLast;
        });
      }
    }
    await writeWorkbookSafe(wb);
  } catch (error) { console.error('Database Initialization failed:', error); }
}
function profileFromWorkbook(wb) {
  const sheet = wb.getWorksheet('Profile');
  const profile = {};
  if (sheet) sheet.eachRow((row, i) => { if (i > 1) profile[row.getCell(1).value] = row.getCell(2).value || ''; });
  return profile;
}
async function readProfile() {
  const wb = await loadWorkbook();
  return profileFromWorkbook(wb);
}
// Parse a company's workbook by id, without touching the module-level activeCompanyId —
// used by cross-company views (Auto Reminders) and the reminder sweep.
async function readWorkbookFor(companyId) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(dbPathFor(companyId));
  return wb;
}
function clientsFromWorkbook(wb) {
  const sheet = wb.getWorksheet('Clients');
  if (!sheet) return [];
  setupClientSheet(sheet);
  const h = headers(sheet);
  const out = [];
  sheet.eachRow((row, i) => {
    if (i === 1) return;
    out.push({
      row,
      name: s(row.getCell(h['Client Name'] || 1).value),
      email: s(row.getCell(h['Email'] || 2).value),
      phone: s(row.getCell(h['Phone'] || 3).value),
      remindersEnabled: h['Reminders Enabled'] ? s(row.getCell(h['Reminders Enabled']).value) !== '0' : true
    });
  });
  return out;
}
function tasksFromWorkbook(wb) {
  const sheet = wb.getWorksheet('Invoices');
  setupInvoiceSheet(sheet);
  const tasks = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const items = json(row.getCell(11).value, []);
    tasks.push({
      row,
      id: s(row.getCell(1).value),
      date: normalizeDate(row.getCell(2).value),
      invoiceNo: s(row.getCell(3).value),
      clientName: s(row.getCell(4).value),
      details: s(row.getCell(5).value),
      amount: n(row.getCell(6).value),
      gst: s(row.getCell(7).value) || '0%',
      total: n(row.getCell(8).value),
      status: statusOf(s(row.getCell(9).value)),
      paymentStatus: paymentOf(s(row.getCell(10).value)),
      items: items.length ? items : (s(row.getCell(5).value) ? [{ desc: s(row.getCell(5).value), amt: n(row.getCell(6).value) }] : []),
      invoiceDate: normalizeDate(row.getCell(12).value) || normalizeDate(row.getCell(2).value),
      invoiceFile: s(row.getCell(13).value),
      invoiceMonth: s(row.getCell(14).value),
      invoiceGroupId: s(row.getCell(15).value),
      paymentEntries: json(row.getCell(16).value, []),
      paymentDisplay: s(row.getCell(17).value),
      category: s(row.getCell(18).value),
      reminderDateTime: s(row.getCell(19).value),
      reminderEnabled: s(row.getCell(20).value) !== '0',
      lastReminderAt: s(row.getCell(21).value),
      invoiceFY: s(row.getCell(22).value)
    });
  });
  return { sheet, tasks };
}
async function loadTasks() {
  const wb = await loadWorkbook();
  const { sheet, tasks } = tasksFromWorkbook(wb);
  return { wb, sheet, tasks };
}
function latestDate(tasks) { return tasks.reduce((latest, task) => task.date > latest ? task.date : latest, tasks[0]?.date || normalizeDate(new Date())); }
// Same Indian-FY numbering scheme as invoices: resets per financial year, never reused.
async function nextVoucherNo(wb, voucherDate) {
  const sheet = wb.getWorksheet('Profile');
  const fy = fyLabel(voucherDate);
  const key = `lastVoucherNo_${fy}`;
  let next = 1; let found = false;
  sheet.eachRow((row, i) => {
    if (i > 1 && row.getCell(1).value === key) {
      next = (parseInt(row.getCell(2).value || '0', 10) || 0) + 1;
      row.getCell(2).value = String(next);
      found = true;
    }
  });
  if (!found) sheet.addRow([key, String(next)]);
  return `VCH/${fy}/${String(next).padStart(6, '0')}`;
}
async function loadVouchers() {
  const wb = await loadWorkbook();
  let sheet = wb.getWorksheet('Vouchers');
  if (!sheet) sheet = wb.addWorksheet('Vouchers');
  setupVoucherSheet(sheet);
  const vouchers = [];
  sheet.eachRow((row, i) => {
    if (i === 1) return;
    vouchers.push({ voucherNo: s(row.getCell(1).value), date: normalizeDate(row.getCell(2).value), party: s(row.getCell(3).value), amount: n(row.getCell(4).value), mode: s(row.getCell(5).value), reference: s(row.getCell(6).value), adjustmentType: s(row.getCell(7).value), invoiceNo: s(row.getCell(8).value), createdAt: s(row.getCell(9).value), advanceAmount: n(row.getCell(10).value) });
  });
  return { wb, sheet, vouchers };
}
function partyAdvances(vouchers) {
  const map = {};
  vouchers.forEach((v) => {
    // Use the per-voucher advanceAmount when present; fall back to the full amount for legacy
    // 'Advance' rows written before the Advance Amount column existed.
    let adv = n(v.advanceAmount);
    if (adv < 0.005 && v.adjustmentType === 'Advance') adv = n(v.amount);
    if (adv > 0.005) map[v.party] = (map[v.party] || 0) + adv;
  });
  return map;
}
function invoiceSummary(tasks) {
  const subtotal = tasks.reduce((sum, task) => sum + n(task.amount), 0);
  const grossTotal = tasks.reduce((sum, task) => sum + n(task.total), 0);
  const gstAmount = grossTotal - subtotal;
  const paymentEntries = tasks[0]?.paymentEntries || [];
  const adjustments = paymentEntries.flatMap((entry) => [{ desc: `Amount received - ${displayDate(entry.date)}`, amt: -n(entry.amountReceived) }, { desc: `Discount given - ${displayDate(entry.date)}`, amt: -n(entry.discountGiven) }].filter((item) => item.amt !== 0));
  const adjustmentTotal = adjustments.reduce((sum, item) => sum + n(item.amt), 0);
  return { subtotal, grossTotal, gstAmount, adjustments, adjustmentTotal, outstanding: grossTotal + adjustmentTotal };
}
// ---- Reports -----------------------------------------------------------------
function invoiceGroupsOf(tasks) {
  const map = new Map();
  for (const task of tasks) {
    if (!task.invoiceNo || task.status !== 'Invoice Generated') continue;
    if (!map.has(task.invoiceNo)) map.set(task.invoiceNo, []);
    map.get(task.invoiceNo).push(task);
  }
  return [...map.values()].map((group) => ({
    invoiceNo: group[0].invoiceNo,
    clientName: group[0].clientName,
    invoiceDate: group[0].invoiceDate || latestDate(group),
    gst: group.some((task) => task.gst === '18%'),
    paymentStatus: group[0].paymentStatus,
    paymentEntries: group[0].paymentEntries || [], // duplicated across the group — read once
    summary: invoiceSummary(group)
  }));
}
const inRange = (d, from, to) => (!from || d >= from) && (!to || d <= to);
const money = (v) => Number(n(v).toFixed(2));
const REPORT_TYPES = ['sales', 'outstanding', 'ledger', 'gst', 'nongst'];
async function buildReport(type, query = {}) {
  const from = normalizeDate(query.from || '') || '';
  const to = normalizeDate(query.to || '') || '';
  const client = s(query.client || '').trim();
  const { wb, tasks } = await loadTasks();
  const profile = await readProfile();
  const groups = invoiceGroupsOf(tasks).sort((a, b) => a.invoiceDate.localeCompare(b.invoiceDate) || a.invoiceNo.localeCompare(b.invoiceNo));
  const rangeText = from || to ? `${from ? displayDate(from) : 'Start'} to ${to ? displayDate(to) : 'Today'}` : 'All time';
  if (type === 'sales') {
    const rows = groups.filter((g) => inRange(g.invoiceDate, from, to))
      .map((g) => [g.invoiceNo, displayDate(g.invoiceDate), g.clientName, money(g.summary.subtotal), money(g.summary.gstAmount), money(g.summary.grossTotal), g.paymentStatus]);
    return {
      title: 'Sales Report', subtitle: `${rangeText} — generated invoices only`, firmName: profile.firm_name || '',
      columns: [{ header: 'Invoice No' }, { header: 'Date' }, { header: 'Client' }, { header: 'Taxable Value', num: true }, { header: 'GST', num: true }, { header: 'Total', num: true }, { header: 'Payment Status' }],
      rows, totals: ['Total', '', '', money(rows.reduce((s2, r) => s2 + r[3], 0)), money(rows.reduce((s2, r) => s2 + r[4], 0)), money(rows.reduce((s2, r) => s2 + r[5], 0)), '']
    };
  }
  if (type === 'outstanding') {
    const rows = groups.filter((g) => g.summary.outstanding > 0.005 && inRange(g.invoiceDate, from, to))
      .sort((a, b) => a.clientName.localeCompare(b.clientName) || a.invoiceDate.localeCompare(b.invoiceDate))
      .map((g) => [g.clientName, g.invoiceNo, displayDate(g.invoiceDate), money(g.summary.grossTotal), money(Math.abs(g.summary.adjustmentTotal)), money(g.summary.outstanding)]);
    return {
      title: 'Outstanding Report', subtitle: `${rangeText} — invoices with balance due`, firmName: profile.firm_name || '',
      columns: [{ header: 'Client' }, { header: 'Invoice No' }, { header: 'Date' }, { header: 'Invoice Total', num: true }, { header: 'Received / Discount', num: true }, { header: 'Balance Due', num: true }],
      rows, totals: ['Total', '', '', money(rows.reduce((s2, r) => s2 + r[3], 0)), money(rows.reduce((s2, r) => s2 + r[4], 0)), money(rows.reduce((s2, r) => s2 + r[5], 0))]
    };
  }
  if (type === 'ledger') {
    if (!client) throw new Error('Select a client for the party ledger.');
    const events = [];
    for (const g of groups) {
      if (g.clientName !== client) continue;
      events.push({ date: g.invoiceDate, particulars: `Invoice ${g.invoiceNo}`, debit: money(g.summary.grossTotal), credit: 0, ord: 0 });
      for (const entry of g.paymentEntries) {
        const credit = money(n(entry.amountReceived) + n(entry.discountGiven));
        if (!credit) continue;
        const discountNote = n(entry.discountGiven) ? ` (incl. discount ₹${n(entry.discountGiven).toLocaleString('en-IN')})` : '';
        events.push({ date: normalizeDate(entry.date), particulars: `Payment against ${g.invoiceNo}${discountNote}`, debit: 0, credit, ord: 1 });
      }
    }
    events.sort((a, b) => a.date.localeCompare(b.date) || a.ord - b.ord || a.particulars.localeCompare(b.particulars));
    const opening = from ? money(events.filter((e) => e.date < from).reduce((s2, e) => s2 + e.debit - e.credit, 0)) : 0;
    const visible = events.filter((e) => inRange(e.date, from, to));
    let balance = opening;
    const rows = [];
    if (from) rows.push(['', 'Opening Balance', '', '', opening]);
    for (const e of visible) { balance = money(balance + e.debit - e.credit); rows.push([displayDate(e.date), e.particulars, e.debit || '', e.credit || '', balance]); }
    return {
      title: 'Party Ledger', subtitle: `${client} — ${rangeText}`, firmName: profile.firm_name || '',
      columns: [{ header: 'Date' }, { header: 'Particulars' }, { header: 'Debit', num: true }, { header: 'Credit', num: true }, { header: 'Balance', num: true }],
      rows, totals: ['Total', '', money(visible.reduce((s2, e) => s2 + e.debit, 0)), money(visible.reduce((s2, e) => s2 + e.credit, 0)), balance]
    };
  }
  if (type === 'gst' || type === 'nongst') {
    const wantGst = type === 'gst';
    const gstnByClient = new Map();
    const clientsSheet = wb.getWorksheet('Clients');
    if (clientsSheet) { const h = headers(clientsSheet); clientsSheet.eachRow((row, i) => { if (i > 1) gstnByClient.set(s(row.getCell(h['Client Name'] || 1).value), s(row.getCell(h['GSTN'] || 4).value)); }); }
    const rows = groups.filter((g) => g.gst === wantGst && inRange(g.invoiceDate, from, to))
      .map((g) => wantGst
        ? [g.invoiceNo, displayDate(g.invoiceDate), g.clientName, gstnByClient.get(g.clientName) || '', money(g.summary.subtotal), money(g.summary.gstAmount), money(g.summary.grossTotal)]
        : [g.invoiceNo, displayDate(g.invoiceDate), g.clientName, money(g.summary.grossTotal), g.paymentStatus]);
    const billCountLabel = `Total Bills: ${rows.length}`;
    return wantGst ? {
      title: 'Primary Bill Report', subtitle: `${rangeText} — GST invoices — ${rows.length} bill${rows.length === 1 ? '' : 's'}`, firmName: profile.firm_name || '',
      columns: [{ header: 'Invoice No' }, { header: 'Date' }, { header: 'Client' }, { header: 'Client GSTN' }, { header: 'Taxable Value', num: true }, { header: 'GST (18%)', num: true }, { header: 'Invoice Total', num: true }],
      rows, totals: [billCountLabel, '', '', '', money(rows.reduce((s2, r) => s2 + r[4], 0)), money(rows.reduce((s2, r) => s2 + r[5], 0)), money(rows.reduce((s2, r) => s2 + r[6], 0))]
    } : {
      title: 'Secondary Bill Report', subtitle: `${rangeText} — Non-GST invoices — ${rows.length} bill${rows.length === 1 ? '' : 's'}`, firmName: profile.firm_name || '',
      columns: [{ header: 'Invoice No' }, { header: 'Date' }, { header: 'Client' }, { header: 'Amount', num: true }, { header: 'Payment Status' }],
      rows, totals: [billCountLabel, '', '', money(rows.reduce((s2, r) => s2 + r[3], 0)), '']
    };
  }
  throw new Error('Unknown report type.');
}
function invoiceLines(tasks) {
  const lines = [];
  tasks.slice().sort((a, b) => a.date.localeCompare(b.date)).forEach((task) => {
    const items = (task.items && task.items.length) ? task.items : [{ desc: task.details, amt: task.amount, hsn: '' }];
    items.forEach((item) => { lines.push({ desc: s(item.desc).trim() || task.details, hsn: s(item.hsn).trim(), amt: n(item.amt) }); });
  });
  return lines;
}
// Indian financial year: April (month index 3) through March. "2026-07-18" -> "26-27".
function fyLabel(dateInput) {
  const d = dateInput instanceof Date ? dateInput : new Date(`${normalizeDate(dateInput) || normalizeDate(new Date())}T00:00:00`);
  const startYear = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return `${String(startYear).slice(-2)}-${String(startYear + 1).slice(-2)}`;
}
// Sequence is scoped per company (one workbook per company) + series (GST/Non-GST prefix) + financial
// year, and resets to 1 at the start of each new FY. Each FY gets its own persisted counter key so past
// years' counters are never touched or reused, guaranteeing numbers are unique and never reissued.
async function nextInvoiceNo(wb, chargeGst, invoiceDate) {
  const sheet = wb.getWorksheet('Profile');
  const fy = fyLabel(invoiceDate);
  const key = `${chargeGst ? 'lastInvoiceNoGST' : 'lastInvoiceNoNonGST'}_${fy}`;
  const prefix = chargeGst ? 'GST' : 'INV';
  let next = 1; let found = false;
  sheet.eachRow((row, i) => {
    if (i > 1 && row.getCell(1).value === key) {
      next = (parseInt(row.getCell(2).value || '0', 10) || 0) + 1;
      row.getCell(2).value = String(next);
      found = true;
    }
  });
  if (!found) sheet.addRow([key, String(next)]);
  return { invoiceNo: `${prefix}/${fy}/${String(next).padStart(6, '0')}`, fy };
}
async function renderInvoice(tasks, invoiceNo, invoiceDate, paymentStatus, paymentDisplay) {
  const profile = await readProfile();
  const clientsWb = await loadWorkbook();
  const clients = clientsWb.getWorksheet('Clients');
  const h = headers(clients);
  let client = { address: '', phone: '', gstn: '', city: '', pincode: '' };
  clients.eachRow((row, i) => { if (i > 1 && s(row.getCell(h['Client Name'] || 1).value) === tasks[0].clientName) client = { address: s(row.getCell(h['Address'] || 5).value), phone: s(row.getCell(h['Phone'] || 3).value), gstn: s(row.getCell(h['GSTN'] || 4).value), city: s(h['City'] ? row.getCell(h['City']).value : ''), pincode: s(h['Pincode'] ? row.getCell(h['Pincode']).value : '') }; });
  const summary = invoiceSummary(tasks);
  // Invoices are a static billed document: payments/vouchers are tracked separately
  // in-app and must never add lines to, or change amounts on, a generated invoice.
  const lines = invoiceLines(tasks);
  const rows = lines.map((item, index) => `<tr style="page-break-inside:avoid"><td style="padding:12px;border:1px solid #cbd5e1;text-align:center;vertical-align:top;">${index + 1}</td><td style="padding:12px;border:1px solid #cbd5e1;vertical-align:top;word-wrap:break-word;overflow-wrap:break-word;">${item.desc}</td><td style="padding:12px;border:1px solid #cbd5e1;text-align:center;vertical-align:top;word-wrap:break-word;overflow-wrap:break-word;">${item.hsn || ''}</td><td style="padding:12px;border:1px solid #cbd5e1;text-align:right;vertical-align:top;">${item.amt.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>`).join('');
  const month = monthYear(invoiceDate);
  const dir = path.join(invoiceRootFor(activeCompanyId), month);
  ensureDir(dir);
  const filename = `${safeName(invoiceNo.replace(/\//g, '-'))}-${safeName(tasks[0].clientName)}.pdf`;
  const filePath = path.join(dir, filename);
  // Generate QR data URL server-side using the qrcode package \u2014 no browser/canvas required.
  let qrDataUrl = '';
  if (paymentDisplay === 'qr' && profile.upi_id) {
    const balanceDue = Math.max(summary.outstanding, 0);
    const upiUri = `upi://pay?pa=${encodeURIComponent(profile.upi_id)}&pn=${encodeURIComponent(profile.firm_name || '')}&am=${balanceDue.toFixed(2)}&cu=INR`;
    qrDataUrl = await QRCode.toDataURL(upiUri, { width: 200, margin: 2, color: { dark: '#000000', light: '#ffffff' } });
  }
  const browser = await launchPdfBrowser();
  let paymentSection = '';
  if (paymentDisplay === 'bank' && (profile.bank_name || profile.bank_account || profile.bank_ifsc)) {
    paymentSection = `<div style="margin-top:28px;border:1px solid #cbd5e1;border-radius:10px;padding:16px;background:#f8fafc"><strong style="color:#5b21b6;">Payment Details</strong><table style="margin:10px 0 0;width:auto;border-collapse:collapse"><tr><td style="padding:4px 12px 4px 0;color:#64748b;font-size:13px;">Bank Name</td><td style="padding:4px 0;font-weight:700;">${profile.bank_name || ''}</td></tr><tr><td style="padding:4px 12px 4px 0;color:#64748b;font-size:13px;">Account No.</td><td style="padding:4px 0;font-weight:700;">${profile.bank_account || ''}</td></tr><tr><td style="padding:4px 12px 4px 0;color:#64748b;font-size:13px;">IFSC Code</td><td style="padding:4px 0;font-weight:700;">${profile.bank_ifsc || ''}</td></tr></table></div>`;
  } else if (paymentDisplay === 'qr' && qrDataUrl) {
    paymentSection = `<div style="margin-top:28px;border:1px solid #cbd5e1;border-radius:10px;padding:16px;background:#f8fafc;display:inline-block"><strong style="color:#5b21b6;display:block;margin-bottom:10px;">Pay via UPI</strong><img src="${qrDataUrl}" width="140" height="140" style="display:block;"/><div style="margin-top:8px;font-size:12px;color:#64748b;">${profile.upi_id}</div></div>`;
  }
  const html = `<!DOCTYPE html><html><head><style>body{font-family:Arial,sans-serif;color:#1e293b;padding:32px}.head{display:flex;justify-content:space-between;border-bottom:2px solid #5b21b6;padding-bottom:16px;margin-bottom:24px}table{width:100%;border-collapse:collapse;margin:24px 0}table.items{table-layout:fixed}table.items td{word-wrap:break-word;overflow-wrap:break-word;}table.items tr{page-break-inside:avoid}thead{display:table-header-group}.meta{display:flex;gap:20px;margin-bottom:24px}.box{flex:1;background:#f8fafc;border-radius:10px;padding:16px}.summary td{padding:8px 0}.summary .total{font-size:18px;font-weight:700;border-top:2px solid #5b21b6}</style></head><body><div class="head"><div><h1 style="margin:0;color:#5b21b6;">${profile.firm_name || ''}</h1><div>${profile.partner_name || ''}</div><div>${profile.phone || ''} | ${profile.email || ''}</div></div><div style="text-align:right"><h2 style="margin:0;color:#5b21b6;">INVOICE</h2><div><strong>No:</strong> ${invoiceNo}</div><div><strong>Date:</strong> ${displayDate(invoiceDate)}</div></div></div><div class="meta"><div class="box"><strong>Bill To</strong><div style="margin-top:8px">${tasks[0].clientName}</div><div>${client.address.replace(/\n/g, '<br>')}</div>${client.city || client.pincode ? `<div>${[client.city, client.pincode].filter(Boolean).join(' - ')}</div>` : ''}<div>${client.phone}</div><div>${client.gstn}</div></div></div><table class="items"><colgroup><col style="width:8%"><col style="width:47%"><col style="width:17%"><col style="width:28%"></colgroup><thead><tr style="background:#1e3a8a;color:#fff"><th style="padding:12px">#</th><th style="padding:12px;text-align:left">Description</th><th style="padding:12px;text-align:center">HSN/SAC</th><th style="padding:12px;text-align:right">Amount (\u20B9)</th></tr></thead><tbody>${rows}</tbody></table><table class="summary" style="margin-left:auto;width:320px"><tr><td>Sub-total</td><td style="text-align:right">\u20B9${summary.subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>${summary.gstAmount ? `<tr><td>GST</td><td style="text-align:right">\u20B9${summary.gstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>` : ''}<tr class="total"><td>Total</td><td style="text-align:right">\u20B9${summary.grossTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr></table>${paymentSection}</body></html>`;
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0' });
  await page.pdf({ path: filePath, format: 'A4', printBackground: true, margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' } });
  await browser.close();
  return { month, filename };
}
app.get('/companies', (req, res) => {
  try {
    const registry = readRegistry();
    if (!registry) return res.status(500).json({ error: 'Company registry not initialised.' });
    res.json({ companies: registry.companies, activeCompanyId });
  } catch (error) { res.status(500).json({ error: error.message }); }
});
app.post('/companies', async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Company name is required.' });
    const registry = readRegistry();
    if (!registry) return res.status(500).json({ error: 'Company registry not initialised.' });
    const companyId = uniqueCompanyId(name, new Set(registry.companies.map((c) => c.id)));
    ensureDir(companyDir(companyId));
    registry.companies.push({ id: companyId, name, createdAt: normalizeDate(new Date()) });
    registry.activeCompanyId = companyId;
    writeRegistry(registry);
    activeCompanyId = companyId;
    await initExcelDB(); // create the workbook now so the frontend's next /profile call can't hit a missing file
    res.json({ success: true, companyId });
  } catch (error) { res.status(500).json({ error: error.message }); }
});
app.post('/companies/switch', async (req, res) => {
  try {
    const companyId = String(req.body.companyId || '');
    const registry = readRegistry();
    if (!registry) return res.status(500).json({ error: 'Company registry not initialised.' });
    if (!registry.companies.some((c) => c.id === companyId)) return res.status(404).json({ error: 'Unknown company.' });
    registry.activeCompanyId = companyId;
    writeRegistry(registry);
    activeCompanyId = companyId;
    await initExcelDB(); // no-op for up-to-date workbooks; backfills new Profile keys for stale ones
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: error.message }); }
});
app.get('/profile', async (req, res) => { try { res.json(await readProfile()); } catch (error) { res.status(500).json({ error: error.message }); } });
app.post('/profile', async (req, res) => {
  try {
    const wb = await loadWorkbook();
    const sheet = wb.getWorksheet('Profile');
    sheet.eachRow((row, i) => { if (i > 1) { const key = row.getCell(1).value; if (req.body[key] !== undefined) row.getCell(2).value = req.body[key]; } });
    await writeWorkbookSafe(wb); res.json({ success: true });
  } catch (error) { res.status(500).json({ error: normalizeWorkbookError(error).message }); }
});
app.get('/clients', async (req, res) => {
  try {
    const wb = await loadWorkbook(); const sheet = wb.getWorksheet('Clients'); setupClientSheet(sheet); const h = headers(sheet); const out = [];
    sheet.eachRow((row, i) => { if (i > 1) out.push({ name: s(row.getCell(h['Client Name'] || 1).value), email: s(row.getCell(h['Email'] || 2).value), phone: s(row.getCell(h['Phone'] || 3).value), gstn: s(row.getCell(h['GSTN'] || 4).value), address: s(row.getCell(h['Address'] || 5).value), createdAt: normalizeDate(h['Created At'] ? row.getCell(h['Created At']).value : ''), status: s(h['Status'] ? row.getCell(h['Status']).value : '') || 'Active', city: s(h['City'] ? row.getCell(h['City']).value : ''), pincode: s(h['Pincode'] ? row.getCell(h['Pincode']).value : ''), remindersEnabled: h['Reminders Enabled'] ? s(row.getCell(h['Reminders Enabled']).value) !== '0' : true }); });
    out.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    res.json(out);
  } catch (error) { res.status(500).json({ error: error.message }); }
});
app.post('/clients', async (req, res) => {
  try {
    const wb = await loadWorkbook(); const sheet = wb.getWorksheet('Clients'); setupClientSheet(sheet); const h = headers(sheet); let found = false;
    const city = s(req.body.city).trim(); const pincode = s(req.body.pincode).trim();
    sheet.eachRow((row, i) => {
      if (i > 1 && s(row.getCell(1).value) === req.body.name) {
        [req.body.name, req.body.email, req.body.phone, req.body.gstn, req.body.address].forEach((v, idx) => { row.getCell(idx + 1).value = v; });
        if (h['Status']) row.getCell(h['Status']).value = req.body.status || s(row.getCell(h['Status']).value) || 'Active';
        if (h['Created At'] && !s(row.getCell(h['Created At']).value)) row.getCell(h['Created At']).value = normalizeDate(new Date());
        if (h['City']) row.getCell(h['City']).value = city;
        if (h['Pincode']) row.getCell(h['Pincode']).value = pincode;
        found = true;
      }
    });
    // City + Pincode are mandatory for NEW clients only (existing clients stay editable without forcing).
    if (!found) {
      if (!city) return res.status(400).json({ error: 'City is required.' });
      if (!/^\d{6}$/.test(pincode)) return res.status(400).json({ error: 'Pincode must be a 6-digit number.' });
      sheet.addRow({ name: req.body.name, email: req.body.email, phone: req.body.phone, gstn: req.body.gstn, address: req.body.address, createdAt: normalizeDate(new Date()), status: req.body.status || 'Active', city, pincode });
    }
    await writeWorkbookSafe(wb); res.json({ success: true });
  } catch (error) { res.status(500).json({ error: normalizeWorkbookError(error).message }); }
});
const CLIENT_BULK_HEADERS = ['Client Name', 'Email', 'Phone', 'GSTN', 'Address', 'City', 'Pincode', 'Status'];
app.get('/clients/bulk-template', async (req, res) => {
  try {
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet('Clients');
    sheet.columns = CLIENT_BULK_HEADERS.map((header) => ({ header, width: Math.max(header.length + 4, 18) }));
    sheet.getRow(1).font = { bold: true };
    sheet.addRow(['Acme Traders', 'accounts@acme.com', '9876543210', '27ABCDE1234F1Z5', '123 MG Road', 'Mumbai', '400001', 'Active']);
    sheet.addRow(['Rahul Sharma', '', '9123456780', '', '', 'Pune', '411001', 'Active']);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="Bulk Client Upload Template.xlsx"');
    await wb.xlsx.write(res); res.end();
  } catch (error) { res.status(500).json({ error: error.message }); }
});
const wordCountServer = (v) => { const t = s(v).trim(); return t ? t.split(/\s+/).length : 0; };
app.post('/clients/bulk', async (req, res) => {
  try {
    const fileBase64 = s(req.body.fileBase64);
    if (!fileBase64) return res.status(400).json({ error: 'No file provided.' });
    const upload = new ExcelJS.Workbook();
    await upload.xlsx.load(Buffer.from(fileBase64, 'base64'));
    const sheet = upload.worksheets[0];
    if (!sheet) return res.status(400).json({ error: 'The uploaded file has no sheets.' });
    const h = headers(sheet);
    const col = (row, name, fallback) => { const idx = h[name] || fallback; return idx ? row.getCell(idx).value : ''; };
    const wb = await loadWorkbook();
    const clientsSheet = wb.getWorksheet('Clients'); setupClientSheet(clientsSheet);
    const known = new Set(); clientsSheet.eachRow((row, i) => { if (i > 1) known.add(s(row.getCell(1).value).toLowerCase()); });
    let created = 0; const errors = [];
    sheet.eachRow((row, i) => {
      if (i === 1) return;
      const name = s(col(row, 'Client Name', 1)).trim();
      const email = s(col(row, 'Email', 2)).trim();
      const phone = s(col(row, 'Phone', 3)).trim();
      const gstn = s(col(row, 'GSTN', 4)).trim();
      const address = s(col(row, 'Address', 5)).trim();
      const city = s(col(row, 'City', 6)).trim();
      const pincode = s(col(row, 'Pincode', 7)).trim();
      const status = s(col(row, 'Status', 8)).trim() || 'Active';
      if (!name && !city && !pincode) return; // blank row
      if (!name) { errors.push(`Row ${i}: Client Name is required.`); return; }
      if (wordCountServer(name) > 30) { errors.push(`Row ${i}: Client name cannot exceed 30 words.`); return; }
      if (known.has(name.toLowerCase())) { errors.push(`Row ${i}: "${name}" already exists, skipped.`); return; }
      if (email) {
        if (email.length > 30) { errors.push(`Row ${i}: Email cannot exceed 30 characters.`); return; }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { errors.push(`Row ${i}: Invalid email address.`); return; }
      }
      if (phone && !/^[6-9]\d{9}$/.test(phone)) { errors.push(`Row ${i}: Invalid 10-digit phone number.`); return; }
      if (wordCountServer(address) > 20) { errors.push(`Row ${i}: Address cannot exceed 20 words.`); return; }
      if (!city) { errors.push(`Row ${i}: City is required.`); return; }
      if (!/^\d{6}$/.test(pincode)) { errors.push(`Row ${i}: Pincode must be a 6-digit number.`); return; }
      clientsSheet.addRow({ name, email, phone, gstn, address, createdAt: normalizeDate(new Date()), status, city, pincode });
      known.add(name.toLowerCase());
      created += 1;
    });
    await writeWorkbookSafe(wb);
    res.json({ success: true, created, errors });
  } catch (error) { res.status(400).json({ error: normalizeWorkbookError(error).message }); }
});
app.delete('/clients/:name', async (req, res) => {
  try {
    const name = decodeURIComponent(req.params.name);
    const { wb, tasks } = await loadTasks();
    if (tasks.some((t) => t.clientName === name)) return res.status(400).json({ error: 'This client has tasks/invoices. Delete those first.' });
    const sheet = wb.getWorksheet('Clients'); setupClientSheet(sheet);
    let target = null;
    sheet.eachRow((row, i) => { if (i > 1 && s(row.getCell(1).value) === name) target = i; });
    if (!target) return res.status(404).json({ error: 'Client not found.' });
    sheet.spliceRows(target, 1);
    await writeWorkbookSafe(wb); res.json({ success: true });
  } catch (error) { res.status(500).json({ error: normalizeWorkbookError(error).message }); }
});
// Reverses any invoice payment(s) a voucher applied — removes its tagged payment entries from
// every affected invoice group and recomputes their payment status. Payment tracking only; the
// invoice PDF itself is never re-rendered by voucher activity. Shared by delete and edit.
function reverseVoucherPayments(tasks, voucherNo) {
  const groups = {};
  tasks.forEach((t) => { if (t.invoiceNo) (groups[t.invoiceNo] = groups[t.invoiceNo] || []).push(t); });
  for (const group of Object.values(groups)) {
    const entries = group[0].paymentEntries || [];
    const kept = entries.filter((e) => s(e.voucherNo) !== voucherNo);
    if (kept.length === entries.length) continue;
    group.forEach((t) => { t.paymentEntries = kept; });
    const summary = invoiceSummary(group);
    const status = summary.outstanding <= 0.005 ? 'Payment Received' : 'Payment Pending';
    group.forEach((t) => { t.paymentStatus = status; writeTask(t.row, t); });
  }
}
// Computes how a voucher amount is allocated: against the selected invoice first, then the
// party's other outstanding invoices (oldest first), with any remainder becoming advance credit.
// Shared by create and edit so both follow identical allocation rules.
function computeVoucherAllocation(tasks, party, amount, adjustmentType, requestedInvoiceNo) {
  let invoiceNo = ''; const invoiceAllocations = []; let advanceAmount = 0;
  if (adjustmentType === 'invoice') {
    invoiceNo = requestedInvoiceNo;
    if (!invoiceNo) throw new Error('Select an invoice to adjust against.');
    const primaryGroup = tasks.filter((task) => task.invoiceNo === invoiceNo);
    if (!primaryGroup.length || primaryGroup[0].clientName !== party) throw new Error('Invoice does not belong to the selected party.');
    let remaining = amount;
    const primaryOutstanding = invoiceSummary(primaryGroup).outstanding;
    const primaryApplied = Math.min(remaining, primaryOutstanding);
    if (primaryApplied > 0.005) invoiceAllocations.push({ invoiceNo, amount: primaryApplied });
    remaining -= primaryApplied;
    if (remaining > 0.005) {
      const others = invoiceGroupsOf(tasks)
        .filter((g) => g.clientName === party && g.invoiceNo !== invoiceNo && g.summary.outstanding > 0.005)
        .sort((a, b) => (a.invoiceDate || '').localeCompare(b.invoiceDate || ''));
      for (const g of others) {
        if (remaining <= 0.005) break;
        const applied = Math.min(remaining, g.summary.outstanding);
        invoiceAllocations.push({ invoiceNo: g.invoiceNo, amount: applied });
        remaining -= applied;
      }
    }
    advanceAmount = remaining > 0.005 ? Number(remaining.toFixed(2)) : 0;
  } else {
    advanceAmount = amount;
  }
  return { invoiceNo, invoiceAllocations, advanceAmount };
}
// Applies computed allocations to their invoice groups via the existing payment mechanism.
function applyVoucherAllocations(tasks, invoiceAllocations, voucherNo, date) {
  for (const alloc of invoiceAllocations) {
    const group = tasks.filter((task) => task.invoiceNo === alloc.invoiceNo);
    const summary = invoiceSummary(group);
    const entry = { date, amountReceived: alloc.amount, discountGiven: 0, voucherNo };
    const outstandingAfter = summary.outstanding - alloc.amount;
    const paymentStatus = Math.abs(outstandingAfter) < 0.01 || outstandingAfter < 0 ? 'Payment Received' : 'Payment Pending';
    group.forEach((task) => { task.paymentEntries = [...(group[0].paymentEntries || []), entry]; task.paymentStatus = paymentStatus; writeTask(task.row, task); });
  }
}
app.delete('/vouchers/:voucherNo', async (req, res) => {
  try {
    const voucherNo = decodeURIComponent(req.params.voucherNo);
    const { wb, tasks } = await loadTasks();
    reverseVoucherPayments(tasks, voucherNo);
    const vsheet = wb.getWorksheet('Vouchers'); if (vsheet) setupVoucherSheet(vsheet);
    let target = null;
    if (vsheet) vsheet.eachRow((row, i) => { if (i > 1 && s(row.getCell(1).value) === voucherNo) target = i; });
    if (!target) return res.status(404).json({ error: 'Voucher not found.' });
    vsheet.spliceRows(target, 1);
    await writeWorkbookSafe(wb); res.json({ success: true });
  } catch (error) { res.status(500).json({ error: normalizeWorkbookError(error).message }); }
});
app.put('/vouchers/:voucherNo', async (req, res) => {
  try {
    const voucherNo = decodeURIComponent(req.params.voucherNo);
    const party = s(req.body.party).trim();
    const amount = n(req.body.amount);
    const mode = s(req.body.mode);
    const adjustmentType = s(req.body.adjustmentType);
    const reference = s(req.body.reference).trim();
    const date = normalizeDate(req.body.date) || normalizeDate(new Date());
    if (!party) return res.status(400).json({ error: 'Party is required.' });
    if (!(amount > 0)) return res.status(400).json({ error: 'Amount must be greater than zero.' });
    if (!['Cash', 'Bank'].includes(mode)) return res.status(400).json({ error: 'Payment mode must be Cash or Bank.' });
    if (!['invoice', 'advance'].includes(adjustmentType)) return res.status(400).json({ error: 'Invalid bill adjustment type.' });

    const { wb, tasks } = await loadTasks();
    const voucherSheet = wb.getWorksheet('Vouchers'); setupVoucherSheet(voucherSheet);
    let targetRow = null;
    voucherSheet.eachRow((row, i) => { if (i > 1 && s(row.getCell(1).value) === voucherNo) targetRow = row; });
    if (!targetRow) return res.status(404).json({ error: 'Voucher not found.' });

    // Reverse this voucher's existing effect before recomputing against the edited values —
    // equivalent to delete-then-recreate, but keeps the same voucher number and row.
    reverseVoucherPayments(tasks, voucherNo);
    let allocation;
    try { allocation = computeVoucherAllocation(tasks, party, amount, adjustmentType, s(req.body.invoiceNo).trim()); }
    catch (err) { return res.status(400).json({ error: err.message }); }
    const { invoiceNo, invoiceAllocations, advanceAmount } = allocation;

    targetRow.getCell(2).value = date;
    targetRow.getCell(3).value = party;
    targetRow.getCell(4).value = amount;
    targetRow.getCell(5).value = mode;
    targetRow.getCell(6).value = reference;
    targetRow.getCell(7).value = adjustmentType === 'invoice' ? 'Invoice' : 'Advance';
    targetRow.getCell(8).value = invoiceNo;
    targetRow.getCell(10).value = advanceAmount;

    applyVoucherAllocations(tasks, invoiceAllocations, voucherNo, date);
    await wb.xlsx.writeFile(dbPathFor(activeCompanyId));
    res.json({ success: true, voucherNo, invoiceAllocations, advanceAmount });
  } catch (error) { res.status(400).json({ error: normalizeWorkbookError(error).message }); }
});
app.get('/tasks', async (req, res) => {
  try { const { tasks } = await loadTasks(); res.json(tasks.map((task) => ({ ...task, row: undefined })).sort((a, b) => b.date.localeCompare(a.date))); } catch (error) { res.status(500).json({ error: error.message }); }
});
app.delete('/tasks/:taskId', async (req, res) => {
  try {
    const { wb, sheet, tasks } = await loadTasks();
    const task = tasks.find((t) => t.id === req.params.taskId);
    if (!task) return res.status(404).json({ error: 'Task not found.' });
    // If this is the only task on its invoice, remove the generated PDF too.
    if (task.invoiceNo && task.invoiceFile && tasks.filter((t) => t.invoiceNo === task.invoiceNo).length === 1) {
      const pdf = path.join(invoiceRootFor(activeCompanyId), task.invoiceMonth || '', task.invoiceFile);
      try { if (fs.existsSync(pdf)) fs.unlinkSync(pdf); } catch { /* non-fatal */ }
    }
    sheet.spliceRows(task.row.number, 1);
    await writeWorkbookSafe(wb); res.json({ success: true });
  } catch (error) { res.status(500).json({ error: normalizeWorkbookError(error).message }); }
});
app.post('/tasks', async (req, res) => {
  try {
    const task = buildTask(req.body); if (!task.clientName || !task.items.length) return res.status(400).json({ error: 'Client name and line items are required.' });
    const { wb, sheet } = await loadTasks(); const row = sheet.addRow({});
    writeTask(row, { ...task, status: 'Invoice Pending', paymentStatus: 'Payment Pending', invoiceNo: '', invoiceDate: '', invoiceFile: '', invoiceMonth: '', invoiceGroupId: task.id, paymentEntries: [] });
    await wb.xlsx.writeFile(dbPathFor(activeCompanyId)); res.json({ success: true, taskId: task.id });
  } catch (error) { res.status(500).json({ error: error.message }); }
});
app.put('/tasks/:taskId', async (req, res) => {
  try {
    const { wb, tasks } = await loadTasks();
    const existing = tasks.find((task) => task.id === req.params.taskId);
    if (!existing) return res.status(404).json({ error: 'Task not found.' });
    if (existing.status === 'Invoice Cancelled') return res.status(400).json({ error: 'This invoice has been cancelled and cannot be edited.' });
    const updated = buildTask(req.body, existing);
    Object.assign(existing, updated);
    writeTask(existing.row, existing);
    if (existing.invoiceNo) {
      const group = tasks.filter((task) => task.invoiceNo === existing.invoiceNo);
      const invoiceDate = latestDate(group);
      const rendered = await renderInvoice(group, existing.invoiceNo, invoiceDate, existing.paymentStatus, existing.paymentDisplay || null);
      group.forEach((task) => { task.invoiceDate = invoiceDate; task.invoiceMonth = rendered.month; task.invoiceFile = rendered.filename; task.status = 'Invoice Generated'; writeTask(task.row, task); });
    } else {
      existing.status = 'Invoice Pending'; existing.paymentStatus = 'Payment Pending'; writeTask(existing.row, existing);
    }
    await wb.xlsx.writeFile(dbPathFor(activeCompanyId)); res.json({ success: true });
  } catch (error) { res.status(500).json({ error: error.message }); }
});
app.post('/tasks/:taskId/cancel-invoice', async (req, res) => {
  try {
    const { wb, tasks } = await loadTasks();
    const task = tasks.find((t) => t.id === req.params.taskId);
    if (!task) return res.status(404).json({ error: 'Task not found.' });
    if (!task.invoiceNo || task.status !== 'Invoice Generated') return res.status(400).json({ error: 'Only a generated invoice can be cancelled.' });
    // Cancelling applies to the whole invoice document (every task sharing this invoice number),
    // not just one line item. The invoice number and all its data are kept — only the status changes.
    const group = tasks.filter((t) => t.invoiceNo === task.invoiceNo);
    if (group.some((t) => (t.paymentEntries || []).length > 0)) return res.status(400).json({ error: 'Cannot cancel an invoice with recorded payments. Reverse the payment first.' });
    group.forEach((t) => { t.status = 'Invoice Cancelled'; writeTask(t.row, t); });
    await writeWorkbookSafe(wb); res.json({ success: true });
  } catch (error) { res.status(500).json({ error: normalizeWorkbookError(error).message }); }
});
app.post('/generate-invoice', async (req, res) => {
  try {
    const ids = Array.isArray(req.body.taskIds) ? req.body.taskIds : [];
    if (!ids.length) return res.status(400).json({ error: 'At least one task must be selected.' });
    const { wb, tasks } = await loadTasks();
    const selected = ids.map((id) => tasks.find((task) => task.id === id)).filter(Boolean);
    if (!selected.length) return res.status(404).json({ error: 'Selected tasks were not found.' });
    let group = selected; let invoiceNo = ''; let invoiceDate = latestDate(selected); let groupId = ''; let invoiceFY = '';
    let isRegen = false; let preservedStatus = 'Payment Pending';
    if (selected.length === 1 && selected[0].invoiceNo) {
      if (selected[0].status === 'Invoice Cancelled') throw new Error('This invoice has been cancelled and cannot be regenerated.');
      invoiceNo = selected[0].invoiceNo; group = tasks.filter((task) => task.invoiceNo === invoiceNo); invoiceDate = latestDate(group); groupId = group[0].invoiceGroupId || invoiceNo;
      // Re-generation: keep the existing payment status, payment entries, outstanding balance and
      // financial year intact — only the PDF is re-rendered, the number/FY are never reassigned.
      isRegen = true; preservedStatus = paymentOf(group[0].paymentStatus);
    } else if (selected.length === 1) {
      ({ invoiceNo, fy: invoiceFY } = await nextInvoiceNo(wb, selected[0].gst === '18%', invoiceDate)); groupId = selected[0].id;
    } else {
      if (new Set(selected.map((task) => task.clientName)).size !== 1) throw new Error('Bulk generation works only when all selected tasks belong to the same client.');
      if (new Set(selected.map((task) => task.gst)).size !== 1) throw new Error('Bulk generation works only when all selected tasks share the same GST setting.');
      if (selected.some((task) => task.invoiceNo || task.status !== 'Invoice Pending')) throw new Error('Bulk generation requires all selected tasks to be Invoice Pending with no invoice number.');
      ({ invoiceNo, fy: invoiceFY } = await nextInvoiceNo(wb, selected[0].gst === '18%', invoiceDate)); groupId = `GRP-${Date.now()}`;
    }
    const paymentDisplay = req.body.paymentDisplay || (isRegen ? (group[0].paymentDisplay || null) : null);
    const renderStatus = isRegen ? preservedStatus : 'Payment Pending';
    const rendered = await renderInvoice(group, invoiceNo, invoiceDate, renderStatus, paymentDisplay);
    group.forEach((task) => { task.invoiceNo = invoiceNo; task.status = 'Invoice Generated'; task.paymentStatus = isRegen ? preservedStatus : 'Payment Pending'; task.invoiceDate = invoiceDate; task.invoiceMonth = rendered.month; if (invoiceFY) task.invoiceFY = invoiceFY; task.invoiceFile = rendered.filename; task.invoiceGroupId = groupId || task.invoiceGroupId; task.paymentDisplay = paymentDisplay || ''; writeTask(task.row, task); });
    await wb.xlsx.writeFile(dbPathFor(activeCompanyId)); res.json({ success: true, invoiceNo, invoiceMonth: rendered.month, filename: rendered.filename });
  } catch (error) { res.status(400).json({ error: error.message }); }
});
app.post('/generate-invoice-separate', async (req, res) => {
  try {
    const ids = Array.isArray(req.body.taskIds) ? req.body.taskIds : [];
    if (!ids.length) return res.status(400).json({ error: 'At least one task must be selected.' });
    const paymentDisplay = req.body.paymentDisplay || null;
    const { wb, tasks } = await loadTasks();
    const selected = ids.map((id) => tasks.find((task) => task.id === id)).filter(Boolean);
    const eligible = selected.filter((task) => !task.invoiceNo && task.status === 'Invoice Pending');
    if (!eligible.length) return res.status(400).json({ error: 'No eligible pending tasks to generate. Already-invoiced tasks are skipped.' });
    // One invoice per task, each with its own number in its own GST/Non-GST series.
    for (const task of eligible) {
      const { invoiceNo, fy } = await nextInvoiceNo(wb, task.gst === '18%', task.date);
      const rendered = await renderInvoice([task], invoiceNo, task.date, 'Payment Pending', paymentDisplay);
      task.invoiceNo = invoiceNo; task.status = 'Invoice Generated'; task.paymentStatus = 'Payment Pending';
      task.invoiceDate = task.date; task.invoiceMonth = rendered.month; task.invoiceFile = rendered.filename;
      task.invoiceGroupId = task.id; task.paymentDisplay = paymentDisplay || ''; task.invoiceFY = fy;
      writeTask(task.row, task);
    }
    await wb.xlsx.writeFile(dbPathFor(activeCompanyId));
    res.json({ success: true, generated: eligible.length, skipped: selected.length - eligible.length });
  } catch (error) { res.status(400).json({ error: error.message }); }
});
const BULK_HEADERS = ['Client Name', 'Task Description', 'Amount', 'GST (Yes/No)', 'HSN', 'Service Category', 'Date (YYYY-MM-DD)'];
app.get('/tasks/bulk-template', async (req, res) => {
  try {
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet('Tasks');
    sheet.columns = BULK_HEADERS.map((header) => ({ header, width: Math.max(header.length + 4, 18) }));
    sheet.getRow(1).font = { bold: true };
    sheet.addRow(['Acme Traders', 'GST Return Filing - Q1', 15000, 'Yes', '9982', 'GST Return', '2026-07-01']);
    sheet.addRow(['Rahul Sharma', 'ITR Filing AY 2026-27', 3000, 'No', '', 'ITR Return', '2026-07-02']);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="Bulk Task Upload Template.xlsx"');
    await wb.xlsx.write(res); res.end();
  } catch (error) { res.status(500).json({ error: error.message }); }
});
const parseGstFlag = (v) => { const t = s(v).trim().toLowerCase(); return ['yes', 'y', 'gst', 'true', '1', '18%', '18'].includes(t); };
app.post('/tasks/bulk', async (req, res) => {
  try {
    const fileBase64 = s(req.body.fileBase64);
    if (!fileBase64) return res.status(400).json({ error: 'No file provided.' });
    const upload = new ExcelJS.Workbook();
    await upload.xlsx.load(Buffer.from(fileBase64, 'base64'));
    const sheet = upload.worksheets[0];
    if (!sheet) return res.status(400).json({ error: 'The uploaded file has no sheets.' });
    const h = headers(sheet);
    const col = (row, name, fallback) => { const idx = h[name] || fallback; return idx ? row.getCell(idx).value : ''; };
    const { wb, sheet: invoiceSheet } = await loadTasks();
    const clientsSheet = wb.getWorksheet('Clients'); setupClientSheet(clientsSheet);
    const knownClients = new Set(); clientsSheet.eachRow((row, i) => { if (i > 1) knownClients.add(s(row.getCell(1).value).toLowerCase()); });
    let created = 0; const errors = [];
    sheet.eachRow((row, i) => {
      if (i === 1) return;
      const clientName = s(col(row, 'Client Name', 1)).trim();
      const desc = s(col(row, 'Task Description', 2)).trim();
      const amountRaw = col(row, 'Amount', 3);
      if (!clientName && !desc && !s(amountRaw)) return; // blank row
      const amount = n(amountRaw);
      if (!clientName || !desc || !amount) { errors.push(`Row ${i}: missing Client Name, Task Description or a valid Amount.`); return; }
      const chargeGst = parseGstFlag(col(row, 'GST (Yes/No)', 4));
      const hsn = s(col(row, 'HSN', 5)).trim();
      const category = s(col(row, 'Service Category', 6)).trim();
      const date = normalizeDate(col(row, 'Date (YYYY-MM-DD)', 7)) || normalizeDate(new Date());
      if (!knownClients.has(clientName.toLowerCase())) { clientsSheet.addRow({ name: clientName, createdAt: normalizeDate(new Date()), status: 'Active' }); knownClients.add(clientName.toLowerCase()); }
      const task = buildTask({ clientName, date, chargeGst, category, items: [{ desc, hsn, amt: amount }] });
      writeTask(invoiceSheet.addRow({}), { ...task, status: 'Invoice Pending', paymentStatus: 'Payment Pending', invoiceNo: '', invoiceDate: '', invoiceFile: '', invoiceMonth: '', invoiceGroupId: task.id, paymentEntries: [] });
      created += 1;
    });
    await wb.xlsx.writeFile(dbPathFor(activeCompanyId));
    res.json({ success: true, created, errors });
  } catch (error) { res.status(400).json({ error: error.message }); }
});
app.post('/record-payment', async (req, res) => {
  try {
    const { wb, tasks } = await loadTasks();
    const source = tasks.find((task) => task.id === req.body.taskId);
    if (!source || !source.invoiceNo) return res.status(400).json({ error: 'Payments can only be recorded for generated invoices.' });
    const group = tasks.filter((task) => task.invoiceNo === source.invoiceNo);
    const summary = invoiceSummary(group);
    const entry = { date: normalizeDate(new Date()), amountReceived: n(req.body.amountReceived), discountGiven: n(req.body.discountGiven) };
    const totalApplied = entry.amountReceived + entry.discountGiven;
    const outstandingAfter = summary.outstanding - totalApplied;
    const paymentStatus = Math.abs(outstandingAfter) < 0.01 || outstandingAfter < 0 ? 'Payment Received' : 'Payment Pending';
    // Payments are tracked in-app only — the generated invoice PDF is never re-rendered or
    // touched by payment/voucher activity (see renderInvoice's comment).
    group.forEach((task) => { task.paymentEntries = [...(group[0].paymentEntries || []), entry]; task.paymentStatus = paymentStatus; writeTask(task.row, task); });
    await wb.xlsx.writeFile(dbPathFor(activeCompanyId)); res.json({ success: true, paymentStatus });
  } catch (error) { res.status(500).json({ error: error.message }); }
});
app.post('/cancel-payment', async (req, res) => {
  try {
    const { wb, tasks } = await loadTasks();
    const source = tasks.find((task) => task.id === req.body.taskId);
    if (!source || !source.invoiceNo) return res.status(400).json({ error: 'No payment to cancel for this task.' });
    const group = tasks.filter((task) => task.invoiceNo === source.invoiceNo);
    group.forEach((task) => { task.paymentEntries = []; task.paymentStatus = 'Payment Pending'; writeTask(task.row, task); });
    await wb.xlsx.writeFile(dbPathFor(activeCompanyId)); res.json({ success: true });
  } catch (error) { res.status(500).json({ error: error.message }); }
});
app.get('/vouchers', async (req, res) => {
  try {
    const { vouchers } = await loadVouchers();
    vouchers.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || '').localeCompare(a.createdAt || ''));
    res.json({ vouchers, advances: partyAdvances(vouchers) });
  } catch (error) { res.status(500).json({ error: error.message }); }
});
app.get('/vouchers/open-invoices', async (req, res) => {
  try {
    const party = s(req.query.party).trim();
    if (!party) return res.json([]);
    const { tasks } = await loadTasks();
    const groups = invoiceGroupsOf(tasks).filter((g) => g.clientName === party && g.summary.outstanding > 0.005);
    res.json(groups.map((g) => ({ invoiceNo: g.invoiceNo, invoiceDate: g.invoiceDate, grossTotal: g.summary.grossTotal, outstanding: g.summary.outstanding })));
  } catch (error) { res.status(500).json({ error: error.message }); }
});
app.post('/vouchers', async (req, res) => {
  try {
    const party = s(req.body.party).trim();
    const amount = n(req.body.amount);
    const mode = s(req.body.mode);
    const adjustmentType = s(req.body.adjustmentType);
    const reference = s(req.body.reference).trim();
    const date = normalizeDate(req.body.date) || normalizeDate(new Date());
    if (!party) return res.status(400).json({ error: 'Party is required.' });
    if (!(amount > 0)) return res.status(400).json({ error: 'Amount must be greater than zero.' });
    if (!['Cash', 'Bank'].includes(mode)) return res.status(400).json({ error: 'Payment mode must be Cash or Bank.' });
    if (!['invoice', 'advance'].includes(adjustmentType)) return res.status(400).json({ error: 'Invalid bill adjustment type.' });

    const { wb, tasks } = await loadTasks();
    const voucherSheet = wb.getWorksheet('Vouchers') || wb.addWorksheet('Vouchers');
    setupVoucherSheet(voucherSheet);
    let allocation;
    try { allocation = computeVoucherAllocation(tasks, party, amount, adjustmentType, s(req.body.invoiceNo).trim()); }
    catch (err) { return res.status(400).json({ error: err.message }); }
    const { invoiceNo, invoiceAllocations, advanceAmount } = allocation;
    const voucherNo = await nextVoucherNo(wb, date);
    voucherSheet.addRow({ voucherNo, date, party, amount, mode, reference, adjustmentType: adjustmentType === 'invoice' ? 'Invoice' : 'Advance', invoiceNo, createdAt: normalizeDate(new Date()), advanceAmount });
    applyVoucherAllocations(tasks, invoiceAllocations, voucherNo, date);
    await wb.xlsx.writeFile(dbPathFor(activeCompanyId));
    res.json({ success: true, voucherNo, invoiceAllocations, advanceAmount });
  } catch (error) { res.status(400).json({ error: error.message }); }
});
app.get('/view-invoice', (req, res) => {
  const filePath = path.join(invoiceRootFor(activeCompanyId), req.query.monthYear, req.query.filename);
  if (!fs.existsSync(filePath)) return res.status(404).send('Invoice file not found.');
  res.setHeader('Content-Type', 'application/pdf'); res.sendFile(filePath);
});
app.get('/open-folder', (req, res) => { ensureDir(companyDir(activeCompanyId)); const start = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open'; exec(`${start} "" "${companyDir(activeCompanyId)}"`); res.json({ success: true }); });
const escapeXml = (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const tallyDate = (d) => { const n = normalizeDate(d); return n ? n.replace(/-/g, '') : ''; };
async function sendTallyXml(req, res, type) {
  // Tally native XML (Import Data -> Vouchers). Sales/GST/Non-GST only — these map to Sales vouchers.
  if (!['sales', 'gst', 'nongst'].includes(type)) return res.status(400).json({ error: 'Tally export is available for Sales, GST and Non-GST reports.' });
  const from = normalizeDate(req.query.from || '') || '';
  const to = normalizeDate(req.query.to || '') || '';
  const { wb, tasks } = await loadTasks();
  const profile = await readProfile();
  const gstnByClient = new Map();
  const clientsSheet = wb.getWorksheet('Clients');
  if (clientsSheet) { const h = headers(clientsSheet); clientsSheet.eachRow((row, i) => { if (i > 1) gstnByClient.set(s(row.getCell(h['Client Name'] || 1).value), s(row.getCell(h['GSTN'] || 4).value)); }); }
  const groups = invoiceGroupsOf(tasks)
    .filter((g) => inRange(g.invoiceDate, from, to) && (type === 'sales' || (type === 'gst' ? g.gst === true : g.gst === false)))
    .sort((a, b) => a.invoiceDate.localeCompare(b.invoiceDate) || a.invoiceNo.localeCompare(b.invoiceNo));
  const vouchers = groups.map((g) => {
    const subtotal = money(g.summary.subtotal);
    const gstAmount = money(g.summary.gstAmount);
    const grossTotal = money(g.summary.grossTotal);
    const gstn = gstnByClient.get(g.clientName) || '';
    const ledgers = [
      `<ALLLEDGERENTRIES.LIST><LEDGERNAME>${escapeXml(g.clientName)}</LEDGERNAME><ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE><AMOUNT>-${grossTotal.toFixed(2)}</AMOUNT></ALLLEDGERENTRIES.LIST>`,
      `<ALLLEDGERENTRIES.LIST><LEDGERNAME>Sales</LEDGERNAME><ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE><AMOUNT>${subtotal.toFixed(2)}</AMOUNT></ALLLEDGERENTRIES.LIST>`,
      gstAmount > 0 ? `<ALLLEDGERENTRIES.LIST><LEDGERNAME>Output GST</LEDGERNAME><ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE><AMOUNT>${gstAmount.toFixed(2)}</AMOUNT></ALLLEDGERENTRIES.LIST>` : ''
    ].join('');
    return `<TALLYMESSAGE xmlns:UDF="TallyUDF"><VOUCHER VCHTYPE="Sales" ACTION="Create" OBJVIEW="Invoice Voucher View"><DATE>${tallyDate(g.invoiceDate)}</DATE><VOUCHERTYPENAME>Sales</VOUCHERTYPENAME><VOUCHERNUMBER>${escapeXml(g.invoiceNo)}</VOUCHERNUMBER><PARTYLEDGERNAME>${escapeXml(g.clientName)}</PARTYLEDGERNAME><PARTYNAME>${escapeXml(g.clientName)}</PARTYNAME>${gstn ? `<PARTYGSTIN>${escapeXml(gstn)}</PARTYGSTIN>` : ''}<PERSISTEDVIEW>Invoice Voucher View</PERSISTEDVIEW>${ledgers}</VOUCHER></TALLYMESSAGE>`;
  }).join('');
  const xml = `<?xml version="1.0" encoding="UTF-8"?><ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER><BODY><IMPORTDATA><REQUESTDESC><REPORTNAME>Vouchers</REPORTNAME><STATICVARIABLES><SVCURRENTCOMPANY>${escapeXml(profile.firm_name || activeCompanyId)}</SVCURRENTCOMPANY></STATICVARIABLES></REQUESTDESC><REQUESTDATA>${vouchers}</REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>`;
  const range = `${from || 'start'} to ${to || 'today'}`;
  const filename = safeName(`Tally ${type} ${range} - ${profile.firm_name || activeCompanyId}`) + '.xml';
  res.setHeader('Content-Type', 'application/xml');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(xml);
}
app.get('/reports/:type', async (req, res) => {
  try {
    if (!REPORT_TYPES.includes(req.params.type)) return res.status(404).json({ error: 'Unknown report type.' });
    res.json(await buildReport(req.params.type, req.query));
  } catch (error) { res.status(400).json({ error: error.message }); }
});
app.get('/reports/:type/download', async (req, res) => {
  try {
    if (!REPORT_TYPES.includes(req.params.type)) return res.status(404).json({ error: 'Unknown report type.' });
    const format = req.query.format === 'pdf' ? 'pdf' : req.query.format === 'tally' ? 'tally' : 'xlsx';
    if (format === 'tally') return sendTallyXml(req, res, req.params.type);
    const report = await buildReport(req.params.type, req.query);
    const range = `${normalizeDate(req.query.from || '') || 'start'} to ${normalizeDate(req.query.to || '') || 'today'}`;
    const filename = safeName(`${report.title} ${range} - ${report.firmName || activeCompanyId}`) + `.${format}`;
    if (format === 'xlsx') {
      const wb = new ExcelJS.Workbook();
      const sheet = wb.addWorksheet(report.title.slice(0, 31));
      sheet.columns = report.columns.map((col) => ({ width: Math.max(col.header.length + 4, col.num ? 16 : 22) }));
      const firmRow = sheet.addRow([report.firmName]); firmRow.font = { bold: true, size: 14 };
      sheet.addRow([`${report.title} — ${report.subtitle}`]);
      sheet.addRow([]);
      const headerRow = sheet.addRow(report.columns.map((col) => col.header));
      headerRow.font = { bold: true };
      headerRow.eachCell((cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEDE9FE' } }; cell.border = { bottom: { style: 'thin' } }; });
      report.rows.forEach((row) => { const added = sheet.addRow(row); report.columns.forEach((col, i) => { if (col.num) added.getCell(i + 1).numFmt = '#,##0.00'; }); });
      if (report.totals) {
        const totalRow = sheet.addRow(report.totals);
        totalRow.font = { bold: true };
        totalRow.eachCell((cell) => { cell.border = { top: { style: 'double' } }; });
        report.columns.forEach((col, i) => { if (col.num) totalRow.getCell(i + 1).numFmt = '#,##0.00'; });
      }
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      await wb.xlsx.write(res);
      return res.end();
    }
    const fmt = (v, isNum) => isNum && v !== '' ? Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2 }) : (v ?? '');
    const th = report.columns.map((col) => `<th style="padding:10px;text-align:${col.num ? 'right' : 'left'};">${col.header}</th>`).join('');
    const trs = report.rows.map((row) => `<tr>${row.map((v, i) => `<td style="padding:8px 10px;border:1px solid #cbd5e1;text-align:${report.columns[i].num ? 'right' : 'left'};">${fmt(v, report.columns[i].num)}</td>`).join('')}</tr>`).join('');
    const totalTr = report.totals ? `<tr>${report.totals.map((v, i) => `<td style="padding:10px;border:1px solid #cbd5e1;font-weight:700;border-top:2px solid #5b21b6;text-align:${report.columns[i].num ? 'right' : 'left'};">${fmt(v, report.columns[i].num)}</td>`).join('')}</tr>` : '';
    const html = `<!DOCTYPE html><html><head><style>body{font-family:Arial,sans-serif;color:#1e293b;padding:28px}table{width:100%;border-collapse:collapse;margin-top:18px;font-size:12px}thead tr{background:#1e3a8a;color:#fff}</style></head><body><div style="border-bottom:2px solid #5b21b6;padding-bottom:12px;"><h1 style="margin:0;color:#5b21b6;">${report.firmName}</h1><h2 style="margin:6px 0 0;">${report.title}</h2><div style="color:#64748b;">${report.subtitle}</div></div><table><thead><tr>${th}</tr></thead><tbody>${trs}${totalTr}</tbody></table>${report.rows.length ? '' : '<p style="color:#64748b;">No data for the selected filters.</p>'}</body></html>`;
    const browser = await launchPdfBrowser();
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      const landscape = report.columns.length >= 7;
      const data = await page.pdf({ format: 'A4', landscape, printBackground: true, margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' } });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(Buffer.from(data));
    } finally { await browser.close(); }
  } catch (error) { res.status(400).json({ error: error.message }); }
});
app.post('/generate-whatsapp-excel', async (req, res) => {
  try {
    ensureDir(whatsappRootFor(activeCompanyId));
    const wb = new ExcelJS.Workbook(); const sheet = wb.addWorksheet('Message_Data');
    sheet.columns = [{ header: 'Name', key: 'name', width: 25 }, { header: 'PhoneNumber', key: 'phone', width: 20 }, { header: 'Message', key: 'message', width: 60 }, { header: 'AttachmentPath', key: 'path', width: 80 }];
    const invoiceGroups = {};
    req.body.tasks.forEach((task) => { if (!task.invoiceNo || !task.invoiceFile || !task.invoiceMonth) return; if (!invoiceGroups[task.invoiceNo]) invoiceGroups[task.invoiceNo] = { ...task, combinedTotal: 0 }; invoiceGroups[task.invoiceNo].combinedTotal += n(task.total); });
    Object.values(invoiceGroups).forEach((group) => { sheet.addRow({ name: group.clientName, phone: group.phone || '', message: `Dear ${group.clientName},\n\nYour invoice ${group.invoiceNo} for \u20B9${group.combinedTotal.toLocaleString('en-IN')} is now ready. Please find the PDF attached to this message.\n\nFrom,\n${req.body.firmName}`, path: path.join(invoiceRootFor(activeCompanyId), group.invoiceMonth, group.invoiceFile) }); });
    wb.addWorksheet('Message Logs'); const file = path.join(whatsappRootFor(activeCompanyId), `Invoice_${new Date().toLocaleDateString('en-IN').replace(/\//g, '-')}_${new Date().toLocaleTimeString('en-IN').replace(/:/g, '-').replace(/ /g, '_')}.xlsx`); await wb.xlsx.writeFile(file); res.json({ success: true, path: file });
  } catch (error) { res.status(500).json({ error: error.message }); }
});
app.post('/generate-reminder-excel', async (req, res) => {
  try {
    ensureDir(whatsappRootFor(activeCompanyId));
    const wb = new ExcelJS.Workbook(); const sheet = wb.addWorksheet('Message_Data');
    sheet.columns = [{ header: 'Name', key: 'name', width: 25 }, { header: 'PhoneNumber', key: 'phone', width: 20 }, { header: 'Message', key: 'message', width: 60 }, { header: 'AttachmentPath', key: 'path', width: 80 }];
    const reminderGroups = {};
    req.body.tasks.forEach((task) => { if (!task.invoiceNo || !task.invoiceFile || !task.invoiceMonth) return; if (!reminderGroups[task.invoiceNo]) reminderGroups[task.invoiceNo] = { ...task, combinedTotal: 0 }; reminderGroups[task.invoiceNo].combinedTotal += n(task.total); });
    Object.values(reminderGroups).forEach((group) => { sheet.addRow({ name: group.clientName, phone: group.phone || '', message: `Dear ${group.clientName},\n\nThis is a friendly reminder regarding the payment for invoice ${group.invoiceNo} (Total: \u20B9${group.combinedTotal.toLocaleString('en-IN')}). If you have already processed the payment, please ignore this message.\n\nRegards,\n${req.body.firmName}`, path: path.join(invoiceRootFor(activeCompanyId), group.invoiceMonth, group.invoiceFile) }); });
    wb.addWorksheet('Message Logs'); const file = path.join(whatsappRootFor(activeCompanyId), `Reminders_${new Date().toLocaleDateString('en-IN').replace(/\//g, '-')}_${new Date().toLocaleTimeString('en-IN').replace(/:/g, '-').replace(/ /g, '_')}.xlsx`); await wb.xlsx.writeFile(file); res.json({ success: true, path: file });
  } catch (error) { res.status(500).json({ error: error.message }); }
});
app.post('/run-whatsapp-automation', async (req, res) => {
  try {
    const excelPath = s(req.body.path);
    if (!excelPath) return res.status(400).json({ error: 'Excel path is required.' });
    if (!withinRoot(excelPath, whatsappRootFor(activeCompanyId))) return res.status(400).json({ error: 'Only files from the Whatsapp integration folder can be used.' });
    const message = await runWhatsappAutomation(excelPath);
    res.json({ success: true, message });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
function readRegistry() {
  if (!fs.existsSync(REGISTRY_PATH)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
    if (parsed && Array.isArray(parsed.companies)) return parsed;
  } catch (e) { console.error('companies.json unreadable:', e); }
  return null;
}
function writeRegistry(registry) {
  ensureDir(DESKTOP_PATH);
  // Write via temp file + rename so a crash mid-write can't corrupt a valid registry.
  const tmpPath = `${REGISTRY_PATH}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(registry, null, 2));
  fs.renameSync(tmpPath, REGISTRY_PATH);
}
const slugify = (name) => String(name || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'company';
function uniqueCompanyId(name, existingIds) {
  const base = slugify(name);
  if (!existingIds.has(base)) return base;
  let i = 2;
  while (existingIds.has(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}
async function migrateToCompanies() {
  ensureDir(DESKTOP_PATH);
  ensureDir(COMPANIES_ROOT);
  // Case A: valid registry — idempotent fast path taken on every normal run.
  const registry = readRegistry();
  if (registry && registry.companies.length) {
    const activeExists = registry.companies.some((c) => c.id === registry.activeCompanyId);
    activeCompanyId = activeExists ? registry.activeCompanyId : registry.companies[0].id;
    if (!activeExists) { registry.activeCompanyId = activeCompanyId; writeRegistry(registry); }
    return;
  }
  // Registry missing/corrupt but company folders exist: rebuild the registry from disk.
  // Must run before the legacy move below — covers a crash between "files moved" and
  // "registry written", where the legacy DB no longer exists at its old path.
  const existingCompanyDirs = fs.readdirSync(COMPANIES_ROOT, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  if (existingCompanyDirs.length) {
    const rebuilt = { companies: existingCompanyDirs.map((id) => ({ id, name: id, createdAt: normalizeDate(new Date()) })), activeCompanyId: existingCompanyDirs[0] };
    writeRegistry(rebuilt);
    activeCompanyId = rebuilt.activeCompanyId;
    return;
  }
  // Case B: legacy single-company layout — move it into a company folder once.
  const legacyDbPath = path.join(DESKTOP_PATH, 'Invoice_Database.xlsx');
  if (fs.existsSync(legacyDbPath)) {
    let firmName = 'Default Company';
    try {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.readFile(legacyDbPath);
      const profileSheet = wb.getWorksheet('Profile');
      if (profileSheet) profileSheet.eachRow((row, i) => { if (i > 1 && row.getCell(1).value === 'firm_name' && row.getCell(2).value) firmName = String(row.getCell(2).value); });
    } catch (e) { console.error('Could not read legacy firm_name during migration, using default:', e); }
    const companyId = uniqueCompanyId(firmName, new Set());
    const dir = companyDir(companyId);
    ensureDir(dir);
    try {
      fs.renameSync(legacyDbPath, path.join(dir, 'Invoice_Database.xlsx'));
    } catch (moveError) {
      // The database is the one file we must not leave half-migrated — abort startup.
      throw new Error(`Company data migration failed while moving the database: ${moveError.message}. Restart the app to retry.`);
    }
    // PDFs and WhatsApp exports are regenerable — a locked folder must not block startup.
    const legacyInvoiceRoot = path.join(DESKTOP_PATH, 'Invoices raised');
    const legacyWhatsappRoot = path.join(DESKTOP_PATH, 'Whatsapp integration');
    try { if (fs.existsSync(legacyInvoiceRoot)) fs.renameSync(legacyInvoiceRoot, path.join(dir, 'Invoices raised')); }
    catch (e) { console.warn('Could not move legacy "Invoices raised" folder, leaving it in place:', e); }
    try { if (fs.existsSync(legacyWhatsappRoot)) fs.renameSync(legacyWhatsappRoot, path.join(dir, 'Whatsapp integration')); }
    catch (e) { console.warn('Could not move legacy "Whatsapp integration" folder, leaving it in place:', e); }
    writeRegistry({ companies: [{ id: companyId, name: firmName, createdAt: normalizeDate(new Date()) }], activeCompanyId: companyId });
    activeCompanyId = companyId;
    return;
  }
  // Case C: fresh install — same zero-config first run as before, one level deeper.
  const companyId = 'default-company';
  ensureDir(companyDir(companyId));
  writeRegistry({ companies: [{ id: companyId, name: 'Default Company', createdAt: normalizeDate(new Date()) }], activeCompanyId: companyId });
  activeCompanyId = companyId;
}
// ---- Auto Reminders ----------------------------------------------------------
// Fully automatic, toggle-driven reminders: the first reminder fires 3 days after an
// invoice's due date (= invoice date; this app has no separate payment-terms field),
// then repeats every 3 days until the invoice is paid or any applicable toggle (global,
// client, or invoice) is switched off. A backend sweep (see below) does the sending, so
// this works whether or not the Auto Reminders page is open.
const REMINDER_INTERVAL_DAYS = 3;
const addDays = (dateStr, days) => { const d = new Date(`${dateStr}T00:00:00`); d.setDate(d.getDate() + days); return normalizeDate(d); };
function computeReminderCandidates(wb, companyId, companyName) {
  const profile = profileFromWorkbook(wb);
  const globalEnabled = s(profile.auto_reminders_enabled) !== '0';
  const { tasks } = tasksFromWorkbook(wb);
  const clients = clientsFromWorkbook(wb);
  const clientMap = {}; clients.forEach((c) => { clientMap[c.name] = c; });
  const repByInvoice = {};
  tasks.forEach((t) => { if (t.invoiceNo && !repByInvoice[t.invoiceNo]) repByInvoice[t.invoiceNo] = t; });
  const today = normalizeDate(new Date());
  return invoiceGroupsOf(tasks).filter((g) => g.summary.outstanding > 0.005).map((g) => {
    const rep = repByInvoice[g.invoiceNo] || {};
    const client = clientMap[g.clientName] || {};
    const dueDate = g.invoiceDate;
    const lastReminderAt = rep.lastReminderAt || '';
    const nextReminderAt = lastReminderAt ? addDays(normalizeDate(lastReminderAt), REMINDER_INTERVAL_DAYS) : addDays(dueDate, REMINDER_INTERVAL_DAYS);
    const invoiceEnabled = rep.reminderEnabled !== false;
    const clientEnabled = client.remindersEnabled !== false;
    const active = globalEnabled && clientEnabled && invoiceEnabled;
    return {
      companyId, company: companyName, invoiceNo: g.invoiceNo, party: g.clientName, phone: client.phone || '',
      amountDue: money(g.summary.outstanding), gst: g.gst, dueDate, lastReminderAt, nextReminderAt,
      invoiceFile: rep.invoiceFile || '', invoiceMonth: rep.invoiceMonth || '',
      globalEnabled, clientEnabled, invoiceEnabled, active, due: active && today >= nextReminderAt
    };
  });
}
function registryCompanies() {
  const registry = readRegistry();
  return registry ? registry.companies : [];
}
async function workbookForCompany(companyId) {
  return companyId === activeCompanyId ? loadWorkbook() : readWorkbookFor(companyId);
}
app.get('/reminders', async (req, res) => {
  try {
    const companyFilter = s(req.query.company || 'all');
    const billType = s(req.query.billType || 'all');
    const companies = registryCompanies();
    const targets = companyFilter === 'all' ? companies : companies.filter((c) => c.id === companyFilter);
    let rows = [];
    for (const company of targets) {
      try { rows = rows.concat(computeReminderCandidates(await workbookForCompany(company.id), company.id, company.name)); }
      catch { /* skip a company whose workbook can't be read right now */ }
    }
    if (billType === 'gst') rows = rows.filter((r) => r.gst);
    else if (billType === 'nongst') rows = rows.filter((r) => !r.gst);
    rows.sort((a, b) => (a.nextReminderAt || '').localeCompare(b.nextReminderAt || '') || a.invoiceNo.localeCompare(b.invoiceNo));
    const profile = await readProfile();
    res.json({ reminders: rows, companies: companies.map((c) => ({ id: c.id, name: c.name })), globalEnabled: s(profile.auto_reminders_enabled) !== '0' });
  } catch (error) { res.status(500).json({ error: error.message }); }
});
app.get('/reminders/global', async (req, res) => {
  try { const profile = await readProfile(); res.json({ enabled: s(profile.auto_reminders_enabled) !== '0' }); }
  catch (error) { res.status(500).json({ error: error.message }); }
});
app.post('/reminders/global', async (req, res) => {
  try {
    const wb = await loadWorkbook();
    const sheet = wb.getWorksheet('Profile');
    sheet.eachRow((row, i) => { if (i > 1 && row.getCell(1).value === 'auto_reminders_enabled') row.getCell(2).value = req.body.enabled ? '1' : '0'; });
    await wb.xlsx.writeFile(dbPathFor(activeCompanyId));
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: error.message }); }
});
app.post('/clients/:name/reminders', async (req, res) => {
  try {
    const name = decodeURIComponent(req.params.name);
    const wb = await loadWorkbook();
    const clients = clientsFromWorkbook(wb);
    const client = clients.find((c) => c.name === name);
    if (!client) return res.status(404).json({ error: 'Client not found.' });
    const sheet = wb.getWorksheet('Clients');
    const h = headers(sheet);
    if (!h['Reminders Enabled']) return res.status(500).json({ error: 'Reminders Enabled column missing.' });
    client.row.getCell(h['Reminders Enabled']).value = req.body.enabled ? '1' : '0';
    await wb.xlsx.writeFile(dbPathFor(activeCompanyId));
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: error.message }); }
});
app.post('/reminders/invoice-toggle', async (req, res) => {
  try {
    const invoiceNo = s(req.body.invoiceNo).trim();
    const { wb, tasks } = await loadTasks();
    const group = tasks.filter((t) => t.invoiceNo === invoiceNo);
    if (!group.length) return res.status(404).json({ error: 'Invoice not found.' });
    group.forEach((t) => { t.reminderEnabled = !!req.body.enabled; writeTask(t.row, t); });
    await wb.xlsx.writeFile(dbPathFor(activeCompanyId));
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: error.message }); }
});
app.get('/reminders/history', async (req, res) => {
  try {
    const companyFilter = s(req.query.company || 'all');
    const companies = registryCompanies();
    const targets = companyFilter === 'all' ? companies : companies.filter((c) => c.id === companyFilter);
    let rows = [];
    for (const company of targets) {
      try {
        const wb = await workbookForCompany(company.id);
        const sheet = wb.getWorksheet('ReminderHistory');
        if (!sheet) continue;
        sheet.eachRow((row, i) => {
          if (i === 1) return;
          rows.push({ sentAt: s(row.getCell(1).value), party: s(row.getCell(2).value), company: s(row.getCell(3).value) || company.name, invoiceNo: s(row.getCell(4).value), channel: s(row.getCell(5).value), status: s(row.getCell(6).value), failureReason: s(row.getCell(7).value) });
        });
      } catch { /* skip a company whose workbook can't be read right now */ }
    }
    rows.sort((a, b) => (b.sentAt || '').localeCompare(a.sentAt || ''));
    res.json({ history: rows.slice(0, 500) });
  } catch (error) { res.status(500).json({ error: error.message }); }
});
function appendReminderHistory(wb, entry) {
  let sheet = wb.getWorksheet('ReminderHistory'); if (!sheet) sheet = wb.addWorksheet('ReminderHistory');
  setupReminderHistorySheet(sheet);
  sheet.addRow({ sentAt: entry.sentAt, party: entry.party, company: entry.company, invoiceNo: entry.invoiceNo, channel: entry.channel, status: entry.status, failureReason: entry.failureReason || '' });
}
// Cross-company sweep: fires due reminders via the existing WhatsApp automation pipeline,
// logs every attempt (success or failure) to that company's Reminder History, and stamps
// lastReminderAt so the same invoice can't fire again before its next 3-day slot — this is
// what prevents duplicates, whether the sweep runs every 15 minutes or once via the
// standalone closed-app scheduler script.
let sweepInProgress = false;
async function runReminderSweep() {
  if (sweepInProgress) return;
  sweepInProgress = true;
  try {
    for (const company of registryCompanies()) {
      try {
        const dbPath = dbPathFor(company.id);
        if (!fs.existsSync(dbPath)) continue;
        const wb = await readWorkbookFor(company.id);
        const due = computeReminderCandidates(wb, company.id, company.name).filter((c) => c.due);
        if (!due.length) continue;
        const { tasks } = tasksFromWorkbook(wb);
        let wrote = false;
        for (const candidate of due) {
          const sentAt = new Date().toISOString();
          let status = 'Sent', failureReason = '';
          try {
            if (!candidate.phone) throw new Error('No phone number on file for this client.');
            if (!candidate.invoiceFile || !candidate.invoiceMonth) throw new Error('Invoice PDF not found for this invoice.');
            const attachmentPath = path.join(invoiceRootFor(company.id), candidate.invoiceMonth, candidate.invoiceFile);
            ensureDir(whatsappRootFor(company.id));
            const msgWb = new ExcelJS.Workbook();
            const sheet = msgWb.addWorksheet('Message_Data');
            sheet.columns = [{ header: 'Name', key: 'name', width: 25 }, { header: 'PhoneNumber', key: 'phone', width: 20 }, { header: 'Message', key: 'message', width: 60 }, { header: 'AttachmentPath', key: 'path', width: 80 }];
            sheet.addRow({ name: candidate.party, phone: candidate.phone, message: `Dear ${candidate.party},\n\nThis is a friendly reminder regarding the payment for invoice ${candidate.invoiceNo} (Total: ₹${candidate.amountDue.toLocaleString('en-IN')}). If you have already processed the payment, please ignore this message.\n\nRegards,\n${company.name}`, path: attachmentPath });
            msgWb.addWorksheet('Message Logs');
            const excelFile = path.join(whatsappRootFor(company.id), `AutoReminder_${Date.now()}.xlsx`);
            await msgWb.xlsx.writeFile(excelFile);
            await runWhatsappAutomation(excelFile);
          } catch (err) {
            status = 'Failed'; failureReason = (err && err.message) || 'Unknown error';
          }
          appendReminderHistory(wb, { sentAt, party: candidate.party, company: company.name, invoiceNo: candidate.invoiceNo, channel: 'WhatsApp', status, failureReason });
          // Stamp lastReminderAt even on failure so a broken number/missing PDF retries on
          // the normal 3-day cadence instead of every sweep tick.
          tasks.filter((t) => t.invoiceNo === candidate.invoiceNo).forEach((t) => { t.lastReminderAt = sentAt; writeTask(t.row, t); });
          wrote = true;
        }
        if (wrote) await wb.xlsx.writeFile(dbPath);
      } catch (err) { console.warn(`Reminder sweep failed for company ${company.id}:`, err.message); }
    }
  } finally { sweepInProgress = false; }
}
async function main() {
  adminAuth.ensureAdminFile();
  await migrateToCompanies();
  await initExcelDB();
  runReminderSweep().catch((e) => console.warn('Reminder sweep error:', e.message));
  setInterval(() => { runReminderSweep().catch((e) => console.warn('Reminder sweep error:', e.message)); }, 15 * 60 * 1000).unref();
  await new Promise((resolve, reject) => {
    const server = app.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
      console.log(`Files saved to: ${DESKTOP_PATH}`);
      if (!process.argv.includes('--no-open')) {
        const start = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
        exec(`${start} http://localhost:${PORT}`);
      }
      resolve();
    });
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        // Port already in use — another instance is running. The Electron window will connect to it.
        console.log(`Port ${PORT} already in use — reusing existing server.`);
        resolve();
      } else {
        reject(err);
      }
    });
  });
}
main().catch((err) => { console.error('Startup failed:', err); });
