// import "./ses-lockdown.js";
import 'ses';
import fs from 'fs';
import test from 'ava';
import { loadLocation } from '../src/import.js';
import { makeNodeReadPowers } from '../src/node-powers.js';

const readPowers = makeNodeReadPowers(fs);
const { read } = readPowers;

test('reflexive cycle of ESM', async t => {
  t.plan(1);

  const fixture = new URL(
    'fixtures-cycle-mjs/node_modules/app/index.js',
    import.meta.url,
  ).toString();

  const application = await loadLocation(read, fixture);
  await application.import({});
  t.pass();
});
