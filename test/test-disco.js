/* global harden */

import '@agoric/install-ses';
import test from 'ava';
import { E, makeCapTP } from '../lib/captp';

test('try disconnecting captp', async t => {
  const objs = [];
  const rejected = [];
  const { getBootstrap, abort } = makeCapTP(
    'us',
    obj => objs.push(obj),
    () =>
      harden({
        method() {
          return 'hello';
        },
      }),
    {
      onReject(e) {
        rejected.push(e);
      },
    },
  );
  t.deepEqual(objs, [], 'expected no messages');
  const bs = getBootstrap();
  const ps = [];
  ps.push(
    t.throwsAsync(
      E.G(bs).prop,
      { instanceOf: Error },
      'rejected get after disconnect',
    ),
  );
  ps.push(
    t.throwsAsync(
      E(bs).method(),
      { instanceOf: Error },
      'rejected method after disconnect',
    ),
  );
  t.deepEqual(
    objs,
    [{ type: 'CTP_BOOTSTRAP', questionID: 1 }],
    'expected bootstrap messages',
  );
  ps.push(
    t.throwsAsync(bs, { instanceOf: Error }, 'rejected after disconnect'),
  );
  const abortMsg = { type: 'CTP_ABORT', exception: Error('disconnect') };
  abort(abortMsg.exception);
  await t.throwsAsync(
    getBootstrap(),
    { instanceOf: Error },
    'rejected disconnected bootstrap',
  );
  t.deepEqual(
    objs,
    [{ type: 'CTP_BOOTSTRAP', questionID: 1 }, abortMsg],
    'expected disconnect messages',
  );
  await ps;
  t.deepEqual(rejected, [abortMsg.exception], 'exactly one disconnect error');
});
