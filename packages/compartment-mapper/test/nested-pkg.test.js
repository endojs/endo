// import "./ses-lockdown.js";
import 'ses';
import fs from 'fs';
import url from 'url';
import test from 'ava';
import { loadLocation } from '../src/import.js';
import { makeReadPowers } from '../src/node-powers.js';

const readPowers = makeReadPowers({ fs, url });
const { read } = readPowers;

test('nested package.json changing type', async t => {
  t.plan(1);

  const fixture = new URL(
    'fixtures-nested-pkg/node_modules/app/index.js',
    import.meta.url,
  ).toString();

  const application = await loadLocation(read, fixture);
  await application.import({});
  t.pass();
});
