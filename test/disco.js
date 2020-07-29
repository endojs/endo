/* global harden */

import '@agoric/install-ses';
import { test } from 'tape-promise/tape';
import { E, makeCapTP } from '../lib/captp';

test('try disconnecting captp', async t => {
  try {
    const objs = [];
    const { getBootstrap, abort } = makeCapTP(
      'us',
      obj => objs.push(obj),
      () =>
        harden({
          method() {
            return 'hello';
          },
        }),
    );
    t.deepEqual(objs, [], 'expected no messages');
    const bs = getBootstrap();
    const ps = [];
    ps.push(t.rejects(E.G(bs).prop, Error, 'rejected get after disconnect'));
    ps.push(
      t.rejects(E(bs).method(), Error, 'rejected method after disconnect'),
    );
    t.deepEqual(
      objs,
      [{ type: 'CTP_BOOTSTRAP', questionID: 1 }],
      'expected bootstrap messages',
    );
    ps.push(t.rejects(bs, Error, 'rejected after disconnect'));
    const abortMsg = { type: 'CTP_ABORT', exception: Error('disconnect') };
    abort(abortMsg.exception);
    await t.rejects(getBootstrap(), Error, 'rejected disconnected bootstrap');
    t.deepEqual(
      objs,
      [{ type: 'CTP_BOOTSTRAP', questionID: 1 }, abortMsg],
      'expected disconnect messages',
    );
    await ps;
  } catch (e) {
    t.isNot(e, e, 'unexpected exception');
  } finally {
    t.end();
  }
});
