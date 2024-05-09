// import "./ses-lockdown.js";
import 'ses';
import test from 'ava';
import { scaffold } from './scaffold.js';

const fixtureOptionalDepsEsm = new URL(
  'fixtures-optional/node_modules/optional-esm/index.js',
  import.meta.url,
).toString();

const fixtureOptionalDepsCjs = new URL(
  'fixtures-optional/node_modules/optional-cjs/index.js',
  import.meta.url,
).toString();

scaffold(
  'optionalDependencies/esm',
  // this test fails because it relies on dynamic import
  test,
  fixtureOptionalDepsEsm,
  async (t, { namespace }) => {
    const { tryOptionalDeps } = namespace;
    const result = await tryOptionalDeps();
    t.deepEqual(
      Reflect.ownKeys(result.exports),
      ['alpha', 'beta'],
      'expected exports',
    );
    t.deepEqual(
      Reflect.ownKeys(result.errors),
      ['one', 'two'],
      'expected errors',
    );
    t.regex(
      result.errors.one.message,
      /^Cannot find external module "missing-one" in package.*/,
    );
    t.regex(
      result.errors.two.message,
      /^Cannot find external module "missing-two" in package.*/,
    );
  },
  4,
  { knownFailure: true },
);

scaffold(
  'optionalDependencies/cjs',
  test,
  fixtureOptionalDepsCjs,
  (t, { namespace }) => {
    const { tryOptionalDeps } = namespace;
    const result = tryOptionalDeps();
    t.deepEqual(
      Reflect.ownKeys(result.exports),
      ['alpha', 'beta'],
      'expected exports',
    );
    t.deepEqual(
      Reflect.ownKeys(result.errors),
      ['one', 'two'],
      'expected errors',
    );
    t.regex(
      result.errors.one.message,
      /^Cannot find external module "missing-one" in package.*/,
    );
    t.regex(
      result.errors.two.message,
      /^Cannot find external module "missing-two" in package.*/,
    );
  },
  4,
);
