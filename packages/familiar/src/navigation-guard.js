// @ts-check

/**
 * Navigation delegate for the Familiar Electron shell.
 *
 * Intercepts all navigation away from the Familiar's expected origins and
 * prevents the Electron window from silently navigating to an external site.
 * Off-origin links open in the system browser after user confirmation.
 */

// @ts-ignore Electron is not typed in this project
import { dialog, shell } from 'electron';

/** @type {Set<string>} */
const allowedProtocols = new Set(['file:', 'localhttp:']);

/**
 * Prompt the user to open an external URL in the system browser.
 *
 * @param {Electron.BrowserWindow} parentWindow - The parent window for the
 *   dialog.
 * @param {string} url - The external URL to open.
 */
const promptExternalNavigation = async (parentWindow, url) => {
  const { response } = await dialog.showMessageBox(parentWindow, {
    type: 'question',
    buttons: ['Open in Browser', 'Cancel'],
    defaultId: 1,
    cancelId: 1,
    title: 'Open External Link',
    message: 'This link will open in your system web browser.',
    detail: url,
  });
  if (response === 0) {
    shell.openExternal(url);
  }
};

/**
 * Install navigation guards on a BrowserWindow.
 *
 * @param {Electron.BrowserWindow} win - The window to guard.
 * @param {object} options
 * @param {boolean} options.isDevMode - Whether running in dev mode.
 * @param {number} [options.vitePort] - The Vite dev server port (dev mode
 *   only).
 */
const installNavigationGuard = (win, { isDevMode, vitePort = 5173 }) => {
  // Intercept in-window navigation (e.g., clicking a link, JS location change)
  win.webContents.on('will-navigate', (event, navigationUrl) => {
    const target = new URL(navigationUrl);

    if (allowedProtocols.has(target.protocol)) {
      return; // Allow navigation within the app
    }
    // In dev mode, allow navigation to the Vite dev server
    if (isDevMode && target.origin === `http://127.0.0.1:${vitePort}`) {
      return;
    }

    // Block the navigation
    event.preventDefault();

    // Prompt user and open in system browser if confirmed
    promptExternalNavigation(win, navigationUrl);
  });

  // Intercept window.open() and target="_blank" links
  win.webContents.setWindowOpenHandler(({ url }) => {
    const target = new URL(url);
    if (target.protocol === 'localhttp:') {
      return { action: /** @type {const} */ ('allow') };
    }
    promptExternalNavigation(win, url);
    return { action: /** @type {const} */ ('deny') };
  });
};

export { installNavigationGuard };
