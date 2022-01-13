// install-ses.js - call lockdown with default Agoric shims

// Install our HandledPromise global.
import './pre-remoting.js';

export * from '@agoric/lockdown/commit-debug.js';
