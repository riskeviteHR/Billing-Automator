// Standalone Auto Reminders sweep — runs independently of the Electron window/Express
// server so reminders still fire when the app is fully closed. Invoked periodically by a
// Windows Scheduled Task (see scripts/register-reminder-task.ps1) via the packaged app's
// own executable running as plain Node (ELECTRON_RUN_AS_NODE=1), so it needs no separate
// Node.js install on the user's machine. Mirrors server.js's reminder logic; kept
// intentionally self-contained so it never has to boot the Express server.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');
const ExcelJS = require('exceljs');

const DESKTOP_PATH = path.join(os.homedir(), 'Desktop', 'Invoices Utility');
const COMPANIES_ROOT = path.join(DESKTOP_PATH, 'Companies');
const REGISTRY_PATH = path.join(DESKTOP_PATH, 'companies.json');
const companyDir = (id) => path.join(COMPANIES_ROOT, id);
const dbPathFor = (id) => path.join(companyDir(id), 'Invoice_Database.xlsx');
const invoiceRootFor = (id) => path.join(companyDir(id), 'Invoices raised');
const whatsappRootFor = (id) => path.join(companyDir(id), 'Whatsapp integration');
const WA_AUTOMATION_DIR = path.join(__dirname, 'WA Automation');
const WA_AUTOMATION_EXE = path.join(WA_AUTOMATION_DIR, 'WhatsAppAutomationPro.exe');
const WA_AUTOMATION_EXE_PATCHED = path.join(WA_AUTOMATION_DIR, 'WhatsAppAutomationPro Patched.exe');
const WA_AUTOMATION_LAUNCHER = path.join(__dirname, 'wa_automation_launcher2.ps1');
const REMINDER_INTERVAL_DAYS = 3;

const s = (v) => (v === null || v === undefined ? '' : String(v));
const n = (v) => { const num = Number(v); return Number.isFinite(num) ? num : 0; };
const money = (v) => Number(n(v).toFixed(2));
const json = (v, fallback) => { try { return v ? JSON.parse(v) : fallback; } catch { return fallback; } };
function normalizeDate(v) {
  if (!v) return '';
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const addDays = (dateStr, days) => { const d = new Date(`${dateStr}T00:00:00`); d.setDate(d.getDate() + days); return normalizeDate(d); };

function readRegistry() {
  if (!fs.existsSync(REGISTRY_PATH)) return null;
  try { const parsed = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8')); return Array.isArray(parsed.companies) ? parsed : null; } catch { return null; }
}
function runWhatsappAutomation(excelPath) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(excelPath)) return reject(new Error('Selected Excel file was not found.'));
    if (!fs.existsSync(WA_AUTOMATION_EXE) && !fs.existsSync(WA_AUTOMATION_EXE_PATCHED)) return reject(new Error('WhatsAppAutomationPro.exe was not found.'));
    if (!fs.existsSync(WA_AUTOMATION_LAUNCHER)) return reject(new Error('WhatsApp automation launcher script is missing.'));
    execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', WA_AUTOMATION_LAUNCHER, '-ExcelPath', excelPath], { cwd: __dirname, windowsHide: false, timeout: 120000 }, (error, stdout, stderr) => {
      if (error) return reject(new Error((stderr || stdout || error.message).trim()));
      resolve((stdout || 'WhatsApp automation started.').trim());
    });
  });
}
async function writeWorkbookRetrying(wb, filePath, attempts = 5) {
  for (let i = 0; i < attempts; i++) {
    try { await wb.xlsx.writeFile(filePath); return; }
    catch (err) {
      if ((err.code === 'EBUSY' || err.code === 'EPERM') && i < attempts - 1) { await new Promise((r) => setTimeout(r, 1500)); continue; }
      throw err;
    }
  }
}

async function loadCompanyWorkbook(id) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(dbPathFor(id));
  return wb;
}
function readProfile(wb) {
  const sheet = wb.getWorksheet('Profile');
  const profile = {};
  if (sheet) sheet.eachRow((row, i) => { if (i > 1) profile[row.getCell(1).value] = row.getCell(2).value || ''; });
  return profile;
}
function readClients(wb) {
  const sheet = wb.getWorksheet('Clients');
  const out = [];
  if (!sheet) return out;
  const h = {}; sheet.getRow(1).eachCell((cell, i) => { h[cell.value] = i; });
  sheet.eachRow((row, i) => {
    if (i === 1) return;
    out.push({ name: s(row.getCell(h['Client Name'] || 1).value), phone: s(row.getCell(h['Phone'] || 3).value), remindersEnabled: h['Reminders Enabled'] ? s(row.getCell(h['Reminders Enabled']).value) !== '0' : true });
  });
  return out;
}
function readTasks(wb) {
  const sheet = wb.getWorksheet('Invoices');
  const out = [];
  if (!sheet) return out;
  sheet.eachRow((row, i) => {
    if (i === 1) return;
    out.push({
      row, invoiceNo: s(row.getCell(3).value), clientName: s(row.getCell(4).value), total: n(row.getCell(8).value),
      status: s(row.getCell(9).value), invoiceDate: normalizeDate(row.getCell(12).value) || normalizeDate(row.getCell(2).value),
      invoiceFile: s(row.getCell(13).value), invoiceMonth: s(row.getCell(14).value), paymentEntries: json(row.getCell(16).value, []),
      reminderEnabled: s(row.getCell(20).value) !== '0', lastReminderAt: s(row.getCell(21).value)
    });
  });
  return out;
}
function invoiceGroupsOf(tasks) {
  const map = new Map();
  for (const t of tasks) { if (!t.invoiceNo || t.status !== 'Invoice Generated') continue; if (!map.has(t.invoiceNo)) map.set(t.invoiceNo, []); map.get(t.invoiceNo).push(t); }
  return [...map.values()].map((group) => {
    const grossTotal = group.reduce((sum, t) => sum + n(t.total), 0);
    const paymentEntries = group[0].paymentEntries || [];
    const adjustmentTotal = paymentEntries.reduce((sum, e) => sum - n(e.amountReceived) - n(e.discountGiven), 0);
    return { invoiceNo: group[0].invoiceNo, clientName: group[0].clientName, invoiceDate: group[0].invoiceDate, outstanding: grossTotal + adjustmentTotal, tasksInGroup: group, rep: group[0] };
  });
}
function appendReminderHistory(wb, entry) {
  let sheet = wb.getWorksheet('ReminderHistory');
  if (!sheet) {
    sheet = wb.addWorksheet('ReminderHistory');
    sheet.columns = [{ header: 'Date/Time', key: 'sentAt', width: 20 }, { header: 'Client', key: 'party', width: 28 }, { header: 'Company', key: 'company', width: 24 }, { header: 'Invoice No', key: 'invoiceNo', width: 18 }, { header: 'Channel', key: 'channel', width: 14 }, { header: 'Status', key: 'status', width: 14 }, { header: 'Failure Reason', key: 'failureReason', width: 50 }];
  }
  sheet.addRow({ sentAt: entry.sentAt, party: entry.party, company: entry.company, invoiceNo: entry.invoiceNo, channel: entry.channel, status: entry.status, failureReason: entry.failureReason || '' });
}

async function sweepCompany(company) {
  const dbPath = dbPathFor(company.id);
  if (!fs.existsSync(dbPath)) return;
  const wb = await loadCompanyWorkbook(company.id);
  const profile = readProfile(wb);
  if (s(profile.auto_reminders_enabled) === '0') return; // global toggle off for this company
  const clientMap = {}; readClients(wb).forEach((c) => { clientMap[c.name] = c; });
  const tasks = readTasks(wb);
  const today = normalizeDate(new Date());
  let wrote = false;
  for (const g of invoiceGroupsOf(tasks).filter((g) => g.outstanding > 0.005)) {
    const client = clientMap[g.clientName] || {};
    if (client.remindersEnabled === false || g.rep.reminderEnabled === false) continue;
    const nextReminderAt = g.rep.lastReminderAt
      ? addDays(normalizeDate(g.rep.lastReminderAt), REMINDER_INTERVAL_DAYS)
      : addDays(g.invoiceDate, REMINDER_INTERVAL_DAYS);
    if (today < nextReminderAt) continue;
    const sentAt = new Date().toISOString();
    let status = 'Sent', failureReason = '';
    try {
      if (!client.phone) throw new Error('No phone number on file for this client.');
      if (!g.rep.invoiceFile || !g.rep.invoiceMonth) throw new Error('Invoice PDF not found for this invoice.');
      const attachmentPath = path.join(invoiceRootFor(company.id), g.rep.invoiceMonth, g.rep.invoiceFile);
      if (!fs.existsSync(whatsappRootFor(company.id))) fs.mkdirSync(whatsappRootFor(company.id), { recursive: true });
      const msgWb = new ExcelJS.Workbook();
      const sheet = msgWb.addWorksheet('Message_Data');
      sheet.columns = [{ header: 'Name', key: 'name', width: 25 }, { header: 'PhoneNumber', key: 'phone', width: 20 }, { header: 'Message', key: 'message', width: 60 }, { header: 'AttachmentPath', key: 'path', width: 80 }];
      sheet.addRow({ name: g.clientName, phone: client.phone, message: `Dear ${g.clientName},\n\nThis is a friendly reminder regarding the payment for invoice ${g.invoiceNo} (Total: ₹${money(g.outstanding).toLocaleString('en-IN')}). If you have already processed the payment, please ignore this message.\n\nRegards,\n${company.name}`, path: attachmentPath });
      msgWb.addWorksheet('Message Logs');
      const excelFile = path.join(whatsappRootFor(company.id), `AutoReminder_${Date.now()}.xlsx`);
      await msgWb.xlsx.writeFile(excelFile);
      await runWhatsappAutomation(excelFile);
    } catch (err) {
      status = 'Failed'; failureReason = (err && err.message) || 'Unknown error';
    }
    appendReminderHistory(wb, { sentAt, party: g.clientName, company: company.name, invoiceNo: g.invoiceNo, channel: 'WhatsApp', status, failureReason });
    // Stamp lastReminderAt on every task row in the group, even on failure, so a broken
    // number/missing PDF retries on the normal 3-day cadence instead of every run.
    g.tasksInGroup.forEach((t) => { t.row.getCell(21).value = sentAt; });
    wrote = true;
  }
  if (wrote) await writeWorkbookRetrying(wb, dbPath);
}

async function run() {
  const registry = readRegistry();
  if (!registry) { console.log('[reminder-scheduler] No company registry found — nothing to do.'); return; }
  for (const company of registry.companies) {
    try { await sweepCompany(company); }
    catch (err) { console.warn(`[reminder-scheduler] Sweep failed for company ${company.id}:`, err.message); }
  }
}

run().then(() => process.exit(0)).catch((err) => { console.error('[reminder-scheduler] Fatal error:', err); process.exit(1); });
