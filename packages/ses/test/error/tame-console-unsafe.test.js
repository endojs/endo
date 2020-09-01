import test from 'tape';
import '../../ses.js';
import { assert } from '../../src/error/assert.js';

const { details: d } = assert;

const { getPrototypeOf } = Object;

const originalConsole = console;

lockdown({ consoleTaming: 'unsafe' });

test('console', t => {
  t.plan(3);

  t.equal(console, originalConsole);

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

// The assert failure both throws an error, and tries to silently
// remembers a pending console as the alleged cause of the thrown error.
// It does so assuming the console is the safe causality-tracking console.
// However, if assert outputs to the normal system console instead, it fails
// softly but noisily. These causality tracking messages are immediately logged
// in the encoding defined by `encodeCause`, rather than being associated with
// the thrown error.
test('assert - unsafe', t => {
  try {
    const obj = {};
    const fooErr = new SyntaxError('foo');
    assert.fail(d`caused by ${fooErr},${obj}`);
  } catch (barErr) {
    console.error('bar happens', barErr);
  }
  t.end();
});

// As above, the causality tracking message is output immediately.
// In this case, even though the thrown error itself is never
// explicitly logged.
test('assert - unlogged unsafe', t => {
  t.throws(() => {
    const obj = {};
    const fooErr = new SyntaxError('foo');
    assert.fail(d`caused by ${fooErr},${obj}`);
  });
  t.end();
});

// TODO Revise stale comment
// This shows that code assuming such a cause tracking console fails soft if
// interacting with a normal system console. No log messages are remembered for
// later display. Rather, each is immediately output. When a logged message has
// multiple error arguments, on node at the time of this writing, their stack
// traces are shown continuously with no break between them. Without naming the
// errors uniquely, we cannot reliably tell from this log when the same error
// reappears, and so cannot reliably recover the causality tracking.
test('tameConsole - unsafe', t => {
  const obj = {};
  const faaErr = new TypeError('faa');
  const borErr = new ReferenceError('bor');
  assert.note(borErr, d`caused by ${faaErr},${obj}`);
  console.log('bor happens', borErr);
  t.end();
});

// TODO Revise stale comment
// Code assuming a cause tracking console again fails soft, but noisily,
// if interacting with a normal system console. Each of the cause tracking
// messages is immediately emitted rather than being silently remembered.
test('tameConsole - unlogged unsafe', t => {
  const obj = {};
  const ufaaErr = new TypeError('ufaa');
  const uborErr = new ReferenceError('ubor');
  assert.note(uborErr, d`caused by ${ufaaErr},${obj}`);
  t.end();
});
