import test from 'tape-promise/tape';
import { HandledPromise } from '../src/index';

test('chained properties', async t => {
  try {
    const pr = {};
    const data = {};
    const queue = [];
    const handler = {
      applyMethod(_o, prop, args, target) {
        // Support: o~.[prop](...args) remote method invocation
        queue.push([0, prop, args, target]);
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
        [0, 'cont0', [], hp],
        [0, 'cont1', [], hp],
      ],
      `first turn`,
    );
    await pr.p;
  } catch (e) {
    t.isNot(e, e, 'unexpected exception');
  } finally {
    t.end();
  }
});

test('HandledPromise.unwrap', async t => {
  try {
    for (const [val, desc] of [
      [{}, 'object'],
      [true, 'true'],
      [false, 'false'],
      [undefined, 'undefined'],
      [null, 'null'],
      [123, 'number'],
      ['hello', 'string'],
    ]) {
      t.equal(HandledPromise.unwrap(val), val, `unwrapped ${desc} is equal`);
    }
    const t0 = {
      then() {},
    };
    t.throws(
      () => HandledPromise.unwrap(t0),
      TypeError,
      `unwrapped thenable object throws`,
    );
    const t1 = () => {};
    t1.then = () => {};
    t.throws(
      () => HandledPromise.unwrap(t1),
      TypeError,
      `unwrapped thenable function throws`,
    );
    const p0 = new Promise(_ => {});
    t.throws(
      () => HandledPromise.unwrap(p0),
      TypeError,
      `unwrapped unfulfilled Promise throws`,
    );
    const p1 = new Promise(resolve => {
      resolve({});
    });
    t.throws(
      () => HandledPromise.unwrap(p1),
      TypeError,
      `unwrapped resolved Promise throws`,
    );
    const p2 = new Promise((_, reject) => {
      reject(Error('p2'));
    });
    // Prevent unhandled promise rejection.
    p2.catch(_ => {});
    t.throws(
      () => HandledPromise.unwrap(p2),
      TypeError,
      `unwrapped rejected Promise throws`,
    );
    const hp0 = new HandledPromise(_ => {});
    t.throws(
      () => HandledPromise.unwrap(hp0),
      TypeError,
      'unfulfilled HandledPromise throws',
    );
    const hp1 = new HandledPromise(resolve => {
      resolve({});
    });
    t.throws(
      () => HandledPromise.unwrap(hp1),
      TypeError,
      'resolved HandledPromise throws',
    );
    const hp2 = new HandledPromise((_, reject) => {
      reject(Error('hp2'));
    });
    // Prevent unhandled promise rejection.
    hp2.catch(_ => {});
    t.throws(
      () => HandledPromise.unwrap(hp2),
      TypeError,
      'rejected HandledPromise throws',
    );
    let presence;
    const hp3 = new HandledPromise((_res, _rej, resolveWithPresence) => {
      presence = resolveWithPresence({});
    });
    t.equals(typeof presence, 'object', `typeof presence is object`);
    t.equals(
      HandledPromise.unwrap(hp3),
      presence,
      `unwrapped HandledPromise is presence`,
    );
    t.equals(
      HandledPromise.unwrap(presence),
      presence,
      `unwrapped presence is presence`,
    );
    const hp4 = new HandledPromise(resolve => {
      resolve(hp3);
    });
    t.equals(
      HandledPromise.unwrap(hp4),
      presence,
      `unwrapped forwarded HandledPromise is presence`,
    );
  } catch (e) {
    t.isNot(e, e, 'unexpected exception');
  } finally {
    t.end();
  }
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

  t.deepEquals(
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
