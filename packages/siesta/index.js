// This thunk module re-exports a strict subset of src/: the supported
// public surface of the machine. The peer replay engines
// (src/peer-replay-engine.js), the in-memory store, the durable worker
// transport, the worker-session records, the pipe network, and the id
// validator are internal — test doubles and plumbing that in-package
// tests reach via relative imports. The `WorkerEngine` type in
// src/worker-engine.js remains the extension seam for future
// snapshotting JS engines.
export { makeSiestaDaemon } from './src/daemon.js';
export { makeXsEngine } from './src/xs-engine.js';
export { makeFsStore } from './src/store-fs.js';
export { makeTimerResource } from './src/resources.js';
export { makeDurableNetLayer } from './src/durable-netlayer.js';
