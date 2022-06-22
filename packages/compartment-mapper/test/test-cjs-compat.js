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

const assertFixture = (t, { namespace, testCategoryHint }) => {
  const { assertions, results } = namespace;

  assertions.packageExportsShenanigans();
  assertions.packageWithDefaultField();
  assertions.moduleWithDefaultField();
  assertions.parserStruggles();
  assertions.moduleWithCycle();
  assertions.defaultChangesAfterExec();
  assertions.packageNestedFile();

  if (testCategoryHint === 'Location') {
    t.deepEqual(results.requireResolvePaths, [
      "Cannot find module '.'",
      '/skipped/fixtures-cjs-compat/node_modules/require-resolve/package.json',
      '/skipped/fixtures-cjs-compat/node_modules/require-resolve/nested/index.js',
      '/skipped/fixtures-cjs-compat/node_modules/require-resolve/nested/file.js',
      '/skipped/fixtures-cjs-compat/node_modules/require-resolve/nested/file.js.map',
      "Cannot find module './nested/file.missing'",
      '/skipped/fixtures-cjs-compat/node_modules/app/index.js',
      'fs',
      '/skipped/fixtures-cjs-compat/node_modules/nested-export/callBound.js',
    ]);
  } else {
    t.deepEqual(results.requireResolvePaths, [
      "Cannot find module '.'",
      "Cannot find module './package.json'",
      "Cannot find module './nested'",
      "Cannot find module './nested/file.js'",
      "Cannot find module './nested/file.js.map'",
      "Cannot find module './nested/file.missing'",
      "Cannot find module 'app'",
      "Cannot find module 'fs'",
      "Cannot find module 'nested-export/callBound'",
    ]);
  }
  t.pass();
};

const fixtureAssertionCount = 2;

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
