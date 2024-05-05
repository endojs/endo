import test from '@endo/ses-ava/prepare-endo.js';

import { makeError } from '@endo/errors';
import { Far, isPassable } from '@endo/pass-style';
import { M } from '@endo/patterns';
import { makeExo } from '../src/exo-makers.js';

const { defineProperty } = Object;

const thrower = makeExo(
  'Thrower',
  M.interface('Thrower', {
    throw: M.call(M.raw()).returns(M.any()),
    reject: M.callWhen(M.raw()).returns(M.any()),
  }),
  {
    throw(val) {
      throw val;
    },
    reject(val) {
      throw val;
    },
  },
);

test('exo only throwables', async t => {
  const e = makeError('test error', undefined, {
    sanitize: false,
  });

  // Remotables cannot be in passable errors or throwables
  defineProperty(e, 'foo', { value: Far('Foo', {}) });

  let caught;
  try {
    thrower.throw(e);
  } catch (thrown) {
    caught = thrown;
  }
  t.false(isPassable(e));
  t.true(isPassable(caught));
  t.log('throw caught', caught);

  try {
    await thrower.reject(e);
  } catch (thrown) {
    caught = thrown;
  }
  t.true(isPassable(caught));
  t.log('reject caught', caught);
});
