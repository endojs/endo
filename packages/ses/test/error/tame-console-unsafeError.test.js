import test from 'ava';
import '../../index.js';
import { getPrototypeOf } from '../../src/commons.js';

const originalConsole = console;

lockdown({ errorTaming: 'unsafe' });

// Grab `details` only after lockdown
const { details: X, quote: q, note: annotateError } = assert;

test('ava message disclosure blabs', t => {
  t.throws(() => assert.fail(X`a secret ${666} and a public ${q(777)}`), {
    message: /a secret 666 and a public 777/,
  });
});

test('console', t => {
  t.plan(3);

  t.not(console, originalConsole);

  harden(getPrototypeOf(console));
  harden(console);
  const c1 = new Compartment({ console });
  t.is(console, c1.evaluate('(console)'));

  const fakeConsole = { log: console.log };
  harden(fakeConsole);
  const c2 = new Compartment({ console: fakeConsole });
  t.is(console.log, c2.evaluate('(console.log)'));
});

// `test-assert-log.js` has the interesting automated console tests.
// The following console tests are only a sanity check for eyeballing the
// output. See the descriptions in `test-tame-console.js` for what you should
// expect to see for each test case in the default safe-safe taming.

// The unsafe-error taming leaves the stack trace unprotected on error objects.
// Combined with the safe-console taming, the enhanced console obtains the
// stack traces available from the errors, rather than using the internal
// bookkeeping for hidden stacks.

test('assert - safe', t => {
  try {
    const obj = {};
    const fooErr = SyntaxError('foo');
    assert.fail(X`caused by ${fooErr},${obj}`);
  } catch (barErr) {
    console.error('bar happens', barErr);
  }
  t.pass();
});

test('assert - unlogged safe', t => {
  t.throws(() => {
    const obj = {};
    const fooErr = SyntaxError('foo');
    assert.fail(X`caused by ${fooErr},${obj}`);
  });
});

test('tameConsole - safe', t => {
  const obj = {};
  const fooErr = SyntaxError('foo');
  const barErr = URIError('bar');
  annotateError(barErr, X`caused by ${fooErr},${obj}`);
  console.log('bar happens', barErr);
  t.pass();
});

test('tameConsole - unlogged safe', t => {
  const obj = {};
  const ufooErr = SyntaxError('ufoo');
  const ubarErr = URIError('ubar');
  annotateError(ubarErr, X`caused by ${ufooErr},${obj}`);
  t.pass();
});
