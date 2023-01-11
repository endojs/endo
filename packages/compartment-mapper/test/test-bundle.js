import 'ses';
import fs from 'fs';
import url from 'url';
import test from 'ava';
import vm from 'vm'
import { makeBundle, makeSecureBundle, makeArchive, parseArchive } from '../index.js';
import { makeReadPowers } from '../node-powers.js';

const fixture = new URL(
  'fixtures-0/node_modules/bundle/main.js',
  import.meta.url,
).toString();

const { read } = makeReadPowers({ fs, url });

const expectedLog = [
  'dependency',
  'foo',
  {
    c: 'sea',
    i: 'eye',
    q: 'cue',
    k: 'que',
    u: 'you',
    y: 'why',
  },
  {
    c: 'sea',
    i: 'eye',
    q: 'cue',
    k: 'que',
    u: 'you',
    y: 'why',
  },
  'fizz',
  'buzz',
  'blue',
  'qux',
  '#777',
  {
    red: '#f00',
    green: '#0f0',
    blue: '#00f',
  },
  {
    default: {
      zzz: 1,
      fromMjs: 'foo',
    },
    fromMjs: 'foo',
    zzz: 1,
  },
];

test('bundles work', async t => {
  const bundle = await makeBundle(read, fixture);
  const log = [];
  const print = entry => {
    log.push(entry);
  };
  const compartment = new Compartment({ print });
  compartment.evaluate(bundle);
  t.deepEqual(log, expectedLog);
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

test('secure bundles work', async t => {
  const bundle = await makeSecureBundle(read, fixture);
  // console.log(bundle)
  // fs.writeFileSync('xyz.js', bundle)

  const log = [];
  const print = entry => {
    log.push(entry);
  };
  vm.runInNewContext(bundle, { print });

  t.deepEqual(log, expectedLog);
});
