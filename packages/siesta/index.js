// This thunk module re-exports a strict subset of src/: the supported
// public surface of the machine. The replay engines
// (src/journal-replay-engine.js), the in-memory store, the persistent
// tables kit, the worker shell, and the id validator are internal —
// test doubles and plumbing that in-package tests reach via relative
// imports. The `WorkerEngine` type in src/host.js remains the
// extension seam for future snapshotting JS engines.
export { makeSiestaHost } from './src/host.js';
export { makeSiestaDaemon } from './src/daemon.js';
export { makeXsEngine } from './src/xs-engine.js';
export { makeFsStore } from './src/store-fs.js';
export { makeTimerResource } from './src/resources.js';
