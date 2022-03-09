// import "./ses-lockdown.js";
import '../../ses/index.js';
import fs from 'fs';
import url from 'url';
import test from 'ava';
import { loadLocation } from '../src/import.js';
import { makeReadPowers } from '../src/node-powers.js';

const readPowers = makeReadPowers({ fs, url });
const { read } = readPowers;

test('WASM, lol', async t => {
  t.plan(1);

  const fixture = new URL(
    'fixtures-wasm/index.mjs',
    import.meta.url,
  ).toString();

  const application = await loadLocation(read, fixture);
  const { namespace } = await application.import({});
  process._rawDebug(namespace.result)
  t.pass();
});
