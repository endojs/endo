/*---
description:
features: [harden]
flags: [onlyStrict,onlyLockdown]
---*/

class Class {
  #value;
  constructor(it) {
    this.#value = it;
  }
  get value() {
    return this.#value;
  }
  set value(it) {
    this.#value = it;
  }
}

const object = new Class('wow');
harden(object);
object.value = 'oops';
assert.sameValue(
  object.value,
  'oops',
  'hardened object: mutable private field',
);
