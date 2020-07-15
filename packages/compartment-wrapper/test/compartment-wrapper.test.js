/* global Compartment */
import './install-ses.js';
import tap from 'tap';
import { inescapableCompartment } from '../compartment-wrapper.js';

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

const createChild = `() => new Compartment()`;
const doAdd = `() => addMilage()`;
const attemptReset = `() => getOdometer().reset()`;
const attemptResetInChild = `(attemptReset) => {
  const c = new Compartment();
  c.evaluate(attemptReset)();
}`;
// attempt to shadow 'getOdometer'
const attemptResetByShadow = `(doAdd) => {
  const taboo = 'get' + 'Odometer';
  const fake = { add(_) {} };
  const globalLexicals = { [taboo]: fake };
  const c = new Compartment({}, {}, { globalLexicals });
  c.evaluate(doAdd);
}`;

test('wrap', t => {
  const odometer = makeOdometer();
  function getOdometer() {
    return odometer;
  }

  const c1 = inescapableCompartment(Compartment, {
    inescapableTransforms: [milageTransform],
    inescapableGlobalLexicals: { getOdometer },
  });

  t.equal(odometer.read(), 0);
  c1.evaluate(doAdd)();
  t.equal(odometer.read(), 1);
  const c2 = c1.evaluate(createChild)();
  c2.evaluate(doAdd)();
  t.equal(odometer.read(), 2);
  const c3 = c2.evaluate(createChild)();
  c3.evaluate(doAdd)();
  t.equal(odometer.read(), 3);

  t.throws(() => c1.evaluate(attemptReset)());
  t.throws(() => c1.evaluate(attemptResetInChild)());
  t.throws(() => c1.evaluate(attemptResetByShadow)());

  t.throws(() => c2.evaluate(attemptReset)());
  t.throws(() => c2.evaluate(attemptResetInChild)());
  t.throws(() => c2.evaluate(attemptResetByShadow)());

  t.throws(() => c3.evaluate(attemptReset)());
  t.throws(() => c3.evaluate(attemptResetInChild)());
  t.throws(() => c3.evaluate(attemptResetByShadow)());

  t.end();
});
