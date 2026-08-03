const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');

// Ensure only one instance runs. If a second is launched, focus the existing window and quit.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); }

// Run the server logic directly within Electron's main process
// This ensures it works even if the user doesn't have Node.js installed on their system path.
const startServer = () => {
  try {
    // We require the server file which will start listening on port 3000
    // We pass '--no-open' via process.argv if needed, or just let server.js handle it
    process.argv.push('--no-open'); 
    require('./server.js'); 
    console.log('Backend server started successfully within Electron.');
  } catch (err) {
    console.error('Failed to start internal server:', err);
  }
};

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1300,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      // Keep timers running at full speed while minimized/hidden so payment
      // reminder alerts and countdowns stay accurate in the background.
      backgroundThrottling: false
    },
    title: "CA Invoice Utility - Professional Management Tool",
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'app', 'icon.png')
  });

  // Support links (WhatsApp, mailto) must open in the system browser/mail app. Internal
  // links (e.g. the invoice PDF viewer) must stay inside the app so they keep the user's
  // logged-in session — routing those to the system browser loses the session cookie and
  // shows "Not authenticated" instead of the invoice.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://localhost:3000')) return { action: 'allow' };
    shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith('http://localhost:3000')) return;
    event.preventDefault();
    shell.openExternal(url);
  });

  // Poll until the Express server is accepting connections, then load.
  const http = require('http');
  const tryLoad = (attempts) => {
    http.get('http://localhost:3000/license-status', () => {
      mainWindow.loadURL('http://localhost:3000');
    }).on('error', () => {
      if (attempts < 40) setTimeout(() => tryLoad(attempts + 1), 500);
      else mainWindow.loadURL('http://localhost:3000'); // last-resort load after 20 s
    });
  };
  tryLoad(0);

  // Wait for the renderer's IPC listeners to attach before starting update
  // checks, so early status events aren't sent into the void.
  mainWindow.webContents.once('did-finish-load', () => setupAutoUpdater());

  mainWindow.on('closed', function () {
    mainWindow = null;
  });
}

// ---------------------------------------------------------------------------
// Auto-update (electron-updater). Only active in the packaged production
// app — never during `npm run dev` / `electron .` from source, where there is
// no installed NSIS app to update and no publish feed configured.
// ---------------------------------------------------------------------------
let autoUpdater = null;
let updaterLog = null;
let autoUpdaterInitialized = false;

function sendToRenderer(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

// electron-updater's HttpError.message embeds the full raw HTTP response
// (headers, cookies, everything) — never show that to the user. The full
// detail is still captured by updaterLog for troubleshooting.
function friendlyUpdateError(err) {
  const raw = (err && err.message) ? String(err.message) : '';
  if (/404/.test(raw)) return 'No update feed is published yet. Please contact support.';
  if (/ENOTFOUND|ENETUNREACH|ECONNREFUSED|EAI_AGAIN/.test(raw)) return 'No internet connection. Please check your network and try again.';
  if (/timed out|ETIMEDOUT/i.test(raw)) return 'The update check timed out. Please try again.';
  return 'Update check failed. Please try again later.';
}

function setupAutoUpdater() {
  if (!app.isPackaged || autoUpdaterInitialized) return; // dev/source runs never check for updates
  autoUpdaterInitialized = true;

  updaterLog = require('electron-log');
  updaterLog.transports.file.level = 'info';
  updaterLog.transports.console.level = 'info';

  autoUpdater = require('electron-updater').autoUpdater;
  autoUpdater.logger = updaterLog;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    updaterLog.info('Checking for update...');
    sendToRenderer('updates:status', { state: 'checking', message: 'Checking for updates...' });
  });
  autoUpdater.on('update-available', (info) => {
    updaterLog.info(`Update available: ${info.version}`);
    sendToRenderer('updates:status', { state: 'available', message: `Update ${info.version} found. Downloading in the background...`, version: info.version });
  });
  autoUpdater.on('update-not-available', () => {
    updaterLog.info('No update available.');
    sendToRenderer('updates:status', { state: 'up-to-date', message: 'You are on the latest version.' });
  });
  autoUpdater.on('download-progress', (progress) => {
    sendToRenderer('updates:progress', {
      percent: Math.round(progress.percent),
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total
    });
  });
  autoUpdater.on('update-downloaded', (info) => {
    updaterLog.info(`Update downloaded: ${info.version}`);
    sendToRenderer('updates:status', { state: 'downloaded', message: `Update ${info.version} downloaded. Restart to install.`, version: info.version });
  });
  autoUpdater.on('error', (err) => {
    updaterLog.error('Auto-update error:', err);
    sendToRenderer('updates:status', { state: 'error', message: friendlyUpdateError(err) });
  });

  // Background check on startup; the "Check for Updates" button re-triggers this.
  autoUpdater.checkForUpdates().catch((err) => updaterLog.error('Initial update check failed:', err));
}

ipcMain.handle('updates:get-version', () => app.getVersion());

ipcMain.handle('updates:check', async () => {
  if (!app.isPackaged || !autoUpdater) {
    return { ok: false, message: 'Updates are only available in the installed app, not in this development build.' };
  }
  try {
    await autoUpdater.checkForUpdates();
    return { ok: true };
  } catch (err) {
    if (updaterLog) updaterLog.error('Manual update check failed:', err);
    return { ok: false, message: friendlyUpdateError(err) };
  }
});

ipcMain.on('updates:restart-install', () => {
  if (app.isPackaged && autoUpdater) autoUpdater.quitAndInstall();
});

// Focus existing window if a second instance tries to launch
app.on('second-instance', () => { if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); } });

// Prepare the application
app.on('ready', () => {
  startServer();
  createWindow();
});

// Quit when all windows are closed.
app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', function () {
  if (mainWindow === null) {
    createWindow();
  }
});
