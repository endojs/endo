import 'ses';
import './lockdown.js';
import rawTest from 'ava';
import { wrapTest } from '@endo/ses-ava';
import { isPromise, makePromiseKit } from '../index.js';

const test = wrapTest(rawTest);

test('makePromiseKit', async t => {
  const { resolve, promise } = makePromiseKit();
  Promise.resolve().then(resolve);
  await promise;
  t.pass();
});

test('isPromise', t => {
  t.assert(isPromise(Promise.resolve()));
});
