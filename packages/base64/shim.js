/* global globalThis */
// @ts-check
import { atob } from './atob.js';
import { btoa } from './btoa.js';

if (globalThis.atob === undefined) {
  globalThis.atob = atob;
}

if (globalThis.btoa === undefined) {
  globalThis.btoa = btoa;
}
