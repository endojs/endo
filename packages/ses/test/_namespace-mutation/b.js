// The whole point of this fixture is to observe the runtime's response to
// writing to an `import * as` namespace, so the no-import-assign lint must
// not interfere.
/* eslint-disable no-import-assign */

import * as foo from './a.js';

const result = {
  before: foo.x,
  isFrozen: Object.isFrozen(foo),
  isExtensible: Object.isExtensible(foo),
  descriptor: Object.getOwnPropertyDescriptor(foo, 'x'),
};

try {
  // @ts-expect-error TS2540 — namespace properties are read-only; the throw
  // (or its absence) is exactly what we are measuring.
  foo.x = 'bar';
  result.assignThrew = false;
  result.afterAssign = foo.x;
} catch (e) {
  result.assignThrew = true;
  result.assignErrorName = /** @type {Error} */ (e).name;
}

result.reflectSetReturn = Reflect.set(foo, 'x', 'bar');
result.afterReflectSet = foo.x;

export { result };
