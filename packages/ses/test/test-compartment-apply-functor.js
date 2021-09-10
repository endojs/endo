/* global globalThis */
/* eslint-disable no-underscore-dangle */
import test from 'ava';
import '../index.js';

const FERAL_FUNCTION = globalThis.Function;
lockdown();

test('compartment main use case exploded', t => {
  function power(a) {
    return a + 1;
  }

  const magicModuleInitFn = FERAL_FUNCTION(`
    with (this) {
      // optimizer goes here
      return function() {
        'use strict';
        return ${function moduleInitializer(require, exports, module) {
          module.exports = a => power(a);
        }}
      };
    }
  `);

  const c1 = new Compartment({ power });
  const moduleInitializer1 = c1.__applyPrecompiledModuleFunctor__(
    magicModuleInitFn,
  );
  const moduleObj1 = { exports: {} };
  moduleInitializer1(null, moduleObj1.exports, moduleObj1);
  const power1 = moduleObj1.exports;
  t.is(power1(1), 2);
  t.is(power1(-1), 0);

  const attenuatedPower = arg => {
    if (arg <= 0) {
      throw new TypeError('only positive numbers');
    }
    return power1(arg);
  };

  const c2 = new Compartment({ power: attenuatedPower });
  const moduleInitializer2 = c2.__applyPrecompiledModuleFunctor__(
    magicModuleInitFn,
  );
  const moduleObj2 = { exports: {} };
  moduleInitializer2(null, moduleObj2.exports, moduleObj2);
  const power2 = moduleObj2.exports;
  t.is(power2(1), 2);
  t.throws(() => power2(-1), { instanceOf: TypeError });
});
