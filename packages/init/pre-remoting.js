// pre-remoting.js - shims necessary to use @endo/far

// Use a package self-reference to go through the "exports" resolution
// eslint-disable-next-line import/no-extraneous-dependencies
export * from '@endo/init/pre.js';

export * from '@endo/eventual-send/shim.js';
