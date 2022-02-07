// import "./ses-lockdown.js";
import '../../ses/index.js';
import fs from 'fs';
import url from 'url';
import test from 'ava';
import { loadLocation } from '../src/import.js';
import { makeReadPowers } from '../src/node-powers.js';

const readPowers = makeReadPowers({ fs, url });
const { read } = readPowers;

test('CommonJS referencing exports', async t => {
  t.plan(1);

  const fixture = new URL(
    'fixtures-cjs-compat/node_modules/app/index.js',
    import.meta.url,
  ).toString();

  const application = await loadLocation(read, fixture);
  const {
    namespace: { assertions },
  } = await application.import({});
  assertions.packageReferencingItself();
  t.pass();
});
test('CommonJS exports include a field named `default`', async t => {
  t.plan(1);

  const fixture = new URL(
    'fixtures-cjs-compat/node_modules/app/index.js',
    import.meta.url,
  ).toString();

  const application = await loadLocation(read, fixture);
  const {
    namespace: { assertions },
  } = await application.import({});
  assertions.packageWithDefaultField();
  assertions.moduleWithDefaultField();
  t.pass();
});
