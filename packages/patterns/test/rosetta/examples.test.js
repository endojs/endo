import test from '@endo/ses-ava/prepare-endo.js';

import {
  badUserProfile,
  explainZodFailure,
  goodUserProfile,
  makeUserProfileZodSchema,
  matchesWithPattern,
  validateWithPattern,
} from '../../docs/rosetta/examples/basic.js';
import {
  describePassStyle,
  featureFlagsInvalid,
  featureFlagsSpecimen,
  makeFeatureFlagsZodSchema,
  makePromiseZodSchema,
  makeRemoteServiceZodSchema,
  matchesPromisePattern,
  promiseInvalid,
  promiseSpecimen,
  remoteServiceInvalid,
  remoteServiceSpecimen,
  validateFeatureFlagsWithPattern,
  validatePromiseWithPattern,
  validateRemotableWithPattern,
} from '../../docs/rosetta/examples/advanced.js';

const loadZodOrSkip = async t => {
  try {
    const mod = await import('zod');
    return mod.z;
  } catch (error) {
    t.log('Rosetta examples skipped: install zod to run Zod comparisons.');
    t.pass();
    return null;
  }
};

test('user profile pattern aligns with Zod schema', async t => {
  const z = await loadZodOrSkip(t);
  if (!z) {
    return;
  }

  const schema = makeUserProfileZodSchema(z);

  t.notThrows(() => validateWithPattern(goodUserProfile));
  t.false(matchesWithPattern(badUserProfile));
  t.throws(() => validateWithPattern(badUserProfile));

  t.true(schema.safeParse(goodUserProfile).success);
  const failed = schema.safeParse(badUserProfile);
  t.false(failed.success);
  t.regex(failed.error.issues[0].message, /non-negative bigint/);
  t.truthy(explainZodFailure(schema, badUserProfile));
});

test('CopySet pattern highlights Zod array gap', async t => {
  const z = await loadZodOrSkip(t);
  if (!z) {
    return;
  }

  const schema = makeFeatureFlagsZodSchema(z);

  t.notThrows(() => validateFeatureFlagsWithPattern(featureFlagsSpecimen));
  t.throws(() => validateFeatureFlagsWithPattern(featureFlagsInvalid));

  const copySetResult = schema.safeParse(featureFlagsSpecimen);
  t.false(copySetResult.success);
  const duplicateArray = schema.safeParse(featureFlagsInvalid);
  t.false(duplicateArray.success);
});

test('remotable pattern vs object schema', async t => {
  const z = await loadZodOrSkip(t);
  if (!z) {
    return;
  }

  const schema = makeRemoteServiceZodSchema(z);

  t.notThrows(() => validateRemotableWithPattern(remoteServiceSpecimen));
  t.throws(() => validateRemotableWithPattern(remoteServiceInvalid));

  t.is(describePassStyle(remoteServiceSpecimen), 'remotable');
  t.throws(() => describePassStyle(remoteServiceInvalid));

  t.true(schema.safeParse(remoteServiceSpecimen).success);
  t.true(schema.safeParse(remoteServiceInvalid).success);
});

test('promise pattern vs thenable distinction', async t => {
  const z = await loadZodOrSkip(t);
  if (!z) {
    return;
  }

  const schema = makePromiseZodSchema(z);

  t.notThrows(() => validatePromiseWithPattern(promiseSpecimen));
  t.true(matchesPromisePattern(promiseSpecimen));
  t.throws(() => matchesPromisePattern(promiseInvalid));
  t.throws(() => validatePromiseWithPattern(promiseInvalid));

  t.true(schema.safeParse(promiseSpecimen).success);
  t.false(schema.safeParse(promiseInvalid).success);
});
