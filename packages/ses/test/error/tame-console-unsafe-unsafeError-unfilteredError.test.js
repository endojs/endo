import test from 'ava';
import '../../index.js';
import { getPrototypeOf } from '../../src/commons.js';

const originalConsole = console;

lockdown({
  consoleTaming: 'unsafe',
  errorTaming: 'unsafe',
  stackFiltering: 'verbose',
  overrideTaming: 'min',
});

// Grab `details` only after lockdown
const { details: X, quote: q, note: annotateError } = assert;

test('ava message disclosure blabs', t => {
  t.throws(() => assert.fail(X`a secret ${666} and a public ${q(777)}`), {
    message: /a secret 666 and a public 777/,
  });
});

test('console', t => {
  t.plan(3);

  t.is(console, originalConsole);

  harden(getPrototypeOf(console));
  harden(console);
  const c1 = new Compartment({
    globals: { console },
    __options__: true,
  });
  t.is(console, c1.evaluate('(console)'));

  const fakeConsole = { log: console.log };
  harden(fakeConsole);
  const c2 = new Compartment({
    globals: { console: fakeConsole },
    __options__: true,
  });
  t.is(console.log, c2.evaluate('(console.log)'));
});

// `assert-log.test.js` has the interesting automated console tests.
// The following console tests are only a sanity check for eyeballing the
// output. See the descriptions in `tame-console.test.js` for what you should
// expect to see for each test case in the default safe-safe taming.

// This unsafe-console variation shows that logging to the unenhanced system
// console still works, but without the annotation info or the enhanced
// error messages with the original details substitution values.

// The unsafe-error taming leaves the system provided stack traces accessible
// from the error objects themselves. The unenhanced console uses that stack
// trace information the same way it normally does outside of ses.

test('assert - unsafe', t => {
  try {
    const obj = {};
    const fooErr = SyntaxError('foo');
    assert.fail(X`caused by ${fooErr},${obj}`);
  } catch (barErr) {
    console.error('bar happens', barErr);
  }
  t.pass();
});

test('assert - unlogged unsafe', t => {
  t.throws(() => {
    const obj = {};
    const fooErr = SyntaxError('foo');
    assert.fail(X`caused by ${fooErr},${obj}`);
  });
});

test('tameConsole - unsafe', t => {
  const obj = {};
  const faaErr = TypeError('faa');
  const borErr = ReferenceError('bor');
  annotateError(borErr, X`caused by ${faaErr},${obj}`);
  console.log('bor happens', borErr);
  t.pass();
});

test('tameConsole - unlogged unsafe', t => {
  const obj = {};
  const ufaaErr = TypeError('ufaa');
  const uborErr = ReferenceError('ubor');
  annotateError(uborErr, X`caused by ${ufaaErr},${obj}`);
  t.pass();
});
