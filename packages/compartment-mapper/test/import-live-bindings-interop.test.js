// @ts-nocheck
// import "./ses-lockdown.js";
import 'ses';
import fs from 'fs';
import url from 'url';
import test from 'ava';
import { setTimeout } from 'node:timers';
import { importLocation } from '../src/import.js';
import { makeReadPowers } from '../src/node-powers.js';

const readPowers = makeReadPowers({ fs, url });
const { read } = readPowers;

test('import mutability compared with node.js', async t => {
  t.plan(1);

  const fixture = new URL(
    'fixtures-import-mutability/index.js',
    import.meta.url,
  ).toString();

  const result = await import(fixture);

  const { namespace } = await importLocation(read, fixture, {
    globals: {
      console,
      setTimeout,
    },
  });

  const compare = {
    node: await result.getSummary(),
    ses: await namespace.getSummary(),
  };
  const differences = Object.entries(compare.node).map(([key, value]) => {
    if(value !== compare.ses[key]) {
      return `[!] ${key}: node=${value} endo=${compare.ses[key]} `;
    } else {
      return `    ${key}: both ${value}`;
    }
  })
  t.log(differences.join('\n'));
  t.snapshot(differences);
});
