// @ts-check
/* eslint-disable @jessie.js/safe-await-separator */

'use strict';

// Electron preload script (CommonJS required by Electron)
// Exposes a minimal IPC bridge to the renderer via contextBridge.

const { contextBridge, ipcRenderer } = require('electron'); // eslint-disable-line @typescript-eslint/no-require-imports

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
