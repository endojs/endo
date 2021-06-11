import 'ses';
import fs from 'fs';
import test from 'ava';
import { makeBundle, makeArchive, parseArchive } from '../index.js';

const fixture = new URL(
  'node_modules/bundle/main.js',
  import.meta.url,
).toString();

const read = async location => fs.promises.readFile(new URL(location).pathname);

const expectedLog = [
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
  'Sam',
  'Sam',
];

test('bundles work', async t => {
  const bundle = await makeBundle(read, fixture);
  // t.log(bundle);
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
