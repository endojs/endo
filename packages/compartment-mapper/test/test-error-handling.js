// import "./ses-lockdown.js";
import 'ses';
import test from 'ava';

import { scaffold, sanitizePaths } from './scaffold.js';

const assertFixture = t => {
  t.fail('Expected an error.');
};
const fixtureAssertionCount = 2;
const fixtureUrl = path => new URL(path, import.meta.url).toString();

const stackTools = {
  getThrownFrom(stack) {
    const arr = stack.split('\n');
    return arr[1];
  },
};
const onError = (t, { error, title }) => {
  const from = stackTools.getThrownFrom(error.stack);
  // Assert that errors for cjs get postponed to execution
  if (title.match(/cjs/i)) {
    if (title.match(/cjs.*archive/i)) {
      t.regex(from, /at .*execute/);
    } else {
      t.regex(from, /at .*importHook/);
    }
  } else if (title.match(/esm|both/i)) {
    t.regex(from, /at .*load/);
  } else {
    t.fail();
  }
  // The 'fixtures-error-handling / both' test intermittently captures 1 or 2
  // underlying failures due to timing.
  if (!title.match(/both/i)) {
    t.snapshot(sanitizePaths(error.stack, true));
  } else {
    // balance the budget
    t.assert(true);
  }
};

scaffold(
  'fixtures-error-handling / esm',
  test,
  fixtureUrl('fixtures-error-handling/node_modules/esm/main.js'),
  assertFixture,
  fixtureAssertionCount,
  {
    onError,
    shouldFailBeforeArchiveOperations: true,
  },
);

scaffold(
  'fixtures-error-handling / cjs',
  test,
  fixtureUrl('fixtures-error-handling/node_modules/cjs/main.js'),
  assertFixture,
  fixtureAssertionCount,
  {
    onError,
    shouldFailBeforeArchiveOperations: false,
  },
);

scaffold(
  'fixtures-error-handling / both',
  test,
  fixtureUrl('fixtures-error-handling/node_modules/both/main.js'),
  assertFixture,
  fixtureAssertionCount,
  {
    onError,
    shouldFailBeforeArchiveOperations: true,
  },
);

scaffold(
  'fixtures-error-handling / catch',
  test,
  fixtureUrl('fixtures-error-handling/node_modules/catch/main.js'),
  assertFixture,
  1,
  {
    onError: (t, { error, _title }) => {
      t.regex(error.message, /obviouslymissing/);
    },
    shouldFailBeforeArchiveOperations: false,
  },
);

scaffold(
  'fixtures-error-handling / throw falsy',
  test,
  fixtureUrl('fixtures-error-handling/node_modules/what-the-falsy/main.js'),
  assertFixture,
  1,
  {
    onError: (t, { error, _title }) => {
      t.assert(!error);
    },
    shouldFailBeforeArchiveOperations: false,
  },
);
