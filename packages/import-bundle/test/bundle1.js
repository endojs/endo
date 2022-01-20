/* global globalThis endow1 */

import { bundle2Add, bundle2Transform, bundle2ReadGlobal } from './bundle2.js';

// invocation
export function f1(a) {
  return a + 1;
}

// nested module invocation
export function f2(a) {
  return bundle2Add(a);
}

// endowments
export function f3(a) {
  return a + endow1;
}

// transforms
export function f4(a) {
  return `replaceme ${a}`;
}

// nested module transforms
export function f5(a) {
  return `Mr. Lambert says ${bundle2Transform(a)}`;
}

// globalThis should not hardened, and not available as a channel between
// unrelated code

export function f6ReadGlobal() {
  return globalThis.sneakyChannel;
}

export function f7ReadGlobalSubmodule() {
  return bundle2ReadGlobal();
}
