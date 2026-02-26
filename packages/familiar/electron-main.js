// @ts-check
/* global process */

/**
 * Electron main process entry point for the Endo Familiar.
 *
 * Startup sequence:
 * 1. Register localhttp:// scheme and configure command-line flags (before app
 *    ready)
 * 2. Ensure the Endo daemon is running (daemon hosts the gateway)
 * 3. Read gateway connection info (port from ENDO_ADDR, agent ID from state)
 * 4. Install localhttp:// handler, exfiltration defenses, and navigation guard
 * 5. Create a BrowserWindow loading Chat with config via URL query params
 * 6. Verify exfiltration defenses and send warnings to renderer
 *
 * The daemon outlives the Familiar.
 */

import path from 'path';
import { fileURLToPath } from 'url';
// @ts-ignore Electron is not typed in this project
import { app, BrowserWindow, Menu, ipcMain, screen } from 'electron';

import {
  ensureDaemonRunning,
  restartDaemon,
  purgeDaemon,
  getAgentId,
  getGatewayAddress,
} from './src/daemon-manager.js';
import { resourcePaths } from './src/resource-paths.js';
import {
  registerLocalhttpScheme,
  installLocalhttpHandler,
} from './src/protocol-handler.js';
import { installNavigationGuard } from './src/navigation-guard.js';
import {
  configureCommandLineFlags,
  installExfiltrationDefenses,
  verifyExfiltrationDefenses,
} from './src/exfiltration-defense.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const isDevMode = process.argv.includes('--dev');

// --- Pre-ready setup ---
// These must be called before app.whenReady().
registerLocalhttpScheme();
configureCommandLineFlags();

/** @type {string | undefined} */
let gatewayAddress;

/** @type {string | undefined} */
let agentId;

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

  // Pass config as a URL fragment (anchor) rather than a query string so
  // the agent ID is never sent on the wire in an HTTP request.
  const fragment = `gateway=${gatewayAddress}&agent=${agentId}`;

  if (isDevMode) {
    // In dev mode, load from Vite dev server.
    // Use 127.0.0.1 instead of localhost to avoid DNS resolution, which
    // is vulnerable to integrity attacks.
    const devUrl = `http://127.0.0.1:5173#${fragment}`;
    console.log(`[🐈‍⬛ Familiar] Loading dev URL: ${devUrl}`);
    win.loadURL(devUrl);
    win.webContents.openDevTools();
  } else {
    // In production mode, load the built Chat dist
    const fileUrl = `file://${resourcePaths.chatDistPath}#${fragment}`;
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

  // Install navigation guard
  installNavigationGuard(win, { isDevMode });

  return win;
};

/**
 * Handle daemon restart: restart daemon, reload window.
 *
 * @param {Electron.BrowserWindow | null} win
 */
const handleRestartDaemon = async win => {
  await null;
  try {
    await restartDaemon();
    gatewayAddress = getGatewayAddress();
    agentId = await getAgentId();
    if (win && !win.isDestroyed()) {
      // Pass config as a URL fragment (anchor) rather than a query string so
      // the agent ID is never sent on the wire in an HTTP request.
      const fragment = `gateway=${gatewayAddress}&agent=${agentId}`;
      if (isDevMode) {
        win.loadURL(`http://127.0.0.1:5173#${fragment}`);
      } else {
        win.loadURL(`file://${resourcePaths.chatDistPath}#${fragment}`);
      }
    }
  } catch (error) {
    console.error('[Familiar] Failed to restart daemon:', error);
  }
};

/**
 * Handle daemon purge: purge daemon, restart it, reload window.
 *
 * @param {Electron.BrowserWindow | null} win
 */
const handlePurgeDaemon = async win => {
  await null;
  try {
    await purgeDaemon();
    gatewayAddress = getGatewayAddress();
    agentId = await getAgentId();
    if (win && !win.isDestroyed()) {
      // Pass config as a URL fragment (anchor) rather than a query string so
      // the agent ID is never sent on the wire in an HTTP request.
      const fragment = `gateway=${gatewayAddress}&agent=${agentId}`;
      if (isDevMode) {
        win.loadURL(`http://127.0.0.1:5173#${fragment}`);
      } else {
        win.loadURL(`file://${resourcePaths.chatDistPath}#${fragment}`);
      }
    }
  } catch (error) {
    console.error('[Familiar] Failed to purge daemon:', error);
  }
};

/**
 * Extract the gateway port from the gateway address string.
 *
 * @param {string} address - Gateway address in "host:port" format.
 * @returns {number}
 */
const parseGatewayPort = address => {
  const { port } = new URL(`http://${address}`);
  return port !== '' ? Number(port) : 8920;
};

const main = async () => {
  console.log('[🐈‍⬛ Familiar] Starting...');
  console.log(`[🐈‍⬛ Familiar] Dev mode: ${isDevMode}`);

  // Step 1: Ensure daemon is running (daemon hosts the gateway)
  await ensureDaemonRunning();

  // Step 2: Read gateway connection info
  gatewayAddress = getGatewayAddress();
  agentId = await getAgentId();

  console.log(`[Familiar] Gateway: ${gatewayAddress}`);
  console.log(`[Familiar] Agent ID: ${String(agentId).slice(0, 16)}...`);

  // Wait for Electron to be ready
  await app.whenReady();

  // Step 3: Install localhttp:// handler and exfiltration defenses
  const gatewayPort = parseGatewayPort(gatewayAddress);
  installLocalhttpHandler(gatewayPort);
  installExfiltrationDefenses();

  // Step 4: Create the window
  /** @type {Electron.BrowserWindow | null} */
  let mainWindow = createWindow();

  // Step 5: Build menu
  buildMenu(
    () => handleRestartDaemon(mainWindow),
    () => handlePurgeDaemon(mainWindow),
  );

  // Step 6: Register IPC handlers
  ipcMain.handle('familiar:restart-daemon', () =>
    handleRestartDaemon(mainWindow),
  );
  ipcMain.handle('familiar:purge-daemon', () => handlePurgeDaemon(mainWindow));
  ipcMain.handle('familiar:get-version', () => app.getVersion());

  // Step 7: Verify exfiltration defenses and notify renderer
  const warnings = await verifyExfiltrationDefenses();
  if (warnings.length > 0) {
    console.warn('[Familiar] Security warnings:', warnings);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('familiar:security-warnings', warnings);
    }
  }

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

  // Daemon continues running after quit; nothing to clean up.
};

main().catch(error => {
  console.error('[🐈‍⬛ Familiar] Fatal error:', error);
  process.exit(1);
});
