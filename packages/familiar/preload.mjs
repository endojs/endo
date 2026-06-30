// @ts-check

/**
 * Electron preload script.
 *
 * Exposes a minimal IPC bridge to the renderer via `contextBridge`.
 *
 * Electron 28+ supports ESM preload scripts when the file uses the
 * `.mjs` extension (the `"type": "module"` field in `package.json` is
 * ignored for preload).  The renderer here is unsandboxed
 * (`webPreferences.sandbox` is omitted in `electron-main.js`), so an
 * ESM preload is allowed.  See:
 * https://www.electronjs.org/docs/latest/tutorial/esm
 */

// @ts-ignore Electron is not typed in this project
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld(
  'familiar',
  /** @type {object} */ ({
    restartDaemon: () => ipcRenderer.invoke('familiar:restart-daemon'),
    purgeDaemon: () => ipcRenderer.invoke('familiar:purge-daemon'),
    getVersion: () => ipcRenderer.invoke('familiar:get-version'),
    onSecurityWarnings: (
      /** @type {(warnings: string[]) => void} */ callback,
    ) =>
      ipcRenderer.on('familiar:security-warnings', (_event, warnings) =>
        callback(warnings),
      ),
  }),
);
