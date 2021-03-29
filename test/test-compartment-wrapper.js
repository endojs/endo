// eslint-disable-next-line import/no-extraneous-dependencies
import { test } from '@agoric/swingset-vat/tools/prepare-test-env-ava';

import { assert, details as X } from '@agoric/assert';
import { wrapInescapableCompartment } from '../src/compartment-wrapper.js';

// We build a transform that allows oldSrc to increment the odometer, but not
// read it. Note, of course, that SES provides a far easier way to accomplish
// this (pass in a hardened `addMilage` endowment), but there are metering
// use cases that don't involve voluntary participation by oldSrc.

function milageTransform(oldSrc) {
  assert(
    oldSrc.indexOf('getOdometer') === -1,
    X`forbidden access to 'getOdometer' in oldSrc`,
  );
  return oldSrc.replace(/addMilage\(\)/g, 'getOdometer().add(1)');
}

// add a lexical that the original code cannot reach
function makeOdometer() {
  let counter = 0;
  function add(count) {
    counter += count;
  }
  function reset() {
    counter = 0; // forbidden
  }
  function read() {
    return counter;
  }
  return { add, read, reset };
}

const createChild = `() => new Compartment({console})`;
const doAdd = `addMilage()`;
const doAddInChild = `(doAdd) => (new Compartment({console})).evaluate(doAdd)`;
const attemptReset = `() => getOdometer().reset()`;
const attemptResetInChild = `(attemptReset) => {
  const c = new Compartment();
  c.evaluate(attemptReset)();
}`;

// attempt to shadow 'getOdometer' (blocked by the inescapable lexical coming
// last)
const attemptResetByShadow = `(doAdd) => {
  const taboo = 'get' + 'Odometer';
  let fakeCalled = false;
  function fakeGet() {
    fakeCalled = true;
    return {
       add(_) {addMilage(); addMilage();},
    };
  }
  const globalLexicals = { [taboo]: fakeGet };

  const c = new Compartment({ console }, {}, { globalLexicals });
  c.evaluate(doAdd);
  return fakeCalled;
}`;

// attempt to undo the transform (blocked by the inescapable transform coming
// last)
const attemptResetByTransform = `() => {
  const taboo = 'get' + 'Odometer';
  function transform(oldSrc) {
    return oldSrc.replace(/getTaboo/g, taboo);
  }
  const transforms = [ transform ];
  const c = new Compartment({ console }, {}, { transforms });
  c.evaluate('getTaboo().reset()');
}`;

function check(t, c, odometer, n) {
  t.is(odometer.read(), 0, `${n}.start`);
  c.evaluate(doAdd);
  t.is(odometer.read(), 1, `${n}.doAdd`);
  odometer.reset();

  c.evaluate(doAddInChild)(doAdd);
  t.is(odometer.read(), 1, `${n}.doAddInChild`);
  odometer.reset();

  odometer.add(5);
  t.throws(
    () => c.evaluate(attemptReset)(),
    { message: /forbidden access/ },
    `${n}.attemptReset`,
  );
  t.is(odometer.read(), 5, `${n}  not reset`);

  t.throws(
    () => c.evaluate(attemptResetInChild)(attemptReset),
    { message: /forbidden access/ },
    `${n}.attemptResetInChild`,
  );
  t.is(odometer.read(), 5, `${n}  not reset`);
  odometer.reset();

  const fakeCalled = c.evaluate(attemptResetByShadow)(doAdd);
  t.falsy(fakeCalled, `${n}.attemptResetByShadow`);
  t.is(odometer.read(), 1, `${n}  called anyway`);
  odometer.reset();

  odometer.add(5);
  t.throws(
    () => c.evaluate(attemptResetByTransform)(),
    { message: /forbidden access/ },
    `${n}.attemptResetByTransform`,
  );
  t.is(odometer.read(), 5, `${n}  not reset`);
  odometer.reset();

  t.is(c.evaluate('Compartment.name'), 'Compartment', `${n}.Compartment.name`);

  t.truthy(c instanceof Compartment, `${n} instanceof`);

  const Con = Object.getPrototypeOf(c.globalThis.Compartment).constructor;
  t.throws(
    () => new Con(),
    { message: /Not available/ },
    `${n} .constructor is tamed`,
  );
}

test('wrap', t => {
  const odometer = makeOdometer();
  function getOdometer() {
    return odometer;
  }

  const inescapableTransforms = [milageTransform];
  const inescapableGlobalLexicals = { getOdometer };
  const WrappedCompartment = wrapInescapableCompartment(
    Compartment,
    inescapableTransforms,
    inescapableGlobalLexicals,
  );
  const endowments = { console };
  const c1 = new WrappedCompartment(endowments);
  check(t, c1, odometer, 'c1');

  const c2 = c1.evaluate(createChild)();
  check(t, c2, odometer, 'c2');

  const c3 = c2.evaluate(createChild)();
  check(t, c3, odometer, 'c3');
});
