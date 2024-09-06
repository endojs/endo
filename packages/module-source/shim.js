/* global globalThis */

import { ModuleSource } from './index.js';

Object.defineProperty(globalThis, 'ModuleSource', {
  value: ModuleSource,
  enumerable: false,
  writable: true,
  configurable: true,
});
