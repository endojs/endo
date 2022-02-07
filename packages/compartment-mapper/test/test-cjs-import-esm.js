// import "./ses-lockdown.js";
import '../../ses/index.js';
import fs from 'fs';
import url from 'url';
import test from 'ava';
import { loadLocation } from '../src/import.js';
import { makeReadPowers } from '../src/node-powers.js';

const readPowers = makeReadPowers({ fs, url });
const { read } = readPowers;

test('CommonJS module can use dynamic import to load an esm module', async t => {
  t.plan(1);

  const fixture = new URL(
    'fixtures-cjs-import-esm/node_modules/app/index.js',
    import.meta.url,
  ).toString();

  const application = await loadLocation(read, fixture, {
    __evadeImportExpressionTest__: true,
  });
  await application.import({
    __evadeImportExpressionTest__: true,
  });
  t.pass();
});
