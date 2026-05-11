// @ts-nocheck
/* global globalThis */

// Because this package `@endo/panic` is below both `ses` and `@endo/ses-ava` in
// package layering, its diagnostic output cannot benefit from either
// ses-ava nor the ses `console`.
// To cope, `test/panic.test.js` in `@endo/ses-ava` is a copy of this test
// without this layering cost. Please co-maintain these two files.
import test from 'ava';

import { PanicEndowmentSymbol, panic, lastResortError } from '../index.js';

// The case where it does correctly exit immediately is hard to test with
// ava tests, so the following tests are indirect.

const badError = Error('Should exit');

test('panic first resort', async t => {
  t.is(PanicEndowmentSymbol, Symbol.for('@endo panic'));

  let firstResortHappened = false;
  let catchHappened = false;
  globalThis[PanicEndowmentSymbol] = err => {
    firstResortHappened = true;
    // The fact that this resumes execution violates `panic`'s assumption about
    // this endowment. But we take that to be a violation of the spec for this
    // endowment, not a violation of the limited correctness of the
    // `panic` ponyfill.
    throw badError;
  };
  try {
    panic(Error('testing panic first resort'));
  } catch (err) {
    catchHappened = true;
    t.is(err, badError);
  }
  t.true(firstResortHappened);
  t.true(catchHappened);
});

test('panic using process.abort', t => {
  delete globalThis[PanicEndowmentSymbol];

  let secondResortHappened = false;
  let catchHappened = false;
  globalThis.process ||= {};
  globalThis.process.abort = () => {
    secondResortHappened = true;
    throw badError;
  };
  try {
    panic(Error('testing panic using process.abort'));
  } catch (err) {
    catchHappened = true;
    t.is(err, badError);
  }
  t.true(secondResortHappened);
  t.true(catchHappened);
});

test('panic using globalThis.panic (XS fallback)', t => {
  delete globalThis[PanicEndowmentSymbol];
  const savedAbort = globalThis.process?.abort;
  delete globalThis.process.abort;

  let xsPanicCalled = false;
  globalThis.panic = err => {
    xsPanicCalled = true;
    throw badError;
  };
  let catchHappened = false;
  try {
    panic(Error('testing panic using globalThis.panic'));
  } catch (err) {
    catchHappened = true;
    t.is(err, badError);
  }
  t.true(xsPanicCalled);
  t.true(catchHappened);

  // Restore
  delete globalThis.panic;
  if (savedAbort) {
    globalThis.process.abort = savedAbort;
  }
});

test('panic last resort', t => {
  delete globalThis[PanicEndowmentSymbol];
  delete globalThis.process.abort;
  delete globalThis.panic;

  let catchHappened = false;
  try {
    panic(Error('testing panic using last resort'));
  } catch (err) {
    catchHappened = true;
    t.true(Object.hasOwn(err, PanicEndowmentSymbol));
    t.is(err, lastResortError);
  }
  t.true(catchHappened);
});

test('panic without console.error', t => {
  delete globalThis[PanicEndowmentSymbol];
  delete globalThis.process.abort;
  delete globalThis.panic;

  const savedConsole = globalThis.console;
  globalThis.console = undefined;

  let catchHappened = false;
  try {
    panic(Error('testing panic without console'));
  } catch (err) {
    catchHappened = true;
    t.is(err, lastResortError);
  }
  t.true(catchHappened);

  // Restore
  globalThis.console = savedConsole;
});
