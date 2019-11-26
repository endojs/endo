import { test } from 'tape-promise/tape';
import { harden, makeCapTP } from '../lib/captp';

test('try disconnecting captp', async t => {
  try {
    const objs = [];
    const { getBootstrap, abort } = makeCapTP('us', obj => objs.push(obj), () => harden({}));
    t.deepEqual(objs, [], 'expected no messages');
    const bs = getBootstrap();
    t.deepEqual(objs, [{ type: 'CTP_BOOTSTRAP', questionID: 1 }], 'expected bootstrap messages');
    const pr = t.rejects(bs, Error, 'rejected after disconnect');
    const abortMsg = { type: 'CTP_ABORT', exception: Error('disconnect') };
    abort(abortMsg.exception);
    t.deepEqual(objs, [{ type: 'CTP_BOOTSTRAP', questionID: 1 }, abortMsg], 'expected disconnect messages');
    await pr;
  } catch (e) {
    t.isNot(e, e, 'unexpected exception');
  } finally {
    t.end();
  }
});
