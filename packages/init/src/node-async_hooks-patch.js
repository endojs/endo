/* global process */

import { setup } from './node-async_hooks.js';
import './node-async-local-storage-patch.js';

// Only apply the setup on Node.js versions before 24
// In Node.js 24+, the patch is skipped in node-async-local-storage-patch.js
const nodeVersion = parseInt(process.versions.node.split('.')[0], 10);

if (nodeVersion < 24) {
  setup({ withDestroy: true });
}
