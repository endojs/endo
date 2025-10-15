import {
  getPrototypeOf,
  getOwnPropertyDescriptor,
  ownKeys,
} from '../src/commons.js';

function getValue(obj, name) {
  const desc = getOwnPropertyDescriptor(obj, name);
  return desc && desc.value;
}

export function overrideTester(t, type, obj, allowed = []) {
  const proto = getPrototypeOf(obj);
  for (const key of ownKeys(proto)) {
    if (key === '__proto__') {
      t.notThrows(
        () => {
          obj[key] = 1;
        },
        `Should not throw when setting property ${String(key)} of ${type} instance`,
      );
      t.not(
        getValue(obj, key),
        1,
        `Should not allow setting property ${String(key)} of ${type} instance`,
      );
    } else if (allowed.includes(key)) {
      t.notThrows(
        () => {
          obj[key] = 1;
        },
        `Should not throw when setting property ${String(key)} of ${type} instance`,
      );
      t.is(
        getValue(obj, key),
        1,
        `Should allow setting property ${String(key)} of ${type} instance`,
      );
    } else {
      t.throws(
        () => {
          obj[key] = 1;
        },
        undefined,
        `Should throw when setting property ${String(key)} of ${type} instance`,
      );
      t.not(
        getValue(obj, key),
        1,
        `Should not allow setting property ${String(key)} of ${type} instance`,
      );
    }
  }
}
