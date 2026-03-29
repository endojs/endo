// @ts-check
// Entry point for bundling the daemon core for seL4/QuickJS.
// Includes the eventual-send shim (HandledPromise) that the
// daemon core requires.

// Install HandledPromise global — the daemon uses E() extensively.
import '@endo/eventual-send/shim.js';

export { makeDaemon } from './src/daemon.js';
