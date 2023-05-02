import 'ses';
import test from 'ava';
import { scaffold } from './scaffold.js';


scaffold(
  'test cjs/mjs compat issue - default-reexport',
  test,
  new URL(
    'fixtures-mjs-cjs-compat/node_modules/app/default-reexport.js',
    import.meta.url,
  ).toString(),
  (t, { namespace: { defaultExport } }) => {
    t.deepEqual(defaultExport, {
      xyz: 123,
    });
  },
  1,
  {
    knownFailure: true,
  },
);

scaffold(
  'test cjs/mjs compat issue - default-direct',
  test,
  new URL(
    'fixtures-mjs-cjs-compat/node_modules/app/default-direct.js',
    import.meta.url,
  ).toString(),
  (t, { namespace: { defaultExport } }) => {
    t.deepEqual(defaultExport, {
      xyz: 123,
    });
  },
  1,
  {
    knownFailure: true,
  },
);

scaffold(
  'test cjs/mjs compat issue - named-reexport',
  test,
  new URL(
    'fixtures-mjs-cjs-compat/node_modules/app/named-reexport.js',
    import.meta.url,
  ).toString(),
  (t, { namespace: defaultExport }) => {
    t.deepEqual(defaultExport, { xyz: 123 });
  },
  1,
  {
    knownFailure: true,
  },
);

scaffold(
  'test cjs/mjs compat issue - named-direct',
  test,
  new URL(
    'fixtures-mjs-cjs-compat/node_modules/app/named-direct.js',
    import.meta.url,
  ).toString(),
  (t, { namespace: defaultExport }) => {
    t.deepEqual(defaultExport, { xyz: 123 });
  },
  1,
  {
    knownFailure: true,
  },
);

scaffold(
  'test cjs/mjs compat issue - mixed-reexport',
  test,
  new URL(
    'fixtures-mjs-cjs-compat/node_modules/app/mixed-reexport.js',
    import.meta.url,
  ).toString(),
  (t, { namespace }) => {
    t.deepEqual(namespace, {
      abc: { xyz: 123 },
      xyz: 123,
    });
  },
  1,
  {
    knownFailure: true,
  },
);

scaffold(
  'test cjs/mjs compat issue - mixed-direct',
  test,
  new URL(
    'fixtures-mjs-cjs-compat/node_modules/app/mixed-direct.js',
    import.meta.url,
  ).toString(),
  (t, { namespace }) => {
    t.deepEqual(namespace, {
      abc: { xyz: 123 },
      xyz: 123,
    });
  },
  1,
  {
    knownFailure: true,
  },
);

scaffold(
  'test cjs/mjs compat issue - star-reexport',
  test,
  new URL(
    'fixtures-mjs-cjs-compat/node_modules/app/star-reexport.js',
    import.meta.url,
  ).toString(),
  (t, { namespace: { starExport } }) => {
    t.deepEqual(starExport, {
      xyz: 123,
      default: { xyz: 123 },
    });
  },
  1,
  {
    knownFailure: true,
  },
);

scaffold(
  'test cjs/mjs compat issue - star-direct',
  test,
  new URL(
    'fixtures-mjs-cjs-compat/node_modules/app/star-direct.js',
    import.meta.url,
  ).toString(),
  (t, { namespace: { starExport } }) => {
    t.deepEqual(starExport, {
      xyz: 123,
      default: { xyz: 123 },
    });
  },
  1,
  {
    knownFailure: true,
  },
);
