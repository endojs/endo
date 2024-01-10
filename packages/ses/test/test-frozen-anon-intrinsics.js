import test from 'ava';
import '../index.js';

function makeArguments() {
  // eslint-disable-next-line prefer-rest-params
  return arguments;
}

test.before(() => {
  lockdown();
});

test('arguments.callee getter is frozen', t => {
  t.truthy(
    Object.isFrozen(
      Object.getOwnPropertyDescriptor(makeArguments(), 'callee').get,
    ),
  );
});
