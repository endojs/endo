// pre-bundle-source.js - initialization to use @endo/bundle-source
// DEPRECATED: no longer necessary, imports of this module can be replaced with
//   import '@endo/init';
// or if further vetted shim initialization is needed:
//   import '@endo/init/pre.js';

// Use a package self-reference to go through the "exports" resolution
// eslint-disable-next-line import/no-extraneous-dependencies
export * from '@endo/init/pre.js';
