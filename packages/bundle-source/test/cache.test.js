import url from 'url';
import os from 'os';
import path from 'path';
import fs from 'fs/promises';
import test from '@endo/ses-ava/prepare-endo.js';
import { makeNodeBundleCache } from '../cache.js';

const loadModule = specifier => import(specifier);

const makeTempDest = async t => {
  const dest = await fs.mkdtemp(path.join(os.tmpdir(), 'endo-cache-'));
  // Node 18 treats .js as CommonJS unless a nearby package.json declares
  // "type":"module", so this temp cache must opt into ESM for `import()`.
  await fs.writeFile(
    path.join(dest, 'package.json'),
    JSON.stringify({ type: 'module' }),
  );
  t.teardown(() => fs.rm(dest, { recursive: true, force: true }));
  return dest;
};

test('cache can capture and verify metadata', async t => {
  const dest = await makeTempDest(t);
  const entry = url.fileURLToPath(
    new URL('../demo/meaning.js', import.meta.url),
  );
  const cache = await makeNodeBundleCache(dest, {}, loadModule);
  await cache.validateOrAdd(entry, 'cache-test-meaning', t.log);
  await cache.validate('cache-test-meaning', undefined, t.log);
  t.pass();
});

test('add/validate do not mutate caller conditions arrays', async t => {
  const dest = await makeTempDest(t);
  const entry = url.fileURLToPath(
    new URL('../demo/meaning.js', import.meta.url),
  );
  const cache = await makeNodeBundleCache(dest, {}, loadModule);
  const targetName = 'cache-test-immutability';

  const addConditions = ['z', 'a'];
  const meta = await cache.add(entry, targetName, t.log, {
    conditions: addConditions,
  });
  t.deepEqual(addConditions, ['z', 'a']);
  t.deepEqual(meta.conditions, ['a', 'z']);

  const validateConditions = ['z', 'a'];
  await cache.validate(targetName, entry, t.log, undefined, {
    conditions: validateConditions,
  });
  t.deepEqual(validateConditions, ['z', 'a']);

  const metaForValidation = { ...meta, conditions: ['z', 'a'] };
  await cache.validate(targetName, entry, t.log, metaForValidation, {
    conditions: ['a', 'z'],
  });
  t.deepEqual(metaForValidation.conditions, ['z', 'a']);
});

test('validateOrAdd throws SyntaxError with consistent message for malformed metadata', async t => {
  const dest = await makeTempDest(t);
  const entry = url.fileURLToPath(
    new URL('../demo/meaning.js', import.meta.url),
  );
  const cache = await makeNodeBundleCache(dest, {}, loadModule);
  const targetName = 'cache-test-malformed-meta';

  await cache.add(entry, targetName, t.log);
  await fs.writeFile(path.join(dest, `bundle-${targetName}-js-meta.json`), '{');

  await t.throwsAsync(() => cache.validateOrAdd(entry, targetName, t.log), {
    instanceOf: SyntaxError,
    message: /Cannot parse JSON from cache-test-malformed-meta/,
  });
});

test('load can recover after a failed attempt for the same target name', async t => {
  const dest = await makeTempDest(t);
  const entry = url.fileURLToPath(
    new URL('../demo/meaning.js', import.meta.url),
  );
  const cache = await makeNodeBundleCache(dest, {}, loadModule);
  const targetName = 'cache-test-recovery';
  const metaPath = path.join(dest, `bundle-${targetName}-js-meta.json`);

  await cache.add(entry, targetName, t.log);
  await fs.writeFile(metaPath, '{');
  await t.throwsAsync(() => cache.load(entry, targetName, t.log), {
    instanceOf: SyntaxError,
  });

  await fs.rm(metaPath);
  const bundle = await cache.load(entry, targetName, t.log);
  t.truthy(bundle);
});
