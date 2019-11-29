import { assert } from './assertions';
import { weakmapGet, weakmapHas, weakmapSet } from './commons';

// Module "privateFields"
// Mimic the private state of a class instance.

// Hidden storage for private fields.
const privateFields = new WeakMap();

export function setPrivateFields(classInstance, fields) {
  // Attempt to change an existing record of private members on
  // a Class instance: should not proceed.
  assert(
    !weakmapHas(privateFields, classInstance),
    'private fields already defined',
  );

  weakmapSet(privateFields, classInstance, fields);
}

export function getPrivateFields(classInstance) {
  // Class instance has no private members: should not proceed.
  assert(
    weakmapHas(privateFields, classInstance),
    'private fields not defined',
  );

  return weakmapGet(privateFields, classInstance);
}
