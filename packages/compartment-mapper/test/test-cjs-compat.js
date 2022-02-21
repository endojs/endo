// import "./ses-lockdown.js";
import 'ses';
import test from 'ava';

import { scaffold } from './scaffold.js';

const fixture = new URL(
  'fixtures-cjs-compat/node_modules/app/index.js',
  import.meta.url,
).toString();

const assertFixture = (t, { namespace }) => {
  const { assertions } = namespace;

  assertions.packageReferencingItself();
  assertions.packageWithDefaultField();
  assertions.moduleWithDefaultField();
  assertions.parserStruggles();
  assertions.moduleWithCycle();

  t.pass();
};

const fixtureAssertionCount = 1;

scaffold(
  'fixtures-cjs-compat',
  test,
  fixture,
  assertFixture,
  fixtureAssertionCount,
);
