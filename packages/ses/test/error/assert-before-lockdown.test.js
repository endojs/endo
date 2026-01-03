/**
 * Tests that assert errors are NOT redacted before lockdown.
 *
 * Before lockdown, the assert shim installs an unredacted assert on
 * globalThis. This allows developers to see full error details during
 * the startup phase before lockdown is called.
 *
 * After lockdown (with default safe errorTaming), assert becomes redacting.
 */

// Import only the shims, but do NOT call lockdown yet
import '../../index.js';

import test from 'ava';

// Capture the pre-lockdown Fail function
const { Fail: preLockdownFail, quote: q, bare: b } = assert;

test('assert errors are not redacted before lockdown', t => {
  // Before lockdown, unquoted substitution values should appear directly
  // in the error message, not be redacted to type placeholders.
  t.throws(
    () =>
      preLockdownFail`Incorrect luggage combination: ${12345}, consider ${q('abc123')} or ${b('invalid')}`,
    {
      message:
        /Incorrect luggage combination: 12345, consider "abc123" or invalid/,
    },
  );
});

test('assert errors are redacted after lockdown with default errorTaming', t => {
  // Call lockdown with default (safe) error taming
  lockdown();

  // Capture the post-lockdown Fail function
  const { Fail: postLockdownFail } = assert;

  // After lockdown with default settings, unquoted substitution values
  // should be redacted to type placeholders like "(a number)".
  t.throws(
    () =>
      postLockdownFail`Incorrect luggage combination: ${12345}, consider ${q('abc123')} or ${b('invalid')}`,
    {
      message:
        /Incorrect luggage combination: \(a number\), consider "abc123" or invalid/,
    },
  );
});
