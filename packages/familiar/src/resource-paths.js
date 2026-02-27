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
let gatewayServerPath;

/** @type {string} */
let chatDistPath;

/** @type {string} */
let endoDaemonPath;

/** @type {string} */
let endoWorkerPath;

/** @type {string} */
let workerSubprocessPath;

/** @type {string} */
let webPageBundlePath;

if (isPackaged) {
  const appRoot = path.join(
    /** @type {string} */ (process.resourcesPath),
    'app',
  );
  nodePath = path.join(appRoot, nodeBinary);
  endoCliPath = path.join(appRoot, 'bundles', 'endo-cli.cjs');
  gatewayServerPath = path.join(appRoot, 'bundles', 'gateway-server.cjs');
  chatDistPath = path.join(appRoot, 'dist', 'chat', 'index.html');
  endoDaemonPath = path.join(appRoot, 'bundles', 'endo-daemon.cjs');
  endoWorkerPath = path.join(appRoot, 'bundles', 'endo-worker.cjs');
  workerSubprocessPath = path.join(appRoot, 'bundles', 'worker-node.cjs');
  webPageBundlePath = path.join(appRoot, 'bundles', 'web-page-bundle.js');
} else {
  const repoRoot = path.resolve(dirname, '../../..');
  nodePath = 'node';
  endoCliPath = path.join(repoRoot, 'packages/cli/bin/endo.cjs');
  gatewayServerPath = path.join(
    repoRoot,
    'packages/chat/scripts/gateway-server.js',
  );
  chatDistPath = path.join(repoRoot, 'packages/chat/dist/index.html');
  endoDaemonPath = path.join(repoRoot, 'packages/daemon/src/daemon-node.js');
  endoWorkerPath = path.join(
    repoRoot,
    'packages/daemon/src/web-server-node.js',
  );
  workerSubprocessPath = path.join(
    repoRoot,
    'packages/daemon/src/worker-node.js',
  );
  // In dev mode, web-page.js is bundled at runtime by the compartment mapper.
  webPageBundlePath = '';
}

const resourcePaths = {
  nodePath,
  endoCliPath,
  gatewayServerPath,
  chatDistPath,
  endoDaemonPath,
  endoWorkerPath,
  workerSubprocessPath,
  webPageBundlePath,
};
if (typeof globalThis.harden === 'function') {
  globalThis.harden(resourcePaths);
}

export { resourcePaths };
