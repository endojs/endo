import { logToConsole, encodeCause } from '@agoric/assert';
import tap from 'tap';
import { tameConsole } from '../src/tame-console.js';

const { test } = tap;

const { console: safeConsole } = tameConsole();
const { console: unsafeConsole } = tameConsole('unsafe');

// The @agoric/console package has the automated console tests.
// The following console tests are only a sanity check for eyeballing the
// output. See the descriptions below for what you should expect to see for
// each test case.

// This shows the cause-tracking. We instruct the console to
// silently remember the cause as explaining the cause of barErr.
// Once barErr itself is actually logged, we give it a unique tag (URIError#1),
// log the error with stack trace in a separate log message beginning
// "(URIError#1) ERR:", and then emit a log message for each of its causes
// beginning "(URIError#1) CAUSE:".
test('tameConsole unit - safe', t => {
  const obj = {};
  const fooErr = new SyntaxError('foo');
  const barErr = new URIError('bar');
  logToConsole(
    safeConsole,
    encodeCause({
      level: 'log',
      cause: ['foo,obj cause bar', fooErr, obj],
      error: barErr,
    }),
  );
  safeConsole.log('bar happens', barErr);
  t.end();
});

// This shows that code assuming such a cause tracking console fails soft if
// interacting with a normal system console. No log messages are remembered for
// later display. Rather, each is immediately output. When a logged message has
// multiple error arguments, on node at the time of this writing, their stack
// traces are shown continuously with no break between them. Without naming the
// errors uniquely, we cannot reliably tell from this log when the same error
// reappears, and so cannot reliably recover the causality tracking.
test('tameConsole unit - unsafe', t => {
  const obj = {};
  const faaErr = new TypeError('faa');
  const borErr = new ReferenceError('bor');
  logToConsole(
    unsafeConsole,
    encodeCause({
      level: 'log',
      cause: ['faa,obj cause bor', faaErr, obj],
      error: borErr,
    }),
  );
  unsafeConsole.log('bor happens', borErr);
  t.end();
});

// This shows that a message remembered as associated with an error (ubarErr)
// is never seen if the error it allegedly caused is never actually logged.
test('tameConsole unit - unlogged safe', t => {
  const obj = {};
  const ufooErr = new SyntaxError('ufoo');
  const ubarErr = new URIError('ubar');
  logToConsole(
    safeConsole,
    encodeCause({
      level: 'log',
      cause: ['ufoo,obj cause ubar', ufooErr, obj],
      error: ubarErr,
    }),
  );
  t.end();
});

// Code assuming a cause tracking console again fails soft, but noisily,
// if interacting with a normal system console. Each of the cause tracking
// messages is immediately emitted rather than being silently remembered.
test('tameConsole unit - unlogged unsafe', t => {
  const obj = {};
  const ufaaErr = new TypeError('ufaa');
  const uborErr = new ReferenceError('ubor');
  logToConsole(
    unsafeConsole,
    encodeCause({
      level: 'log',
      cause: ['ufaa,obj cause ubor', ufaaErr, obj],
      error: uborErr,
    }),
  );
  t.end();
});
