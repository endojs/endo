/* globals globalThis, FinalizationRegistry, setImmediate */

import 'ses';
import './_lockdown.js';
import test from 'ava';

import v8 from 'node:v8';
import vm from 'node:vm';

import { isPromise, makePromiseKit, racePromises } from '../index.js';

/** @type {() => void} */
let engineGC;
if (typeof globalThis.gc !== 'function') {
  // Node.js v8 wizardry.
  v8.setFlagsFromString('--expose_gc');
  engineGC = vm.runInNewContext('gc');
  // Hide the gc global from new contexts/workers.
  v8.setFlagsFromString('--no-expose_gc');
} else {
  engineGC = globalThis.gc;
}

test('makePromiseKit', async t => {
  const { resolve, promise } = makePromiseKit();
  Promise.resolve().then(resolve);
  await promise;
  t.pass();
});

test('isPromise', t => {
  t.assert(isPromise(Promise.resolve()));
});

/** @type {FinalizationRegistry<() => void>} */
const fr = new FinalizationRegistry(held => {
  held();
});

const forever = new Promise(() => {});

function testRacePromise(t, candidate) {
  t.plan(2);
  const collected = makePromiseKit();
  let bothResults;

  let targetWasCollected = false;

  collected.promise.then(() => {
    targetWasCollected = true;
  });

  (() => {
    const raced = racePromises([forever, candidate]);
    const result = Promise.resolve(candidate);

    bothResults = Promise.allSettled([raced, result]);
    fr.register(raced, () => collected.resolve(undefined));
  })();

  return bothResults
    .then(([val1, val2]) => {
      t.deepEqual(val1, val2);
    })
    .then(() => {
      const sentinelCollected = new Promise(resolve => {
        fr.register({}, () => resolve(undefined));
      });

      new Promise(resolve => {
        setImmediate(resolve);
      }).then(engineGC);

      return sentinelCollected;
    })
    .then(() => {})
    .then(() => {
      if (targetWasCollected) {
        t.pass();
      } else {
        t.fail('Raced promise leaked');
      }
    });
}

test('racePromise: resolved', testRacePromise, Promise.resolve());
test('racePromise: rejected', testRacePromise, Promise.reject(Error('Test')));
test('racePromise: primitive', testRacePromise, -0);
test('racePromise: object', testRacePromise, {});
test('racePromise: thenable', testRacePromise, {
  internal: Promise.resolve(),
  then(res, rej) {
    return this.internal.then(res, rej);
  },
});
