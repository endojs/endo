/* global globalThis */

// We are using a reflexive import to make sure we pass through the conditional
// export in package.json.
import { ModuleSource } from '@endo/module-source';

Object.defineProperty(globalThis, 'ModuleSource', {
  value: ModuleSource,
  enumerable: false,
  writable: true,
  configurable: true,
});
