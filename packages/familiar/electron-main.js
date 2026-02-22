// @ts-check
/* global process */

/**
 * Electron main process entry point for the Endo Familiar.
 *
 * Startup sequence:
 * 1. Ensure the Endo daemon is running
 * 2. Start the gateway server
 * 3. Create a BrowserWindow loading Chat with config via URL query params
 *
 * The daemon outlives the Familiar; the gateway does not.
 */

import path from 'path';
import { fileURLToPath } from 'url';
// @ts-expect-error Electron is not typed in this project
import { app, BrowserWindow, Menu, ipcMain, screen } from 'electron';

import {
  ensureDaemonRunning,
  restartDaemon,
  purgeDaemon,
} from './src/daemon-manager.js';
import { startGateway, stopGateway } from './src/gateway-manager.js';
import { resourcePaths } from './src/resource-paths.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const isDevMode = process.argv.includes('--dev');

/** @type {import('child_process').ChildProcess | undefined} */
let gatewayProcess;

/** @type {number | undefined} */
let httpPort;

/** @type {string | undefined} */
let endoId;

/**
 * Build the application menu.
 *
 * @param {() => void} onRestart - Callback when "Restart Daemon" is selected
 * @param {() => void} onPurge - Callback when "Purge Daemon" is selected
 */
const buildMenu = (onRestart, onPurge) => {
  const template = /** @type {Electron.MenuItemConstructorOptions[]} */ ([
    {
      label: '🐈‍⬛ Familiar',
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        {
          label: 'Restart Daemon',
          click: onRestart,
        },
        {
          label: 'Purge Daemon...',
          click: onPurge,
        },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [{ role: 'minimize' }, { role: 'zoom' }, { role: 'close' }],
    },
  ]);

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
};

/**
 * Create the main application window.
 *
 * @returns {Electron.BrowserWindow}
 */
const createWindow = () => {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const win = new BrowserWindow({
    title: 'Familiar',
    width,
    height,
    webPreferences: {
      preload: path.join(dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const query = `endoPort=${httpPort}&endoId=${endoId}`;

  if (isDevMode) {
    // In dev mode, load from Vite dev server
    const devUrl = `http://localhost:5173?${query}`;
    console.log(`[🐈‍⬛ Familiar] Loading dev URL: ${devUrl}`);
    win.loadURL(devUrl);
    win.webContents.openDevTools();
  } else {
    // In production mode, load the built Chat dist
    const fileUrl = `file://${resourcePaths.chatDistPath}?${query}`;
    console.log(`[🐈‍⬛ Familiar] Loading file URL: ${fileUrl}`);
    win.loadURL(fileUrl);
  }

  // Pipe renderer console output to main process stdout for diagnostics
  win.webContents.on(
    'console-message',
    (_event, level, message, line, sourceId) => {
      const levelName = ['verbose', 'info', 'warning', 'error'][level] || 'log';
      console.log(`[renderer:${levelName}] ${message} (${sourceId}:${line})`);
    },
  );

  return win;
};

/**
 * Handle daemon restart: restart daemon, restart gateway, reload window.
 *
 * @param {Electron.BrowserWindow | null} win
 */
const handleRestartDaemon = async win => {
  try {
    await restartDaemon();
    // Restart gateway to get fresh connection
    if (gatewayProcess) {
      stopGateway(gatewayProcess);
    }
    const gateway = await startGateway();
    gatewayProcess = gateway.process;
    httpPort = gateway.httpPort;
    endoId = gateway.endoId;
    // Reload the window with new config
    if (win && !win.isDestroyed()) {
      const query = `endoPort=${httpPort}&endoId=${endoId}`;
      if (isDevMode) {
        win.loadURL(`http://localhost:5173?${query}`);
      } else {
        win.loadURL(`file://${resourcePaths.chatDistPath}?${query}`);
      }
    }
  } catch (error) {
    console.error('[🐈‍⬛ Familiar] Failed to restart daemon:', error);
  }
};

/**
 * Handle daemon purge: purge daemon, restart it, restart gateway, reload.
 *
 * @param {Electron.BrowserWindow | null} win
 */
const handlePurgeDaemon = async win => {
  try {
    await purgeDaemon();
    // Start a fresh daemon after purge
    await ensureDaemonRunning();
    // Restart gateway to get fresh connection
    if (gatewayProcess) {
      stopGateway(gatewayProcess);
    }
    const gateway = await startGateway();
    gatewayProcess = gateway.process;
    httpPort = gateway.httpPort;
    endoId = gateway.endoId;
    // Reload the window with new config
    if (win && !win.isDestroyed()) {
      const query = `endoPort=${httpPort}&endoId=${endoId}`;
      if (isDevMode) {
        win.loadURL(`http://localhost:5173?${query}`);
      } else {
        win.loadURL(`file://${resourcePaths.chatDistPath}?${query}`);
      }
    }
  } catch (error) {
    console.error('[🐈‍⬛ Familiar] Failed to purge daemon:', error);
  }
};

const main = async () => {
  console.log('[🐈‍⬛ Familiar] Starting...');
  console.log(`[🐈‍⬛ Familiar] Dev mode: ${isDevMode}`);

  // Step 1: Ensure daemon is running
  await ensureDaemonRunning();

  // Step 2: Start gateway
  const gateway = await startGateway();
  gatewayProcess = gateway.process;
  httpPort = gateway.httpPort;
  endoId = gateway.endoId;

  console.log(`[🐈‍⬛ Familiar] Gateway port: ${httpPort}`);
  console.log(`[🐈‍⬛ Familiar] Endo ID: ${String(endoId).slice(0, 16)}...`);

  // Wait for Electron to be ready
  await app.whenReady();

  // Step 3: Create the window
  /** @type {Electron.BrowserWindow | null} */
  let mainWindow = createWindow();

  // Step 4: Build menu
  buildMenu(
    () => handleRestartDaemon(mainWindow),
    () => handlePurgeDaemon(mainWindow),
  );

  // Step 5: Register IPC handlers
  ipcMain.handle('familiar:restart-daemon', () =>
    handleRestartDaemon(mainWindow),
  );
  ipcMain.handle('familiar:purge-daemon', () => handlePurgeDaemon(mainWindow));
  ipcMain.handle('familiar:get-version', () => app.getVersion());

  // macOS: recreate window when dock icon is clicked
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow();
    }
  });

  // Quit when all windows are closed (except macOS)
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  // Clean up gateway on quit (daemon continues running)
  app.on('before-quit', () => {
    if (gatewayProcess) {
      console.log('[🐈‍⬛ Familiar] Shutting down gateway...');
      stopGateway(gatewayProcess);
      gatewayProcess = undefined;
    }
  });
};

main().catch(error => {
  console.error('[🐈‍⬛ Familiar] Fatal error:', error);
  process.exit(1);
});
