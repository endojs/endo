import 'ses';
import fs from 'fs';
import url from 'url';
import test from 'ava';
import { makeBundle, makeArchive, parseArchive } from '../index.js';
import { makeReadPowers } from '../node-powers.js';
import { moduleify } from './scaffold.js';

const fixture = new URL(
  'fixtures-0/node_modules/bundle/main.js',
  import.meta.url,
).toString();

const { read } = makeReadPowers({ fs, url });

const expectedLog = [
  'On the other hand,',
  'are other fingers.',
  'dependency',
  'foo',
  moduleify({
    c: 'sea',
    i: 'eye',
    q: 'cue',
    k: 'que',
    u: 'you',
    y: 'why',
  }),
  moduleify({
    c: 'sea',
    i: 'eye',
    q: 'cue',
    k: 'que',
    u: 'you',
    y: 'why',
  }),
  'fizz',
  'buzz',
  'blue',
  'qux',
  '#777',
  moduleify({
    red: '#f00',
    green: '#0f0',
    blue: '#00f',
  }),
  moduleify({
    default: {
      zzz: 1,
      fromMjs: 'foo',
    },
    fromMjs: 'foo',
    zzz: 1,
  }),
  { widdershins: 'againshins' },
];

test('bundles work', async t => {
  const bundle = await makeBundle(read, fixture);
  const log = [];
  const print = entry => {
    log.push(entry);
  };
  const compartment = new Compartment({
    globals: { print },
    __options__: true,
  });
  compartment.evaluate(bundle);
  t.deepEqual(log, expectedLog);
});

test('using named evaluate bundles work', async t => {
  const bundle = await makeBundle(read, fixture, {
    useNamedEvaluate: 'nestedEvaluate',
  });
  const log = [];
  const print = entry => {
    log.push(entry);
  };
  const compartment = new Compartment({
    globals: {
      print,
      nestedEvaluate(source) {
        return compartment.evaluate(source);
      },
    },
    __options__: true,
  });
  compartment.evaluate(bundle);
  t.deepEqual(log, expectedLog);
});

test('using named evaluate bundles preserve error line numbers', async t => {
  const bundle = await makeBundle(read, fixture, {
    useNamedEvaluate: 'nestedEvaluate',
  });
  const log = [];
  const print = entry => {
    log.push(entry);
  };
  const compartment = new Compartment({
    globals: {
      print,
      nestedEvaluate(source) {
        return compartment.evaluate(source);
      },
    },
    __options__: true,
  });
  const { raise } = compartment.evaluate(bundle);
  let error = null;
  try {
    raise();
  } catch (_error) {
    error = _error;
  }
  t.assert(error.stack.includes(':4:'));
});

test('equivalent archive behaves the same as bundle', async t => {
  const log = [];
  const print = entry => {
    log.push(entry);
  };

  const archive = await makeArchive(read, fixture);
  const application = await parseArchive(archive, fixture);
  await application.import({
    globals: { print },
  });
  t.deepEqual(log, expectedLog);
});

// This is failing because it requires support for missing dependencies.
// Cannot bundle: encountered deferredError Cannot find file for internal module "./spam"
test.failing('bundle cjs-compat', async t => {
  const cjsFixture = new URL(
    'fixtures-cjs-compat/node_modules/app/index.js',
    import.meta.url,
  ).toString();

  const bundle = await makeBundle(read, cjsFixture);
  const log = [];
  const print = entry => {
    log.push(entry);
  };
  const compartment = new Compartment({
    globals: { print },
    __options__: true,
  });
  compartment.evaluate(bundle);
  t.deepEqual(log, expectedLog);
});

test('bundle cjs-compat default-difficulties', async t => {
  const cjsFixture = new URL(
    'fixtures-cjs-compat/node_modules/default-difficulties/index.mjs',
    import.meta.url,
  ).toString();

  const bundle = await makeBundle(read, cjsFixture);
  const compartment = new Compartment();
  const { results } = compartment.evaluate(bundle);
  const resultExports = results.map(result => {
    return Object.keys(result).sort();
  });
  t.deepEqual(resultExports, [
    ['default', 'even'],
    ['default', 'even', 'version'],
    ['__esModule', 'default', 'even', 'version'],
    ['__esModule', 'default', 'even', 'version'],
    ['default', 'even', 'version'],
    ['default', 'even'],
    ['default', 'even'],
  ]);
});
