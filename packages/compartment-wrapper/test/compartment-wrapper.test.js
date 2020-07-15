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

const F1 = `() => addMilage()`;
const F2 = `() => getOdometer().reset()`;
const F3 = `(F2) => {
  const c = new Compartment();
  c.evaluate(F2)();
}`;
// attempt to shadow 'getOdometer'
const F4 = `(F1) => {
  const taboo = 'get' + 'Odometer';
  const fake = { add(_) {} };
  const globalLexicals = { [taboo]: fake };
  const c = new Compartment({}, {}, { globalLexicals });
  c.evaluate(F1);
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
  c1.evaluate(F1)();
  t.equal(odometer.read(), 1);

  t.end();
});
