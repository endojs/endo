/// <reference types="ses"/>

import { test } from '@endo/ses-ava/prepare-test-env-ava.js';
// eslint-disable-next-line import/order
import { wrapInescapableCompartment } from '../src/compartment-wrapper.js';

const createChild = `() => new Compartment({console})`;

function check(t, c, n) {
  t.is(c.evaluate('Compartment.name'), 'Compartment', `${n}.Compartment.name`);

  t.truthy(c instanceof Compartment, `${n} instanceof`);

  const Con = Object.getPrototypeOf(c.globalThis.Compartment).constructor;
  t.throws(
    () => new Con(),
    {
      message: 'Function.prototype.constructor is not a valid constructor.',
    },
    `${n} .constructor is tamed`,
  );

  t.is(c.evaluate('WeakMap'), 'replaced');
  t.is(c.evaluate('globalThis.WeakMap'), 'replaced');
}

test('wrap', t => {
  const inescapableTransforms = [];
  const inescapableGlobalProperties = { WeakMap: 'replaced' };
  const WrappedCompartment = wrapInescapableCompartment(
    Compartment,
    inescapableTransforms,
    inescapableGlobalProperties,
  );
  const endowments = { console };
  const c1 = new WrappedCompartment(endowments);
  check(t, c1, 'c1');

  const c2 = c1.evaluate(createChild)();
  check(t, c2, 'c2');

  const c3 = c2.evaluate(createChild)();
  check(t, c3, 'c3');
});
