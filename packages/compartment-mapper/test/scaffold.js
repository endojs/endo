import 'ses';
import fs from 'fs';
import crypto from 'crypto';
import url from 'url';
import { ZipReader, ZipWriter } from '@endo/zip';
import {
  loadLocation,
  importLocation,
  makeArchive,
  writeArchive,
  parseArchive,
  loadArchive,
  importArchive,
  hashLocation,
} from '../index.js';
import { makeReadPowers } from '../src/node-powers.js';

export const readPowers = makeReadPowers({ fs, crypto, url });

const globals = {
  // process: { _rawDebug: process._rawDebug }, // useful for debugging
  globalProperty: 42,
  globalLexical: 'global', // should be overshadowed
  TextEncoder,
  TextDecoder,
};

const globalLexicals = {
  globalLexical: 'globalLexical',
};

let modules;

const builtinLocation = new URL(
  'fixtures-0/node_modules/builtin/builtin.js',
  import.meta.url,
).toString();

// The setup prepares a builtin module namespace object that gets threaded into
// all subsequent tests to satisfy the "builtin" module dependency of the
// application package.

export async function setup() {
  if (modules === undefined) {
    const utility = await loadLocation(readPowers, builtinLocation);
    const { namespace } = await utility.import({ globals });
    // We pass the builtin module into the module map.
    modules = {
      builtin: namespace,
    };
  }
  return { modules, globals, globalLexicals };
}

export function scaffold(
  name,
  test,
  fixture,
  assertFixture,
  fixtureAssertionCount,
  { onError, shouldFailBeforeArchiveOperations = false } = {},
) {
  // wrapping each time allows for convenient use of test.only
  const wrap = (testFunc, testCategoryHint) => (title, implementation) => {
    return testFunc(title, async t => {
      let namespace;
      try {
        namespace = await implementation(t);
      } catch (error) {
        if (onError) {
          return onError(t, { error, title });
        }
        throw error;
      }
      return assertFixture(t, {
        namespace,
        globals,
        globalLexicals,
        testCategoryHint,
      });
    });
  };

  wrap(test, 'Location')(`${name} / loadLocation`, async t => {
    t.plan(fixtureAssertionCount);
    await setup();

    const application = await loadLocation(readPowers, fixture, {
      dev: true,
    });
    const { namespace } = await application.import({
      globals,
      globalLexicals,
      modules,
      Compartment,
    });
    return namespace;
  });

  wrap(test, 'Location')(`${name} / importLocation`, async t => {
    t.plan(fixtureAssertionCount);
    await setup();

    const { namespace } = await importLocation(readPowers, fixture, {
      globals,
      globalLexicals,
      modules,
      Compartment,
      dev: true,
    });
    return namespace;
  });

  wrap(test, 'Archive')(`${name} / makeArchive / parseArchive`, async t => {
    t.plan(fixtureAssertionCount);
    await setup();

    const archive = await makeArchive(readPowers, fixture, {
      modules,
      dev: true,
    });
    const application = await parseArchive(archive, '<unknown>', {
      modules: Object.fromEntries(
        Object.keys(modules).map((specifier, index) => {
          // Replacing the namespace with an arbitrary index ensures that the
          // parse phase does not depend on the type or values of the exit module
          // set.
          return [specifier, index];
        }),
      ),
      Compartment,
    });
    const { namespace } = await application.import({
      globals,
      globalLexicals,
      modules,
      Compartment,
    });
    return namespace;
  });

  wrap(test, 'Archive')(
    `${name} / makeArchive / parseArchive with a prefix`,
    async t => {
      t.plan(fixtureAssertionCount);
      await setup();

      // Zip files support an arbitrary length prefix.
      const archive = await makeArchive(readPowers, fixture, {
        modules,
        dev: true,
      });
      const prefixArchive = new Uint8Array(archive.length + 10);
      prefixArchive.set(archive, 10);

      const application = await parseArchive(prefixArchive, '<unknown>', {
        modules,
        Compartment,
      });
      const { namespace } = await application.import({
        globals,
        globalLexicals,
        modules,
        Compartment,
      });
      return namespace;
    },
  );

  wrap(test, 'Archive')(`${name} / writeArchive / loadArchive`, async t => {
    t.plan(fixtureAssertionCount + (shouldFailBeforeArchiveOperations ? 0 : 2));
    await setup();

    // Single file slot.
    let archive;
    const fakeRead = async path => {
      t.is(path, 'app.agar');
      return archive;
    };
    const fakeWrite = async (path, content) => {
      t.is(path, 'app.agar');
      archive = content;
    };

    await writeArchive(fakeWrite, readPowers, 'app.agar', fixture, {
      modules: { builtin: true },
      dev: true,
    });
    const application = await loadArchive(fakeRead, 'app.agar', {
      modules,
      Compartment,
    });
    const { namespace } = await application.import({
      globals,
      globalLexicals,
      modules,
      Compartment,
    });
    return namespace;
  });

  wrap(test, 'Archive')(`${name} / writeArchive / importArchive`, async t => {
    t.plan(fixtureAssertionCount + (shouldFailBeforeArchiveOperations ? 0 : 2));
    await setup();

    // Single file slot.
    let archive;
    const fakeRead = async path => {
      t.is(path, 'app.agar');
      return archive;
    };
    const fakeWrite = async (path, content) => {
      t.is(path, 'app.agar');
      archive = content;
    };

    await writeArchive(fakeWrite, readPowers, 'app.agar', fixture, {
      modules,
      dev: true,
    });
    const { namespace } = await importArchive(fakeRead, 'app.agar', {
      globals,
      globalLexicals,
      modules,
      Compartment,
    });
    return namespace;
  });

  if (!onError) {
    test(`${name} / makeArchive / parseArchive / hashArchive consistency`, async t => {
      t.plan(1);
      await setup();

      const expectedSha512 = await hashLocation(readPowers, fixture, {
        modules,
        Compartment,
        dev: true,
      });

      const archiveBytes = await makeArchive(readPowers, fixture, {
        modules,
        dev: true,
      });

      const { computeSha512 } = readPowers;
      const { sha512: computedSha512 } = await parseArchive(
        archiveBytes,
        'memory:app.agar',
        {
          modules,
          dev: true,
          computeSha512,
          expectedSha512,
        },
      );

      t.is(computedSha512, expectedSha512);
    });

    test(`${name} / makeArchive / parseArchive, but with sha512 corruption of a compartment map`, async t => {
      t.plan(1);
      await setup();

      const expectedSha512 = await hashLocation(readPowers, fixture, {
        modules,
        dev: true,
      });

      const archive = await makeArchive(readPowers, fixture, {
        modules,
        dev: true,
      });

      const reader = new ZipReader(archive);
      const writer = new ZipWriter();
      writer.files = reader.files;
      // Corrupt compartment map
      writer.write('compartment-map.json', new TextEncoder().encode('{}'));
      const corruptArchive = writer.snapshot();

      const { computeSha512 } = readPowers;

      await t.throwsAsync(
        () =>
          parseArchive(corruptArchive, 'app.agar', {
            computeSha512,
            expectedSha512,
          }),
        {
          message: /compartment map failed a SHA-512 integrity check/,
        },
      );
    });
  }
}
