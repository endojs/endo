/**
 * Compartment Mapper test for subpath pattern replacement.
 *
 * Uses the scaffold harness to exercise the fixture through all execution
 * paths (loadLocation, importLocation, makeArchive, parseArchive, etc.).
 *
 * The expected values match those asserted in node-parity-subpath-patterns.test.js,
 * so if both tests pass, the Compartment Mapper has parity with Node.js for
 * these cases.
 */
/** @import {ExecutionContext} from 'ava' */

import 'ses';
import test from 'ava';
import { ZipReader } from '@endo/zip';
import { scaffold, readPowers } from './scaffold.js';
import { importLocation, makeArchive } from '../index.js';
import {
  assertMain,
  assertConditionalBlue,
  assertConditionalDefault,
  assertPrecedence,
} from './_subpath-patterns-assertions.js';

const fixture = new URL(
  'fixtures-subpath-patterns/node_modules/app/main.js',
  import.meta.url,
).toString();

const fixtureAssertionCount = 1;

/**
 * @param {ExecutionContext} t
 * @param {{namespace: object}} result
 */
const assertFixture = (t, { namespace }) => {
  assertMain(t, namespace);
};

scaffold(
  'subpath-patterns',
  test,
  fixture,
  assertFixture,
  fixtureAssertionCount,
);

test('patterns are stripped from archived compartment-map.json', async t => {
  const archive = await makeArchive(readPowers, fixture, {
    modules: {},
    Compartment,
  });
  const reader = new ZipReader(archive);
  const compartmentMapBytes = reader.files.get('compartment-map.json');
  t.truthy(compartmentMapBytes, 'archive contains compartment-map.json');
  const compartmentMap = JSON.parse(
    new TextDecoder().decode(compartmentMapBytes.content),
  );
  for (const [name, descriptor] of Object.entries(
    compartmentMap.compartments,
  )) {
    t.is(
      /** @type {any} */ (descriptor).patterns,
      undefined,
      `compartment ${name} should not have patterns in archive`,
    );
  }
});

test('conditional pattern resolves under user-specified condition', async t => {
  const conditionalFixture = new URL(
    'fixtures-subpath-patterns/node_modules/app/conditional-import.js',
    import.meta.url,
  ).toString();
  const { namespace } = await importLocation(readPowers, conditionalFixture, {
    conditions: new Set(['blue-moon']),
  });
  assertConditionalBlue(t, namespace);
});

test('conditional pattern falls back to default without user condition', async t => {
  const conditionalFixture = new URL(
    'fixtures-subpath-patterns/node_modules/app/conditional-import.js',
    import.meta.url,
  ).toString();
  const { namespace } = await importLocation(readPowers, conditionalFixture);
  assertConditionalDefault(t, namespace);
});

test('policy allows pattern-matched imports when package is permitted', async t => {
  const policy = {
    entry: { packages: { 'patterns-lib': true } },
    resources: { 'patterns-lib': {} },
  };
  const { namespace } = await importLocation(readPowers, fixture, { policy });
  assertMain(t, namespace);
});

test('policy rejects pattern-matched imports when package is not permitted', async t => {
  const policy = {
    entry: { packages: {} },
    resources: {},
  };
  await t.throwsAsync(() => importLocation(readPowers, fixture, { policy }));
});

test('null-target pattern excludes matching specifier', async t => {
  const nullTargetFixture = new URL(
    'fixtures-subpath-patterns/node_modules/app/null-target-import.js',
    import.meta.url,
  ).toString();
  await t.throwsAsync(() => importLocation(readPowers, nullTargetFixture), {
    message: /excluded by null target pattern/,
  });
});

test('pattern tie-break matches Node precedence rules', async t => {
  const precedenceFixture = new URL(
    'fixtures-subpath-patterns/node_modules/app/precedence-import.js',
    import.meta.url,
  ).toString();
  const { namespace } = await importLocation(readPowers, precedenceFixture);
  assertPrecedence(t, namespace);
});
