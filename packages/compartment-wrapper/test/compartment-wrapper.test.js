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

const createChild = `() => new Compartment({console})`;
const doAdd = `addMilage()`;
const doAddInChild = `(doAdd) => (new Compartment({console})).evaluate(doAdd)`;
const attemptReset = `() => getOdometer().reset()`;
const attemptResetInChild = `(attemptReset) => {
  const c = new Compartment();
  c.evaluate(attemptReset)();
}`;

// attempt to shadow 'getOdometer'
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

// TODO: attempt to undo the transform

// what if the wrapper doesn't tame .constructor
const useGetOdometer = 'getOdometer + 1';
const attemptUseInUntamedChild = `(useGetOdometer) => {
  const taboo = 'get' + 'Odometer';
  let fakeCalled = false;
  function fakeGet() {
    fakeCalled = true;
    return {
       add(_) {addMilage(); addMilage();},
    };
  }
  const globalLexicals = { [taboo]: fakeGet };

  const c = new Compartment();
  const origCompartment = Object.getPrototypeOf(c).constructor;
  const c2 = new origCompartment({ console, [taboo]: 5 }); // unconfined
  return c2.evaluate(useGetOdometer);
}`;

const attemptResetInUntamedChild = `(useGetOdometer) => {
  const taboo = 'get' + 'Odometer';
  let fakeCalled = false;
  function fakeGet() {
    fakeCalled = true;
    return {
       add(_) {addMilage(); addMilage();},
    };
  }
  const globalLexicals = { [taboo]: fakeGet };

  // todo: either modify the prototype (take advantage of an unfrozen wrapper), or somehow use the child
  const c = new Compartment();
  const origCompartment = Object.getPrototypeOf(c).constructor;
  const c2 = new origCompartment({ console, [taboo]: 5 }); // unconfined
  return c2.evaluate(useGetOdometer);
}`;

test('wrap', t => {
  const odometer = makeOdometer();
  function getOdometer() {
    return odometer;
  }

  const c1 = inescapableCompartment(Compartment, {
    endowments: { console },
    inescapableTransforms: [milageTransform],
    inescapableGlobalLexicals: { getOdometer },
  });

/*
  t.equal(odometer.read(), 0);
  c1.evaluate(doAdd);
  t.equal(odometer.read(), 1);
  odometer.reset();

  c1.evaluate(doAddInChild)(doAdd);
  t.equal(odometer.read(), 1);
  odometer.reset();

  const c2 = c1.evaluate(createChild)();
  c2.evaluate(doAdd);
  t.equal(odometer.read(), 1);
  odometer.reset();

  const c3 = c2.evaluate(createChild)();
  c3.evaluate(doAdd);
  t.equal(odometer.read(), 1);
  odometer.reset();

  t.throws(() => c1.evaluate(attemptReset)(), /forbidden access/, 'c1.attemptReset');
  t.throws(() => c1.evaluate(attemptResetInChild)(attemptReset), /forbidden access/, 'c1.attemptResetInChild');

  let fakeCalled = c1.evaluate(attemptResetByShadow)(doAdd);
  t.equal(fakeCalled, false);
  t.equal(odometer.read(), 1);
  odometer.reset();
*/

  // Until we tame .constructor of the wrapped Compartment, code will be able
  // to get access to the unwrapped original, and use that to escape
  // confinement. It can
  t.equal(c1.evaluate(attemptUseInUntamedChild)(useGetOdometer), 6);
  //t.throws(() => c1.evaluate(attemptUseInUntamedChild)(useGetOdometer), /xx/);
  return t.end();

  t.throws(() => c2.evaluate(attemptReset)(), /forbidden access/, 'c2.attemptReset');
  t.throws(() => c2.evaluate(attemptResetInChild)(attemptReset), /forbidden access/, 'c2.attemptResetInChild');
  t.throws(() => c2.evaluate(attemptResetByShadow)());

  t.throws(() => c3.evaluate(attemptReset)(), /forbidden access/, 'c3.attemptReset');
  t.throws(() => c3.evaluate(attemptResetInChild)(attemptReset), /forbidden access/, 'c3.attemptResetInChild');
  t.throws(() => c3.evaluate(attemptResetByShadow)());

  t.equal(c1.evaluate('Compartment.name'), 'Compartment');
  t.equal(c2.evaluate('Compartment.name'), 'Compartment');
  t.equal(c3.evaluate('Compartment.name'), 'Compartment');



  // check .prototype
  //
  t.end();
});
