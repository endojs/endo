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
    parsers: [
      {
        parser: {
          // This parser parses markdown files. Use your imagination
          parse: async (
            bytes,
            specifier,
            moduleLocation,
            packageLocation,
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
    parsers: [
      {
        parser: {
          // This parser parses markdown files. Use your imagination
          parse: async (
            bytes,
            specifier,
            moduleLocation,
            packageLocation,
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
              throw new Error(
                `Markdown parsing not allowed for ${q(specifier)}`,
              );
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

test('a custom parser cannot override a builtin parser for a given language', async t => {
  const fixture = new URL(
    'fixtures-0/node_modules/markdown/README.md',
    import.meta.url,
  ).toString();

  const application = await loadLocation(read, fixture, {
    parsers: [
      {
        parser: {
          parse: async bytes => {
            return {
              parser: 'cjs',
              bytes,
              record: freeze({
                imports: [],
                exports: ['default'],
                reexports: [],
                execute: () => {},
              }),
            };
          },
        },
        extensions: ['yak'],
        language: 'cjs',
      },
    ],
  });
  await t.throwsAsync(application.import({}), {
    message: `Parser for language ${q('cjs')} already defined by builtin`,
  });
});

test('multiple custom parsers cannot use the same language', async t => {
  const fixture = new URL(
    'fixtures-0/node_modules/bundle/requireme.cjs',
    import.meta.url,
  ).toString();

  const application = await loadLocation(read, fixture, {
    parsers: [
      {
        parser: {
          parse: async bytes => {
            return {
              parser: 'noop',
              bytes,
              record: freeze({
                imports: [],
                exports: ['default'],
                reexports: [],
                execute: () => {},
              }),
            };
          },
        },
        extensions: ['yuk'],
        language: 'noop',
      },
      {
        parser: {
          parse: async bytes => {
            return {
              parser: 'noop',
              bytes,
              record: freeze({
                imports: [],
                exports: ['default'],
                reexports: [],
                execute: () => {},
              }),
            };
          },
        },
        extensions: ['yak'],
        language: 'noop',
      },
    ],
  });
  await t.throwsAsync(application.import({}), {
    message: `Custom parser for language ${q('noop')} already defined`,
  });
});

test('a custom parser cannot override a builtin language for a known extension', async t => {
  const fixture = new URL(
    'fixtures-0/node_modules/bundle/requireme.cjs',
    import.meta.url,
  ).toString();

  const application = await loadLocation(read, fixture, {
    parsers: [
      {
        parser: {
          parse: async bytes => {
            return {
              parser: 'noop',
              bytes,
              record: freeze({
                imports: [],
                exports: ['default'],
                reexports: [],
                execute: () => {},
              }),
            };
          },
        },
        extensions: ['cjs'],
        language: 'noop',
      },
    ],
  });
  await t.throwsAsync(application.import({}), {
    message: `Extension ${q('cjs')} already assigned language ${q('cjs')}`,
  });
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
    parsers: [
      {
        parser: {
          // This parser parses markdown files. Use your imagination
          parse: async (
            bytes,
            specifier,
            moduleLocation,
            packageLocation,
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
              throw new Error(
                `Markdown parsing not allowed for ${q(specifier)}`,
              );
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
        extensions: ['md'],
        language: 'markdown',
      },
    ],
  });
  await t.throwsAsync(application.import({}), {
    message: /Markdown parsing not allowed for.+README\.md/,
  });
});
