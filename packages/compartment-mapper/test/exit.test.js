import fs from 'fs';
import crypto from 'crypto';
import url from 'url';
import 'ses';
import test from 'ava';
import { makeArchive, parseArchive } from '../index.js';
import { makeReadPowers } from '../node-powers.js';

test('can make, parse, and import an archive with a URL-scheme-prefixed importHook exit to a host module', async t => {
  const fixture = new URL(
    'fixtures-exit/import-export.js',
    import.meta.url,
  ).toString();
  const readPowers = makeReadPowers({ fs, url, crypto });
  const archive = await makeArchive(readPowers, fixture);
  const app = await parseArchive(archive, {});
  const { namespace } = await app.import({
    importHook(specifier) {
      t.is(specifier, 'h2g2:meaning');
      return { namespace: { meaning: 42 } };
    },
  });
  t.is(namespace.meaning, 42);
});

test.failing(
  'can make, parse, and import an archive with a URL-scheme-prefixed modules map exit to a host module',
  async t => {
    const fixture = new URL(
      'fixtures-exit/reexport.js',
      import.meta.url,
    ).toString();
    const readPowers = makeReadPowers({ fs, url, crypto });
    const archive = await makeArchive(readPowers, fixture);
    const app = await parseArchive(archive, {});
    const { namespace } = await app.import({
      modules: {
        'h2g2:meaning': { namespace: { meaning: 42 } },
      },
    });
    t.is(namespace.meaning, 42);
  },
);
