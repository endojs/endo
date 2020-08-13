import test from 'tape-promise/tape';
import { HandledPromise } from './get-hp';

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
