// debug-async-hooks.js - call lockdown with async_hooks patch for debugging

// Install async_hooks patches for Node.js debugging in lockdown mode
// This is a specialized entrypoint for debugging scenarios where async_hooks
// compatibility is needed (e.g., for debuggers in older Node.js versions).
// Note: This patch may not work in Node.js 24+.
import './src/node-async_hooks-patch.js';

// Install our HandledPromise global.
import './pre-remoting.js';

export * from '@endo/lockdown/commit-debug.js';
