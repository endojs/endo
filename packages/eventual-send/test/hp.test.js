import '@endo/lockdown/commit-debug.js';
import test from 'ava';

import { HandledPromise } from './get-hp.js';

const { getPrototypeOf, isFrozen } = Object;
const { ownKeys, getOwnPropertyDescriptor } = Reflect;

const { quote: q } = assert;

test('sufficiently hardened', t => {
  const expectedReachableIntrinsics = new Set([
    Function.prototype,
    Promise,
    Promise.prototype,
  ]);
  const checkSufficientlyHardened = (val, path = []) => {
    if (Object(val) !== val || expectedReachableIntrinsics.has(val)) {
      return;
    }
    t.true(isFrozen(val), `${q(path)} is frozen`);
    for (const key of ownKeys(val)) {
      const keyPath = path.concat(key);
      const desc = getOwnPropertyDescriptor(val, key);
      t.true(
        ownKeys(desc).includes('value'),
        `${q(keyPath)} is a data property`,
      );
      checkSufficientlyHardened(desc.value, keyPath);
    }
    checkSufficientlyHardened(getPrototypeOf(val), path.concat('__proto__'));
  };
  checkSufficientlyHardened(HandledPromise, ['HandledPromise']);
});

test('chained properties', async t => {
  const pr = {};
  const data = {};
  const queue = [];
  const handler = {
    applyMethod(_o, prop, args) {
      // Support: o~.[prop](...args) remote method invocation
      queue.push([0, prop, args]);
      return data;
      // return queueMessage(slot, prop, args);
    },
  };
  data.prop = new HandledPromise(_ => {}, handler);

  pr.p = new HandledPromise((res, rej, resolveWithPresence) => {
    pr.res = res;
    pr.rej = rej;
    pr.resPres = resolveWithPresence;
  }, handler);

  const hp = HandledPromise.applyMethod(
    HandledPromise.get(HandledPromise.applyMethod(pr.p, 'cont0', []), 'prop'),
    'cont1',
    [],
  );
  t.deepEqual(queue, [], `zeroth turn`);
  pr.resPres(handler);
  await hp;
  t.deepEqual(
    queue,
    [
      [0, 'cont0', []],
      [0, 'cont1', []],
    ],
    `first turn`,
  );
  await pr.p;
});

test('no local stalls', async t => {
  const log = [];
  const target = {
    call(count) {
      log.push(`called ${count}`);
    },
  };

  let resolve;
  const p = new HandledPromise(r => (resolve = r));
  resolve(target);
  await Promise.resolve();

  log.push('calling 1');
  HandledPromise.applyMethod(p, 'call', [1]);
  log.push(`end of turn 1`);
  await Promise.resolve();

  log.push('calling 2');
  HandledPromise.applyMethod(p, 'call', [2]);
  log.push(`end of turn 2`);
  await Promise.resolve();
  log.push(`end of turn 3`);
  await Promise.resolve();

  t.deepEqual(
    log,
    [
      'calling 1',
      'end of turn 1',
      'called 1',
      'calling 2',
      'end of turn 2',
      'called 2',
      'end of turn 3',
    ],
    'log is golden',
  );
});

test('simple resolveWithPresence', async t => {
  const log = [];
  const presenceHandler = {
    applyMethod(target, verb, args) {
      log.push(['applyMethod', target, verb, args]);
      return undefined;
    },
  };
  let presence;
  const pr = new HandledPromise((_res, _rej, rWp) => {
    presence = rWp(presenceHandler);
    return presence;
  });
  HandledPromise.applyMethod(pr, 'aðferð', [1]);
  await Promise.resolve();
  t.deepEqual(log, [['applyMethod', presence, 'aðferð', [1]]], 'log a-ok');
});

test('resolveWithPresence pipelining', async t => {
  const logA = [];
  const unresolvedHandler = {
    applyMethod(target, verb, args) {
      logA.push(['applyMethod', target, verb, args]);
      return undefined;
    },
  };
  const logB = [];
  const presenceHandler = {
    applyMethod(target, verb, args) {
      logB.push(['applyMethod', target, verb, args]);
      return undefined;
    },
  };
  const p0 = {};
  p0.promise = new HandledPromise((resolve, reject, resolveWithPresence) => {
    p0.resolve = resolve;
    p0.reject = reject;
    p0.resolveWithPresence = resolveWithPresence;
  }, unresolvedHandler);
  HandledPromise.applyMethod(p0.promise, 'óðaÖnn', [1]);
  await Promise.resolve();
  const p1 = p0.resolveWithPresence(presenceHandler);
  HandledPromise.applyMethod(p0.promise, 'aðferð', [2]);
  await Promise.resolve();
  // t.log('logA:', logA);
  // t.log('logB:', logB);
  // t.log('p1:', p1);
  t.deepEqual(logA, [['applyMethod', p0.promise, 'óðaÖnn', [1]]], 'logA ok');
  t.deepEqual(logB, [['applyMethod', p1, 'aðferð', [2]]], 'logB ok');
  // t.fail('stöðva hér');
});

test('resolveWithPresence return value is resolution', async t => {
  const presenceHandler = {
    applyMethod(target, verb, args) {
      const muffler = [];
      muffler.push(target);
      muffler.push(verb);
      muffler.push(args);
      return undefined;
    },
  };
  let presence;
  const vow = new HandledPromise((_resolve, _reject, resolveWithPresence) => {
    presence = resolveWithPresence(presenceHandler);
  });
  const p = await vow;
  t.is(presence, p);
});
