// @ts-nocheck
import 'ses';
import fs from 'fs';
import test from 'ava';
import url from 'url';
import { loadLocation } from '../src/import.js';
import { makeReadPowers } from '../src/node-powers.js';

const { freeze } = Object;
const { quote: q } = assert;

const readPowers = makeReadPowers({ fs, url });
const { read } = readPowers;

test('defining a custom parser works', async t => {
  const fixture = new URL(
    'fixtures-0/node_modules/markdown/README.md',
    import.meta.url,
  ).toString();

  const application = await loadLocation(read, fixture, {
    parserForLanguage: {
      markdown: {
        // This parser parses markdown files. Use your imagination
        parse: async (
          bytes,
          _specifier,
          _moduleLocation,
          _packageLocation,
          { compartmentDescriptor } = {},
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
    },
    languageForExtension: {
      md: 'markdown',
    },
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

test('a custom parser may implement policy enforcement (allowed)', async t => {
  const fixture = new URL(
    'fixtures-0/node_modules/markdown/README.md',
    import.meta.url,
  ).toString();

  const application = await loadLocation(read, fixture, {
    policy: {
      resources: {},
      // this was the most straightforward way to do it, sorry!
      entry: {
        options: {
          markdown: true,
        },
      },
    },
    parserForLanguage: {
      markdown: {
        parse: async (
          bytes,
          specifier,
          _moduleLocation,
          _packageLocation,
          { compartmentDescriptor = {} } = {},
        ) => {
          const execute = moduleEnvironmentRecord => {
            moduleEnvironmentRecord.default = new TextDecoder().decode(bytes);
          };

          // it's just a test. just a test. breathe
          if (
            !compartmentDescriptor.policy ||
            !compartmentDescriptor.policy.options ||
            (compartmentDescriptor.policy &&
              compartmentDescriptor.policy.options &&
              compartmentDescriptor.policy.options.markdown !== true)
          ) {
            throw new Error(`Markdown parsing not allowed for ${q(specifier)}`);
          }

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
    },
    languageForExtension: {
      md: 'markdown',
    },
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

test('a custom parser may implement policy enforcement (disallowed)', async t => {
  const fixture = new URL(
    'fixtures-0/node_modules/markdown/README.md',
    import.meta.url,
  ).toString();

  const application = await loadLocation(read, fixture, {
    policy: {
      resources: {},
      // this was the most straightforward way to do it, sorry!
      entry: {
        options: {
          markdown: false,
        },
      },
    },
    parserForLanguage: {
      markdown: {
        // This parser parses markdown files. Use your imagination
        parse: async (
          bytes,
          specifier,
          _moduleLocation,
          _packageLocation,
          { compartmentDescriptor = {} } = {},
        ) => {
          const execute = moduleEnvironmentRecord => {
            moduleEnvironmentRecord.default = new TextDecoder().decode(bytes);
          };

          // it's just a test. just a test. breathe
          if (
            !compartmentDescriptor.policy ||
            !compartmentDescriptor.policy.options ||
            (compartmentDescriptor.policy &&
              compartmentDescriptor.policy.options &&
              compartmentDescriptor.policy.options.markdown !== true)
          ) {
            throw new Error(`Markdown parsing not allowed for ${q(specifier)}`);
          }

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
    },
    languageForExtension: { md: 'markdown' },
  });
  await t.throwsAsync(application.import({}), {
    message: /Markdown parsing not allowed for.+README\.md/,
  });
});
