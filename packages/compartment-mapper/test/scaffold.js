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

export const readPowers = makeReadPowers({
  fs,
  crypto,
  url,
});

export const sanitizePaths = (text = '', tolerateLineChange = false) => {
  if (tolerateLineChange) {
    text = text.replace(/:[0-9]+:[0-9]+/g, ':…');
  }
  return text.replace(/file:\/\/[^'"\n]+\/packages\//g, 'file://.../');
};
const compartmentInstrumentationFactory = () => {
  const compartments = [];

  const InstrumentedCompartment = function InstrumentedCompartment() {
    // eslint-disable-next-line prefer-rest-params
    const compartment = Reflect.construct(Compartment, arguments);
    compartments.push(compartment);
    return compartment;
  };

  return {
    getCompartments: () => compartments,
    Compartment: InstrumentedCompartment,
  };
};

const globals = {
  // process: { _rawDebug: process._rawDebug }, // useful for debugging
  globalProperty: 42,
  TextEncoder,
  TextDecoder,
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
  await null;
  if (modules === undefined) {
    const utility = await loadLocation(readPowers, builtinLocation);
    const { namespace } = await utility.import({ globals });
    // We pass the builtin module into the module map.
    modules = {
      builtin: namespace,
    };
  }
  return { modules, globals };
}

export function scaffold(
  name,
  test,
  fixture,
  assertFixture,
  fixtureAssertionCount,
  {
    onError,
    shouldFailBeforeArchiveOperations = false,
    addGlobals = {},
    policy,
    knownFailure = false,
    tags = undefined,
    conditions = tags,
    searchSuffixes = undefined,
    commonDependencies = undefined,
    additionalOptions = {},
  } = {},
) {
  // wrapping each time allows for convenient use of test.only
  const wrap = (testFunc, testCategoryHint) => (title, implementation) => {
    // mark as known failure if available (but fallback to support test.only)
    if (knownFailure) {
      testFunc = testFunc.failing || testFunc;
    }
    return testFunc(title, async t => {
      await null;
      const compartmentInstrumentation = compartmentInstrumentationFactory();
      let namespace;
      try {
        namespace = await implementation(
          t,
          compartmentInstrumentation.Compartment,
        );
      } catch (error) {
        if (onError) {
          return onError(t, { error, title });
        }
        throw error;
      }
      return assertFixture(t, {
        compartments: compartmentInstrumentation.getCompartments(),
        namespace,
        globals: { ...globals, ...addGlobals },
        policy,
        testCategoryHint,
      });
    });
  };

  wrap(test, 'Location')(`${name} / loadLocation`, async (t, Compartment) => {
    t.plan(fixtureAssertionCount);
    await setup();

    const application = await loadLocation(readPowers, fixture, {
      dev: true,
      policy,
      conditions,
      searchSuffixes,
      commonDependencies,
      ...additionalOptions,
    });
    const { namespace } = await application.import({
      globals: { ...globals, ...addGlobals },
      modules,
      Compartment,
      ...additionalOptions,
    });
    return namespace;
  });

  wrap(test, 'Location')(`${name} / importLocation`, async (t, Compartment) => {
    t.plan(fixtureAssertionCount);
    await setup();

    const { namespace } = await importLocation(readPowers, fixture, {
      globals: { ...globals, ...addGlobals },
      policy,
      modules,
      Compartment,
      dev: true,
      conditions,
      searchSuffixes,
      commonDependencies,
      ...additionalOptions,
    });
    return namespace;
  });

  wrap(test, 'Archive')(
    `${name} / makeArchive / parseArchive`,
    async (t, Compartment) => {
      t.plan(fixtureAssertionCount);
      await setup();

      const archive = await makeArchive(readPowers, fixture, {
        modules,
        dev: true,
        policy,
        conditions,
        searchSuffixes,
        commonDependencies,
        ...additionalOptions,
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
        globals: { ...globals, ...addGlobals },
        modules,
        Compartment,
        ...additionalOptions,
      });
      return namespace;
    },
  );

  wrap(test, 'Archive')(
    `${name} / makeArchive / parseArchive with a prefix`,
    async (t, Compartment) => {
      t.plan(fixtureAssertionCount);
      await setup();

      // Zip files support an arbitrary length prefix.
      const archive = await makeArchive(readPowers, fixture, {
        modules,
        dev: true,
        policy,
        conditions,
        searchSuffixes,
        commonDependencies,
        ...additionalOptions,
      });
      const prefixArchive = new Uint8Array(archive.length + 10);
      prefixArchive.set(archive, 10);

      const application = await parseArchive(prefixArchive, '<unknown>', {
        modules,
        Compartment,
      });
      const { namespace } = await application.import({
        globals: { ...globals, ...addGlobals },
        modules,
        Compartment,
        ...additionalOptions,
      });
      return namespace;
    },
  );

  wrap(test, 'Archive')(
    `${name} / writeArchive / loadArchive`,
    async (t, Compartment) => {
      t.plan(
        fixtureAssertionCount + (shouldFailBeforeArchiveOperations ? 0 : 2),
      );
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
        policy,
        conditions,
        searchSuffixes,
        commonDependencies,
        ...additionalOptions,
      });
      const application = await loadArchive(fakeRead, 'app.agar', {
        modules,
        Compartment,
      });
      const { namespace } = await application.import({
        globals: { ...globals, ...addGlobals },
        modules,
        Compartment,
        ...additionalOptions,
      });
      return namespace;
    },
  );

  wrap(test, 'Archive')(
    `${name} / writeArchive / importArchive`,
    async (t, Compartment) => {
      t.plan(
        fixtureAssertionCount + (shouldFailBeforeArchiveOperations ? 0 : 2),
      );
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

      const sourceMaps = new Set();
      const sourceMapHook = (sourceMap, { sha512 }) => {
        sourceMaps.add(sha512);
        t.log(sha512, sourceMap);
      };

      const computeSourceMapLocation = ({ sha512 }) => {
        sourceMaps.delete(sha512);
        return `${sha512}.map.json`;
      };

      await writeArchive(fakeWrite, readPowers, 'app.agar', fixture, {
        policy,
        modules,
        dev: true,
        conditions,
        searchSuffixes,
        commonDependencies,
        sourceMapHook,
        ...additionalOptions,
      });

      const { namespace } = await importArchive(fakeRead, 'app.agar', {
        globals: { ...globals, ...addGlobals },
        modules,
        Compartment,
        computeSourceMapLocation,
        ...additionalOptions,
      });

      // An assertion here would disrupt the planned assertion count
      // in a way that is difficult to generalize since not all test paths
      // reach here.
      if (sourceMaps.size !== 0) {
        throw new Error(
          'The bundler and importer should agree on source map count',
        );
      }

      return namespace;
    },
  );

  if (!onError) {
    test(`${name} / makeArchive / parseArchive / hashArchive consistency`, async (t, Compartment) => {
      t.plan(1);
      await setup();

      const expectedSha512 = await hashLocation(readPowers, fixture, {
        modules,
        Compartment,
        dev: true,
        conditions,
        searchSuffixes,
        commonDependencies,
        ...additionalOptions,
      });

      const archiveBytes = await makeArchive(readPowers, fixture, {
        modules,
        dev: true,
        conditions,
        searchSuffixes,
        commonDependencies,
        ...additionalOptions,
      });

      const { computeSha512 } = readPowers;
      const { sha512: computedSha512 } = await parseArchive(
        archiveBytes,
        'memory:app.agar',
        {
          modules,
          dev: true,
          conditions,
          computeSha512,
          expectedSha512,
          ...additionalOptions,
        },
      );

      t.is(computedSha512, expectedSha512);
    });

    test(`${name} / makeArchive / parseArchive, but with sha512 corruption of a compartment map`, async (t, Compartment) => {
      t.plan(1);
      await setup();

      const expectedSha512 = await hashLocation(readPowers, fixture, {
        modules,
        Compartment,
        dev: true,
        conditions,
        searchSuffixes,
        commonDependencies,
        ...additionalOptions,
      });

      const archive = await makeArchive(readPowers, fixture, {
        modules,
        dev: true,
        conditions,
        searchSuffixes,
        commonDependencies,
        ...additionalOptions,
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
            ...additionalOptions,
          }),
        {
          message: /compartment map failed a SHA-512 integrity check/,
        },
      );
    });
  }
}

// Modifies the given object to make it appear to be an ESM module namespace object.
export const moduleify = obj => {
  Object.defineProperty(obj, Symbol.toStringTag, {
    value: 'Module',
    writable: false,
    enumerable: false,
    configurable: false,
  });
  return Object.setPrototypeOf(obj, null);
};
