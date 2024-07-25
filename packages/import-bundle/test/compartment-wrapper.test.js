/// <reference types="ses"/>
import test from '@endo/ses-ava/prepare-endo.js';

import { wrapInescapableCompartment } from '../src/compartment-wrapper.js';

const createChild = `() => new Compartment({console})`;

// simulate what pass-style wants to give a liveslots environment
const symbolEndowment = () => 0;
const endowmentSymbol = Symbol.for('endowmentSymbol');

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
  t.is(c.evaluate('globalThis.unenumerable'), 'yep');
  t.is(
    c.evaluate(`globalThis[Symbol.for('endowmentSymbol')]`),
    symbolEndowment,
  );
}

// match what @endo/pass-style does, but note that import-bundle
// does/should not depend upon on pass-style in any way
//
// alternative: have one of pass-style and import-bundle have a
// devDependencies on the other (avoid a cycle, avoid strong/"normal"
// `dependencies`), to allow a more thorough test, which is currently
// only really exercised by the agoric-sdk/swingset-liveslots test

test('wrap', t => {
  const inescapableTransforms = [];
  const inescapableGlobalProperties = {
    WeakMap: 'replaced',
    [endowmentSymbol]: symbolEndowment,
  };
  Object.defineProperty(inescapableGlobalProperties, 'unenumerable', {
    value: 'yep',
    enumerable: false,
  });
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
