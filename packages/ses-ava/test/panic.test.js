/* global globalThis */

// `@endo/panic` is below `ses` and `@endo/ses-ava` in package layering,
// so its test file `test/index.test.js` had to use plain `ava` and the
// platform's built-in `console`.
// This is a copy of that test so it can use `ses-ava` and the ses `console`.
// Please co-maintain these two files.
import test from '../prepare-endo.js';

// eslint-disable-next-line import/order
import { PanicEndowmentSymbol, panic, lastResortError } from '@endo/panic';

// The case where it does correctly exit immediately is hard to test with
// ava tests, so the following tests are indirect.

const badError = Error('Should exit');

test('panic first resort', async t => {
  // @ts-expect-error XXX unique symbol
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
  // @ts-expect-error mock
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
  // @ts-expect-error 'abort' is not optional on 'process'
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
  // @ts-expect-error 'abort' is not optional on 'process'
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
  // @ts-expect-error 'abort' is not optional on 'process'
  delete globalThis.process.abort;
  delete globalThis.panic;

  const savedConsole = globalThis.console;
  // @ts-expect-error mock
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
