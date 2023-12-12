import { test } from './prepare-test-env-ava.js';

// eslint-disable-next-line import/order
import { makeEnvironmentCaptor } from '@endo/env-options';

test('test env options empty env', async t => {
  const c1 = new Compartment();
  const { getEnvironmentOption, getCapturedEnvironmentOptionNames } =
    makeEnvironmentCaptor(c1.globalThis);

  const c1foo = getEnvironmentOption('FOO', 'none');
  t.is(c1foo, 'none');
  t.deepEqual(getCapturedEnvironmentOptionNames(), []);
});

test('test env options present', t => {
  const c2 = new Compartment({
    process: {
      env: {
        FOO: 'bar',
        BAD: ['not a string'],
      },
    },
  });
  const { getEnvironmentOption, getCapturedEnvironmentOptionNames } =
    makeEnvironmentCaptor(c2.globalThis);

  const c2foo = getEnvironmentOption('FOO', 'none');
  t.is(c2foo, 'bar');
  t.deepEqual(getCapturedEnvironmentOptionNames(), ['FOO']);

  t.throws(() => getEnvironmentOption('BAD', 'none'), {
    message:
      'Environment option named "BAD", if present, must have a corresponding string value, got ["not a string"]',
  });
  t.throws(() => getEnvironmentOption('WORSE', ['none']), {
    message: 'Environment option default setting ["none"] must be a string.',
  });
});
