import '@endo/lockdown/commit-debug.js';
import test from 'ava';
import assert from 'node:assert';
import process from 'node:process';

import { makeMessageBreakpointTester } from '../src/message-breakpoints.js';

/**
 * @param {string} envVarName
 * @returns {import('../src/message-breakpoints.js').MessageBreakpointTester}
 */
const requireTester = envVarName => {
  const tester = makeMessageBreakpointTester(envVarName);
  assert(tester, `tester for ${envVarName} must be defined`);
  return tester;
};

test('returns undefined when env var is not set', t => {
  const tester = makeMessageBreakpointTester('NONEXISTENT_BP_OPTION');
  t.is(tester, undefined);
});

test('returns tester when env var has valid JSON', t => {
  process.env.TEST_BP_VALID = JSON.stringify({ MyClass: { myMethod: '*' } });
  t.teardown(() => {
    delete process.env.TEST_BP_VALID;
  });

  const tester = requireTester('TEST_BP_VALID');
  t.truthy(tester);
  t.is(typeof tester.getBreakpoints, 'function');
  t.is(typeof tester.setBreakpoints, 'function');
  t.is(typeof tester.shouldBreakpoint, 'function');
});

test('getBreakpoints returns the parsed breakpoints', t => {
  const bp = { Foo: { bar: 0 } };
  process.env.TEST_BP_GET = JSON.stringify(bp);
  t.teardown(() => {
    delete process.env.TEST_BP_GET;
  });

  const tester = requireTester('TEST_BP_GET');
  t.deepEqual(tester.getBreakpoints(), bp);
});

test('shouldBreakpoint matches exact tag and method', t => {
  process.env.TEST_BP_EXACT = JSON.stringify({ Foo: { bar: '*' } });
  t.teardown(() => {
    delete process.env.TEST_BP_EXACT;
  });

  const tester = requireTester('TEST_BP_EXACT');

  const recipient = { [Symbol.toStringTag]: 'Foo' };
  t.true(tester.shouldBreakpoint(recipient, 'bar'));
  t.false(tester.shouldBreakpoint(recipient, 'baz'));
});

test('shouldBreakpoint strips Alleged: prefix from tag', t => {
  process.env.TEST_BP_ALLEGED = JSON.stringify({ Issuer: { deposit: '*' } });
  t.teardown(() => {
    delete process.env.TEST_BP_ALLEGED;
  });

  const tester = requireTester('TEST_BP_ALLEGED');

  const recipient = { [Symbol.toStringTag]: 'Alleged: Issuer' };
  t.true(tester.shouldBreakpoint(recipient, 'deposit'));
});

test('shouldBreakpoint strips DebugName: prefix from tag', t => {
  process.env.TEST_BP_DEBUG = JSON.stringify({ Purse: { withdraw: '*' } });
  t.teardown(() => {
    delete process.env.TEST_BP_DEBUG;
  });

  const tester = requireTester('TEST_BP_DEBUG');

  const recipient = { [Symbol.toStringTag]: 'DebugName: Purse' };
  t.true(tester.shouldBreakpoint(recipient, 'withdraw'));
});

test('shouldBreakpoint wildcard tag matches any recipient', t => {
  process.env.TEST_BP_WILD_TAG = JSON.stringify({ '*': { doStuff: '*' } });
  t.teardown(() => {
    delete process.env.TEST_BP_WILD_TAG;
  });

  const tester = requireTester('TEST_BP_WILD_TAG');

  const recipient = { [Symbol.toStringTag]: 'Anything' };
  t.true(tester.shouldBreakpoint(recipient, 'doStuff'));
});

test('shouldBreakpoint wildcard method matches any method', t => {
  process.env.TEST_BP_WILD_METHOD = JSON.stringify({ Foo: { '*': '*' } });
  t.teardown(() => {
    delete process.env.TEST_BP_WILD_METHOD;
  });

  const tester = requireTester('TEST_BP_WILD_METHOD');

  const recipient = { [Symbol.toStringTag]: 'Foo' };
  t.true(tester.shouldBreakpoint(recipient, 'anyMethod'));
  t.true(tester.shouldBreakpoint(recipient, 'anotherMethod'));
});

test('shouldBreakpoint countdown decrements then fires', t => {
  // Skip 2 occurrences, then breakpoint on the third
  process.env.TEST_BP_COUNT = JSON.stringify({ Foo: { bar: 2 } });
  t.teardown(() => {
    delete process.env.TEST_BP_COUNT;
  });

  const tester = requireTester('TEST_BP_COUNT');

  const recipient = { [Symbol.toStringTag]: 'Foo' };
  t.false(tester.shouldBreakpoint(recipient, 'bar')); // 2 → 1
  t.false(tester.shouldBreakpoint(recipient, 'bar')); // 1 → 0
  t.true(tester.shouldBreakpoint(recipient, 'bar')); // 0 → fire
  t.true(tester.shouldBreakpoint(recipient, 'bar')); // stays at 0
});

test('shouldBreakpoint returns false for undefined methodName', t => {
  process.env.TEST_BP_UNDEF = JSON.stringify({ Foo: { bar: '*' } });
  t.teardown(() => {
    delete process.env.TEST_BP_UNDEF;
  });

  const tester = requireTester('TEST_BP_UNDEF');

  const recipient = { [Symbol.toStringTag]: 'Foo' };
  t.false(tester.shouldBreakpoint(recipient, undefined));
});

test('shouldBreakpoint returns false for unmatched method', t => {
  process.env.TEST_BP_NOMATCH = JSON.stringify({ Foo: { bar: '*' } });
  t.teardown(() => {
    delete process.env.TEST_BP_NOMATCH;
  });

  const tester = requireTester('TEST_BP_NOMATCH');

  const recipient = { [Symbol.toStringTag]: 'Foo' };
  t.false(tester.shouldBreakpoint(recipient, 'notBar'));
});

test('setBreakpoints updates breakpoints', t => {
  process.env.TEST_BP_SET = JSON.stringify({ A: { x: '*' } });
  t.teardown(() => {
    delete process.env.TEST_BP_SET;
  });

  const tester = requireTester('TEST_BP_SET');

  const recipientA = { [Symbol.toStringTag]: 'A' };
  const recipientB = { [Symbol.toStringTag]: 'B' };

  t.true(tester.shouldBreakpoint(recipientA, 'x'));
  t.false(tester.shouldBreakpoint(recipientB, 'y'));

  // Update breakpoints
  tester.setBreakpoints({ B: { y: '*' } });

  t.false(tester.shouldBreakpoint(recipientA, 'x'));
  t.true(tester.shouldBreakpoint(recipientB, 'y'));
});

test('shouldBreakpoint with countdown 0 fires immediately', t => {
  process.env.TEST_BP_ZERO = JSON.stringify({ Foo: { go: 0 } });
  t.teardown(() => {
    delete process.env.TEST_BP_ZERO;
  });

  const tester = requireTester('TEST_BP_ZERO');

  const recipient = { [Symbol.toStringTag]: 'Foo' };
  t.true(tester.shouldBreakpoint(recipient, 'go'));
});

test('shouldBreakpoint falls back to wildcard tag when specific tag not found', t => {
  process.env.TEST_BP_FALLBACK = JSON.stringify({
    SpecificTag: { method: 0 },
    '*': { method: '*' },
  });
  t.teardown(() => {
    delete process.env.TEST_BP_FALLBACK;
  });

  const tester = requireTester('TEST_BP_FALLBACK');

  const unknownRecipient = { [Symbol.toStringTag]: 'Unknown' };
  // Should fall back to '*' tag
  t.true(tester.shouldBreakpoint(unknownRecipient, 'method'));
});
