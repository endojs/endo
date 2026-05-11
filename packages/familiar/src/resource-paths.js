// @ts-check
/* global process, globalThis */

/**
 * Centralizes all resource path resolution with a dev/packaged switch.
 *
 * - In development (process.defaultApp is truthy): uses repo-relative paths
 *   and the system Node.js binary from PATH.
 * - In packaged builds: uses paths relative to the Electron resources directory.
 */

import path from 'path';
import { fileURLToPath } from 'url';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const isPackaged = !process.defaultApp;
const nodeBinary = process.platform === 'win32' ? 'node.exe' : 'node';

/** @type {string} */
let nodePath;

/** @type {string} */
let endoCliPath;

/** @type {string} */
let chatDistPath;

/** @type {string} */
let endoDaemonPath;

/** @type {string} */
let workerSubprocessPath;

/** @type {string} */
let endoLalSetupPath;

if (isPackaged) {
  const appRoot = path.join(
    /** @type {string} */ (process.resourcesPath),
    'app',
  );
  nodePath = path.join(appRoot, nodeBinary);
  endoCliPath = path.join(appRoot, 'bundles', 'endo-cli.cjs');
  chatDistPath = path.join(appRoot, 'dist', 'chat', 'index.html');
  endoDaemonPath = path.join(appRoot, 'bundles', 'endo-daemon.cjs');
  workerSubprocessPath = path.join(appRoot, 'bundles', 'worker-node.cjs');
  endoLalSetupPath = path.join(appRoot, 'bundles', 'endo-lal-setup.cjs');
} else {
  const repoRoot = path.resolve(dirname, '../../..');
  nodePath = 'node';
  endoCliPath = path.join(repoRoot, 'packages/cli/bin/endo.cjs');
  chatDistPath = path.join(repoRoot, 'packages/chat/dist/index.html');
  endoDaemonPath = path.join(repoRoot, 'packages/daemon/src/daemon-node.js');
  workerSubprocessPath = path.join(
    repoRoot,
    'packages/daemon/src/worker-node.js',
  );
  // In dev mode, agents are installed via CLI/ENDO_EXTRA.
  endoLalSetupPath = '';
}

const resourcePaths = {
  nodePath,
  endoCliPath,
  chatDistPath,
  endoDaemonPath,
  workerSubprocessPath,
  endoLalSetupPath,
};
if (typeof globalThis.harden === 'function') {
  globalThis.harden(resourcePaths);
}

export { resourcePaths };
