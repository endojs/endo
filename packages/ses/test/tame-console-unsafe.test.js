import { assert, details, logToConsole, encodeCause } from '@agoric/assert';
import test from 'tape';
import '../ses.js';

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
    assert.fail(details`${fooErr},${obj} cause failure`);
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
    assert.fail(details`${fooErr},${obj} cause failure`);
  });
  t.end();
});

// See the descriptions in tame-console-unit.test.js for what you
// should expect to see for each of the following test cases.

test('tameConsole - unsafe', t => {
  const obj = {};
  const faaErr = new TypeError('faa');
  const borErr = new ReferenceError('bor');
  logToConsole(
    console,
    encodeCause({
      level: 'log',
      cause: ['faa,obj cause bor', faaErr, obj],
      error: borErr,
    }),
  );
  console.log('bor happens', borErr);
  t.end();
});

test('tameConsole - unlogged unsafe', t => {
  const obj = {};
  const ufaaErr = new TypeError('ufaa');
  const uborErr = new ReferenceError('ubor');
  logToConsole(
    console,
    encodeCause({
      level: 'log',
      cause: ['ufaa,obj cause ubor', ufaaErr, obj],
      error: uborErr,
    }),
  );
  t.end();
});
