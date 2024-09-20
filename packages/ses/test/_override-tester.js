import {
  getPrototypeOf,
  getOwnPropertyDescriptor,
  getOwnPropertyNames,
} from '../src/commons.js';

function getValue(obj, name) {
  const desc = getOwnPropertyDescriptor(obj, name);
  return desc && desc.value;
}

export function overrideTester(t, type, obj, allowed = []) {
  const proto = getPrototypeOf(obj);
  for (const name of getOwnPropertyNames(proto)) {
    if (name === '__proto__') {
      t.notThrows(() => {
        obj[name] = 1;
      }, `Should not throw when setting property ${name} of ${type} instance`);
      t.not(
        getValue(obj, name),
        1,
        `Should not allow setting property ${name} of ${type} instance`,
      );
    } else if (allowed.includes(name)) {
      t.notThrows(() => {
        obj[name] = 1;
      }, `Should not throw when setting property ${name} of ${type} instance`);
      t.is(
        getValue(obj, name),
        1,
        `Should allow setting property ${name} of ${type} instance`,
      );
    } else {
      t.throws(
        () => {
          obj[name] = 1;
        },
        undefined,
        `Should throw when setting property ${name} of ${type} instance`,
      );
      t.not(
        getValue(obj, name),
        1,
        `Should not allow setting property ${name} of ${type} instance`,
      );
    }
  }
}
