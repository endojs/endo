/* global Compartment */
import '@agoric/install-ses';
import tap from 'tap';
import { wrapInescapableCompartment } from '../src/compartment-wrapper.js';

const { test } = tap;

// We build a transform that allows oldSrc to increment the odometer, but not
// read it. Note, of course, that SES provides a far easier way to accomplish
// this (pass in a hardened `addMilage` endowment), but there are metering
// use cases that don't involve voluntary participation by oldSrc.

function milageTransform(oldSrc) {
  if (oldSrc.indexOf('getOdometer') !== -1) {
    throw Error(`forbidden access to 'getOdometer' in oldSrc`);
  }
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
  t.equal(odometer.read(), 0, `${n}.start`);
  c.evaluate(doAdd);
  t.equal(odometer.read(), 1, `${n}.doAdd`);
  odometer.reset();

  c.evaluate(doAddInChild)(doAdd);
  t.equal(odometer.read(), 1, `${n}.doAddInChild`);
  odometer.reset();

  odometer.add(5);
  t.throws(
    () => c.evaluate(attemptReset)(),
    /forbidden access/,
    `${n}.attemptReset`,
  );
  t.equal(odometer.read(), 5, `${n}  not reset`);

  t.throws(
    () => c.evaluate(attemptResetInChild)(attemptReset),
    /forbidden access/,
    `${n}.attemptResetInChild`,
  );
  t.equal(odometer.read(), 5, `${n}  not reset`);
  odometer.reset();

  const fakeCalled = c.evaluate(attemptResetByShadow)(doAdd);
  t.notOk(fakeCalled, `${n}.attemptResetByShadow`);
  t.equal(odometer.read(), 1, `${n}  called anyway`);
  odometer.reset();

  odometer.add(5);
  t.throws(
    () => c.evaluate(attemptResetByTransform)(),
    /forbidden access/,
    `${n}.attemptResetByTransform`,
  );
  t.equal(odometer.read(), 5, `${n}  not reset`);
  odometer.reset();

  t.equal(
    c.evaluate('Compartment.name'),
    'Compartment',
    `${n}.Compartment.name`,
  );

  t.ok(c instanceof Compartment, `${n} instanceof`);

  const Con = Object.getPrototypeOf(c.globalThis.Compartment).constructor;
  t.throws(() => new Con(), /Not available/, `${n} .constructor is tamed`);
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

  t.end();
});
