import test from 'tape';
import '../../ses.js';
import { assert } from '../../src/error/assert.js';

const { details: d } = assert;

const { getPrototypeOf } = Object;

const originalConsole = console;

lockdown();

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
    assert.fail(d`caused by ${fooErr},${obj}`);
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
    assert.fail(d`caused by ${fooErr},${obj}`);
  });
  t.end();
});

// TODO Revise stale comment
// This shows the cause-tracking. We instruct the console to
// silently remember the cause as explaining the cause of barErr.
// Once barErr itself is actually logged, we give it a unique tag (URIError#1),
// log the error with stack trace in a separate log message beginning
// "(URIError#1) ERR:", and then emit a log message for each of its causes
// beginning "(URIError#1) CAUSE:".
test('tameConsole - safe', t => {
  const obj = {};
  const fooErr = new SyntaxError('foo');
  const barErr = new URIError('bar');
  assert.note(barErr, d`caused by ${fooErr},${obj}`);
  console.log('bar happens', barErr);
  t.end();
});

// TODO Revise stale comment
// This shows that a message remembered as associated with an error (ubarErr)
// is never seen if the error it allegedly caused is never actually logged.
test('tameConsole - unlogged safe', t => {
  const obj = {};
  const ufooErr = new SyntaxError('ufoo');
  const ubarErr = new URIError('ubar');
  assert.note(ubarErr, d`caused by ${ufooErr},${obj}`);
  t.end();
});
