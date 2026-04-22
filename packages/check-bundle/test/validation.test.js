// @ts-check
import '@endo/init/debug.js';
import test from 'ava';
import { parseLocatedJson } from '../src/json.js';
import { checkBundle } from '../lite.js';

test('parseLocatedJson parses valid JSON', t => {
  const result = parseLocatedJson('{"a":1}', 'test.json');
  t.deepEqual(result, { a: 1 });
});

test('parseLocatedJson annotates SyntaxError with location', t => {
  t.throws(() => parseLocatedJson('{bad', 'config.json'), {
    instanceOf: SyntaxError,
    message: /Cannot parse JSON from.*config\.json/,
  });
});

test('checkBundle rejects null', async t => {
  const computeSha512 = () => 'fakehash';
  await t.throwsAsync(() => checkBundle(null, computeSha512), {
    message: /checkBundle expects a bundle object/,
  });
});

// Skipped when isFrozen is compromised by unsafe hardenTaming,
// which makes every object appear frozen.
(Object.isFrozen({}) ? test.skip : test)(
  'checkBundle rejects unfrozen bundle',
  async t => {
    const computeSha512 = () => 'fakehash';
    await t.throwsAsync(
      () => checkBundle({ moduleFormat: 'getExport' }, computeSha512),
      { message: /ongoing integrity of an unfrozen object/ },
    );
  },
);

test('checkBundle rejects bundle with getter properties', async t => {
  const computeSha512 = () => 'fakehash';
  const bundle = Object.freeze(
    Object.create(null, {
      moduleFormat: { value: 'getExport', enumerable: true },
      source: { get: () => 'code', enumerable: true },
    }),
  );
  await t.throwsAsync(() => checkBundle(bundle, computeSha512), {
    message: /getter properties/,
  });
});

test('checkBundle rejects bundle with non-string value', async t => {
  const computeSha512 = () => 'fakehash';
  const bundle = Object.freeze({ moduleFormat: 'getExport', source: 42 });
  await t.throwsAsync(() => checkBundle(bundle, computeSha512), {
    message: /non-string value properties/,
  });
});
