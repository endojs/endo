import { weakmapGet, weakmapHas, weakmapSet } from './commons';
import { assert } from './utilities';

// Mimic private members on a class instance.
const store = new WeakMap();

export function getPrivateFields(instance) {
  // Class instance has no record. Should not proceed.
  assert(weakmapHas(store, instance), 'Class instance has no private fields');

  return weakmapGet(store, instance);
}

export function registerPrivateFields(instance, privateFields) {
  // Attempt to change an existing record on a Class instance. Should not proceed.
  assert(
    !weakmapHas(store, instance),
    'Class instance already has private fields'
  );

  weakmapSet(store, instance, privateFields);
}
