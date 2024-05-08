/* global globalThis */

// We are using a reflexive import to make sure we pass through the conditional
// export in package.json.
// Eslint does not yet seem to have a carve-out for package-reflexive imports.
// eslint-disable-next-line import/no-extraneous-dependencies
import { ModuleSource } from '@endo/module-source';

Object.defineProperty(globalThis, 'ModuleSource', {
  value: ModuleSource,
  enumerable: false,
  writable: true,
  configurable: true,
});
