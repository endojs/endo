/* global endow1 added */

import { bundle2 } from './bundle2.js';

export function f1(a) {
  return a + 1;
}

export function f2(a) {
  return bundle2(a);
}

export function f3(a) {
  return a + endow1;
}

export function f4(a) {
  return `replaceme ${added} ${a}`;
}
