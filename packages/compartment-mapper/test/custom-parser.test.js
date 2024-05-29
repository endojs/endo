import 'ses';
import fs from 'fs';
import test from 'ava';
import url from 'url';
import { loadLocation } from '../src/import.js';
import { makeReadPowers } from '../src/node-powers.js';

const { freeze } = Object;

const readPowers = makeReadPowers({ fs, url });
const { read } = readPowers;

test('defining a custom parser works', async t => {
  const fixture = new URL(
    'fixtures-0/node_modules/markdown/README.md',
    import.meta.url,
  ).toString();

  const application = await loadLocation(read, fixture, {
    parsers: [
      {
        parser: {
          // This parser parses markdown files. Use your imagination
          parse: async (
            bytes,
            specifier,
            moduleLocation,
            packageLocation,
            { compartmentDescriptor },
          ) => {
            const execute = moduleEnvironmentRecord => {
              moduleEnvironmentRecord.default = new TextDecoder().decode(bytes);
            };

            t.truthy(
              compartmentDescriptor,
              'compartmentDescriptor is passed to parser',
            );

            return {
              parser: 'markdown',
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
        extensions: ['md'],
        language: 'markdown',
      },
    ],
  });
  const { namespace } = await application.import({});
  const { default: value } = namespace;
  t.is(
    value,
    `# A Markdown File

This fixture is for testing custom parsers.
`,
    'using a custom parser worked',
  );
});
