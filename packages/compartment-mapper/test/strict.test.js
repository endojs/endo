import 'ses';
import test from 'ava';
import { scaffold } from './scaffold.js';

// The JSONP parser uses harden, as a bit.
lockdown({
  errorTaming: 'unsafe',
  errorTrapping: 'none',
});

const assertions = (t, { namespace }) => {
  t.is(namespace.default, 42);
};

const assertionCount = 1;

scaffold(
  'not strict',
  test,
  new URL('fixtures-strict/node_modules/app/main.js', import.meta.url).href,
  assertions,
  assertionCount,
);

scaffold(
  'strict',
  test,
  new URL('fixtures-strict/node_modules/app/main.js', import.meta.url).href,
  assertions,
  assertionCount,
  {
    strict: true,
    shouldFailBeforeArchiveOperations: true,
    onError(t, { error }) {
      t.true(error.message.includes('Cannot find dependency no-such-package'));
    },
  },
);
