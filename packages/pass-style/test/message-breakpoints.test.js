import './_prepare-breakpoints.js';
import test from '@endo/ses-ava/prepare-endo.js';

import { makeMessageBreakpointTester } from '@endo/eventual-send/utils.js';
import { E } from '@endo/eventual-send';

import { Far } from '../src/make-far.js';

const { values } = Object;

// Example from test-deep-send.js in @endo/eventual-send

const carol = Far('Carol', {
  bar: () => console.log('Wut?'),
});

const bob = Far('Bob', {
  foo: carolP => E(carolP).bar(),
});

const alice = Far('Alice', {
  test: () => E(bob).foo(carol),
});

const onSend = makeMessageBreakpointTester('ENDO_SEND_BREAKPOINTS');

test('message breakpoint tester', t => {
  t.is(onSend.shouldBreakpoint(alice, 'test'), false);
  t.is(onSend.shouldBreakpoint(bob, 'test'), false);
  t.is(onSend.shouldBreakpoint(bob, 'foo'), true);
  t.is(onSend.shouldBreakpoint(alice, 'bar'), true);

  t.is(onSend.shouldBreakpoint(bob, 'zap'), false);
  t.is(onSend.shouldBreakpoint(alice, 'zap'), false);
  t.is(onSend.shouldBreakpoint(carol, 'zap'), false);
  t.is(onSend.shouldBreakpoint(alice, 'zap'), false);
  t.is(onSend.shouldBreakpoint(bob, 'zap'), false);
  t.is(onSend.shouldBreakpoint(bob, 'zap'), false);
  t.is(onSend.shouldBreakpoint(bob, 'zap'), true);
  t.is(onSend.shouldBreakpoint(bob, 'zap'), true);

  t.is(onSend.shouldBreakpoint(bob, 'zip'), false);
  t.is(onSend.shouldBreakpoint(alice, 'zip'), false);
  t.is(onSend.shouldBreakpoint(carol, 'zip'), false);
  t.is(onSend.shouldBreakpoint(alice, 'zip'), true);
  t.is(onSend.shouldBreakpoint(bob, 'zip'), true);

  onSend.setBreakpoints(); // Should refresh the counts

  t.is(onSend.shouldBreakpoint(bob, 'zip'), false);
  t.is(onSend.shouldBreakpoint(alice, 'zip'), false);
  t.is(onSend.shouldBreakpoint(carol, 'zip'), false);
  t.is(onSend.shouldBreakpoint(alice, 'zip'), true);
  t.is(onSend.shouldBreakpoint(bob, 'zip'), true);

  // Approx what you would do interactively
  const bps = onSend.getBreakpoints();
  t.is(
    values(bps).some(meths => '*' in meths),
    false,
  );
  bps.Bob['*'] = 3;
  bps['*']['*'] = 1;
  onSend.setBreakpoints();
  const bps2 = onSend.getBreakpoints();
  t.is(
    values(bps2).every(meths => '*' in meths),
    true,
  );

  t.is(onSend.shouldBreakpoint(alice, 'test'), false);
  t.is(onSend.shouldBreakpoint(bob, 'test'), false);
  t.is(onSend.shouldBreakpoint(alice, 'test'), true);
  t.is(onSend.shouldBreakpoint(bob, 'test'), false);
  t.is(onSend.shouldBreakpoint(alice, 'test'), true);
  t.is(onSend.shouldBreakpoint(bob, 'test'), false);
  t.is(onSend.shouldBreakpoint(alice, 'test'), true);
  t.is(onSend.shouldBreakpoint(bob, 'test'), true);

  onSend.setBreakpoints();

  t.is(onSend.shouldBreakpoint(alice, 'test'), false);
  t.is(onSend.shouldBreakpoint(bob, 'test'), false);
  t.is(onSend.shouldBreakpoint(alice, 'test'), true);
});

test('message breakpoint validation', t => {
  t.throws(() => onSend.setBreakpoints([]), {
    message:
      'Expected "ENDO_SEND_BREAKPOINTS" option to be a JSON breakpoints record',
  });
  t.throws(() => onSend.setBreakpoints({ 'Alleged: Bob': {} }), {
    message: 'Just use simple tag "Bob" rather than "Alleged: Bob"',
  });
  t.throws(() => onSend.setBreakpoints({ Bob: 3 }), {
    message:
      'Expected "ENDO_SEND_BREAKPOINTS" option\'s "Bob" to be a JSON methods breakpoints record',
  });
  t.throws(() => onSend.setBreakpoints({ Bob: { foo: 3n } }), {
    message:
      'Expected "ENDO_SEND_BREAKPOINTS" option\'s "Bob"."foo" to be "*" or a non-negative integer',
  });
});
