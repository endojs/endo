import test from 'tape-promise/tape';
import { HandledPromise } from '../src/index';

test('chained properties', async t => {
  try {
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
    t.deepEqual(queue, [[0, 'cont0', []], [0, 'cont1', []]], `first turn`);
    await pr.p;
  } catch (e) {
    t.isNot(e, e, 'unexpected exception');
  } finally {
    t.end();
  }
});
