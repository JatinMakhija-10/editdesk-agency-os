const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { app, BrowserWindow, Menu, Tray, nativeImage, shell } = require('electron');

let mainWindow = null;
let tray = null;
let serverHandle = null;
let isQuitting = false;

function getDbPath() {
  if (process.env.EDITDESK_DB_PATH) return process.env.EDITDESK_DB_PATH;
  // Prefer workspace/portable data folder if writable during dev, else AppData userData
  const portableData = path.join(__dirname, '..', 'data', 'editdesk.db');
  if (fs.existsSync(portableData) || !app.isPackaged) {
    return portableData;
  }
  return path.join(app.getPath('userData'), 'editdesk.db');
}

function createWindow(port) {
  const iconPath = path.join(__dirname, '..', 'public', 'icon-192.png');
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    title: 'EditDesk — SYN Studio Ledger',
    backgroundColor: '#090b10',
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadURL(`http://127.0.0.1:${port}`);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('close', (e) => {
    if (isQuitting) return;
    let minimizeToTray = true;
    try {
      if (serverHandle?.db) {
        const row = serverHandle.db
          .prepare("SELECT value FROM app_settings WHERE key = 'minimize_to_tray'")
          .get();
        minimizeToTray = row ? row.value !== '0' : true;
      }
    } catch {
      // default true
    }
    if (minimizeToTray && tray) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

function setupTray(port) {
  const iconPath = path.join(__dirname, '..', 'public', 'icon-192.png');
  const img = fs.existsSync(iconPath)
    ? nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
    : nativeImage.createEmpty();
  tray = new Tray(img);
  tray.setToolTip(`EditDesk — Running on port ${port} (iPhone Sync Ready)`);

  const menu = Menu.buildFromTemplate([
    {
      label: 'Open EditDesk Desktop',
      click: () => {
        if (!mainWindow) createWindow(port);
        else {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Quit EditDesk (Stops iPhone Sync)',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(menu);
  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    const serverUrl = pathToFileURL(path.join(__dirname, '..', 'server', 'index.mjs')).href;
    const { startServer } = await import(serverUrl);
    const dbPath = getDbPath();
    const distDir = path.join(__dirname, '..', 'dist');
    const port = Number(process.env.EDITDESK_PORT || 4747);

    serverHandle = await startServer({ port, host: '0.0.0.0', dbPath, distDir });
    setupTray(serverHandle.port);
    createWindow(serverHandle.port);
  });

  app.on('before-quit', () => {
    isQuitting = true;
    try {
      serverHandle?.server?.close();
      serverHandle?.db?.close();
    } catch {
      // ignore
    }
  });
}
