import 'ses';
import fs from 'fs';
import test from 'ava';
import url from 'url';
import { createRequire } from 'module';
import { loadLocation } from '../src/import.js';
import { makeReadPowers } from '../src/node-powers.js';

const { freeze } = Object;

const readPowers = makeReadPowers({ fs, url });
const { read } = readPowers;

test('defining a custom parser works', async t => {
  const fixture = new URL(
    'fixtures-0/node_modules/native/index.js',
    import.meta.url,
  ).toString();

  const require = createRequire(fixture); // the URL doesn't really matter, we're requiring absolute paths

  const application = await loadLocation(read, fixture, {
    parsers: [
      {
        parser: {
          parse: (bytes, specifier, moduleLocation, packageLocation, powers) => {
            const execute = (moduleEnvironmentRecord) => {
              // eslint-disable-next-line import/no-dynamic-require
              const n = require(url.fileURLToPath(moduleLocation));
              moduleEnvironmentRecord.default = n;
            };
            return {
              parser: 'native',
              bytes,
              record: freeze({
                imports: [],
                exports: ['default'],
                reexports: [],
                execute,
              }),
            };
          },
        },
        extensions: ['.node'],
        languages: ['node'],
      },
    ],
  });
  const { namespace } = await application.import({});
  const { default: value } = namespace;
  t.is(value, 'world', 'using a custom parser worked');
});
