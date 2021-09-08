/* eslint-disable no-underscore-dangle */
import test from 'ava';
import '../index.js';

lockdown();

test('compartment main use case exploded', t => {
  function power(a) {
    return a + 1;
  }

  const c1 = new Compartment({ power });
  const { scopeProxy: scopeProxy1 } = c1.__makeScopeProxy__();
  const power1 = scopeProxy1.power;
  const attenuatedPower = arg => {
    if (arg <= 0) {
      throw new TypeError('only positive numbers');
    }
    return power1(arg);
  };

  const c2 = new Compartment({ power: attenuatedPower });
  const { scopeProxy: scopeProxy2 } = c2.__makeScopeProxy__();
  const power2 = scopeProxy2.power;
  const use = arg => {
    return power2(arg);
  };

  t.is(use(1), 2);
  t.throws(() => use(-1), { instanceOf: TypeError });
});
