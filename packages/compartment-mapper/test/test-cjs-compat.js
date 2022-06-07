/* eslint-disable no-underscore-dangle */
// import "./ses-lockdown.js";
import 'ses';
import test from 'ava';
import path from 'path';

import { scaffold } from './scaffold.js';

const fixture = new URL(
  'fixtures-cjs-compat/node_modules/app/index.js',
  import.meta.url,
).toString();
const fixtureDirname = new URL(
  'fixtures-cjs-compat/node_modules/app/dirname.js',
  import.meta.url,
).toString();

const assertFixture = (t, { namespace }) => {
  const { assertions } = namespace;

  assertions.packageExportsShenanigans();
  assertions.packageWithDefaultField();
  assertions.moduleWithDefaultField();
  assertions.parserStruggles();
  assertions.moduleWithCycle();
  assertions.defaultChangesAfterExec();
  assertions.packageNestedFile();
  assertions.requireResolve();

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

scaffold(
  'fixtures-cjs-compat-__dirname',
  test,
  fixtureDirname,
  (t, { namespace, testCategoryHint }) => {
    const { __dirname, __filename } = namespace;
    if (testCategoryHint === 'Location') {
      t.is(__filename, path.join(__dirname, '/dirname.js'));
      t.assert(!__dirname.startsWith('file://'));
      t.notRegex(
        __dirname,
        /[\\/]$/,
        'Expected __dirname to NOT have a trailing slash',
      );
    } else {
      t.is(__dirname, null);
      t.is(__filename, null);
      t.pass();
    }
  },
  3,
);
