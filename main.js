'use strict';

const { app, BrowserWindow, Menu, clipboard, dialog, ipcMain, net, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const store = require('./lib/store');
const { translateCommand } = require('./lib/translate');

app.setName('指令记录器');

const DATA_FILE = 'commands.json';
const MAX_IMPORT_BYTES = 20 * 1024 * 1024;
let mainWindow = null;

function dataFilePath() {
  return path.join(app.getPath('userData'), DATA_FILE);
}

function asErrorMessage(error) {
  if (!error) return '未知错误';
  return error.message || String(error);
}

function ownerWindow(event) {
  return BrowserWindow.fromWebContents(event.sender) || mainWindow;
}

function todayStamp() {
  const date = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
}

function ensureJsonExtension(filePath) {
  return /\.json$/i.test(filePath) ? filePath : filePath + '.json';
}

function createWindow() {
  const iconPath = path.join(__dirname, 'build', 'icon.png');
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 800,
    minWidth: 760,
    minHeight: 560,
    title: '指令记录器',
    backgroundColor: '#080b10',
    show: false,
    autoHideMenuBar: true,
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    titleBarStyle: 'hidden',
    titleBarOverlay: process.platform === 'win32'
      ? { color: '#0a0e14', symbolColor: '#9aa7b8', height: 70 }
      : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      devTools: !app.isPackaged
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!/^file:/i.test(url)) event.preventDefault();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function registerIpc() {
  ipcMain.handle('state:load', () => {
    try {
      const result = store.loadState(dataFilePath());
      return { ok: true, state: result.state, warning: result.warning };
    } catch (error) {
      return { ok: false, error: asErrorMessage(error) };
    }
  });

  ipcMain.handle('state:save', (_event, rawState) => {
    try {
      const state = store.saveState(dataFilePath(), rawState);
      return { ok: true, state };
    } catch (error) {
      return { ok: false, error: asErrorMessage(error) };
    }
  });

  ipcMain.handle('clipboard:write', (_event, text) => {
    try {
      if (typeof text !== 'string' || !text) {
        return { ok: false, error: '没有可复制的内容' };
      }
      clipboard.writeText(text);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: '复制失败：' + asErrorMessage(error) };
    }
  });

  ipcMain.handle('translate:text', async (_event, text) => {
    try {
      if (typeof text !== 'string') {
        return { ok: false, error: '指令内容无效' };
      }
      const result = await translateCommand(text, {
        fetchImpl: (url, options) => net.fetch(url, options)
      });
      return { ok: true, translation: result.translation, source: result.source };
    } catch (error) {
      return { ok: false, error: asErrorMessage(error) };
    }
  });

  ipcMain.handle('app:open-data-folder', async () => {
    try {
      const folder = app.getPath('userData');
      fs.mkdirSync(folder, { recursive: true });
      const message = await shell.openPath(folder);
      if (message) return { ok: false, error: message };
      return { ok: true, path: folder };
    } catch (error) {
      return { ok: false, error: asErrorMessage(error) };
    }
  });

  ipcMain.handle('data:export', async (event, rawState) => {
    try {
      const document = store.buildExportDocument(rawState);
      const owner = ownerWindow(event);
      const options = {
        title: '导出指令',
        defaultPath: path.join(app.getPath('documents'), '指令记录器-指令备份-' + todayStamp() + '.json'),
        filters: [{ name: 'JSON 备份', extensions: ['json'] }]
      };
      const result = owner
        ? await dialog.showSaveDialog(owner, options)
        : await dialog.showSaveDialog(options);
      if (result.canceled || !result.filePath) return { ok: false, canceled: true };

      const target = ensureJsonExtension(result.filePath);
      fs.writeFileSync(target, JSON.stringify(document, null, 2) + '\n', 'utf8');
      return {
        ok: true,
        filePath: target,
        count: document.commands.length,
        environmentCount: document.environmentOrder.length
      };
    } catch (error) {
      return { ok: false, error: '导出失败：' + asErrorMessage(error) };
    }
  });

  ipcMain.handle('data:import', async (event) => {
    try {
      const owner = ownerWindow(event);
      const options = {
        title: '导入指令备份',
        properties: ['openFile'],
        filters: [{ name: 'JSON 备份', extensions: ['json'] }]
      };
      const result = owner
        ? await dialog.showOpenDialog(owner, options)
        : await dialog.showOpenDialog(options);
      if (result.canceled || !result.filePaths.length) return { ok: false, canceled: true };

      const filePath = result.filePaths[0];
      const stats = fs.statSync(filePath);
      if (!stats.isFile()) return { ok: false, error: '所选路径不是文件' };
      if (stats.size > MAX_IMPORT_BYTES) {
        return { ok: false, error: '备份文件过大（最大支持 20 MB）' };
      }

      let raw;
      try {
        raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      } catch (error) {
        return { ok: false, error: '备份文件不是有效的 JSON' };
      }

      const state = store.parseImportDocument(raw);
      return {
        ok: true,
        filePath,
        fileName: path.basename(filePath),
        commands: state.commands,
        environmentOrder: state.environmentOrder
      };
    } catch (error) {
      return { ok: false, error: asErrorMessage(error) };
    }
  });
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    app.setAppUserModelId('com.commandrecorder.app');
    registerIpc();
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
