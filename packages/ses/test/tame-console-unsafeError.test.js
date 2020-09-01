import { assert, details, logToConsole, asLogRecord } from '@agoric/assert';
import test from 'tape';
import '../ses.js';

const { getPrototypeOf } = Object;

const originalConsole = console;

lockdown({ errorTaming: 'unsafe' });

test('console', t => {
  t.plan(3);

  t.notEqual(console, originalConsole);

  harden(getPrototypeOf(console));
  harden(console);
  const c1 = new Compartment({ console });
  t.equal(console, c1.evaluate('(console)'));

  const fakeConsole = { log: console.log };
  harden(fakeConsole);
  const c2 = new Compartment({ console: fakeConsole });
  t.equal(console.log, c2.evaluate('(console.log)'));
});

// The @agoric/console package has the automated console tests.
// The following console tests are only a sanity check for eyeballing the
// output. See the following descriptions for what you should expect to
// see for each test case.

// The assert failure both throws an error, and silently remembers
// a pending console as the alleged cause of the thrown error.
// The thrown error message has placeholders for the data in the details
// template literal, like "(a SyntaxError)" and "(an object)".
// The corresponding pending console message remembers the actual values.
// When the thrown error is actually logged, the remembered causes are also
// logged, as are any errors embedded in them, and the causes of those errors.
test('assert - safe', t => {
  try {
    const obj = {};
    const fooErr = new SyntaxError('foo');
    assert.fail(details`${fooErr},${obj} cause failure`);
  } catch (barErr) {
    console.error('bar happens', barErr);
  }
  t.end();
});

// The assert failure both throws and error and silently remembers
// the data from the details as the alleged cause. However, if the thrown
// error is never logged, then neither is the associated cause.
test('assert - unlogged safe', t => {
  t.throws(() => {
    const obj = {};
    const fooErr = new SyntaxError('foo');
    assert.fail(details`${fooErr},${obj} cause failure`);
  });
  t.end();
});

// See the descriptions in tame-console-unit.test.js for what you
// should expect to see for each of the following test cases.

test('tameConsole - safe', t => {
  const obj = {};
  const fooErr = new SyntaxError('foo');
  const barErr = new URIError('bar');
  logToConsole(
    console,
    asLogRecord({
      level: 'log',
      cause: ['foo,obj cause bar', fooErr, obj],
      error: barErr,
    }),
  );
  console.log('bar happens', barErr);
  t.end();
});

test('tameConsole - unlogged safe', t => {
  const obj = {};
  const ufooErr = new SyntaxError('ufoo');
  const ubarErr = new URIError('ubar');
  logToConsole(
    console,
    asLogRecord({
      level: 'log',
      cause: ['ufoo,obj cause ubar', ufooErr, obj],
      error: ubarErr,
    }),
  );
  t.end();
});
