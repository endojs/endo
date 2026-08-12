import 'ses';

import test from 'ava';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

import { importLocation } from '../src/import.js';
import { makeReadPowers, makeReadNowPowers } from '../src/node-powers.js';
import { scaffold } from './scaffold.js';

/**
 * @import {ReadNowPowers, ReadPowers} from '../src/types.js';
 */

const fixture = new URL(
  'fixtures-dynamic-import-esm/node_modules/app/index.js',
  import.meta.url,
).toString();

// foo.js's default export is an object, not a primitive, so that
// reference-identity assertions below actually prove two specifiers resolved
// to the same module instance rather than merely to equal-by-value results.
const FOO = { foo: 'foo' };

// readPowers without sync powers — enough for ESM-only scenarios
const readPowers = makeReadPowers({ fs, url });
// these are for testing dynamic imports of absolute paths and file: URLs
const readNowPowers = makeReadNowPowers({ fs, url, path });

scaffold(
  'fixtures-dynamic-import-esm',
  test,
  fixture,
  async (t, { namespace }) => {
    // @ts-expect-error - untyped
    const foo = await namespace.getFoo();
    t.deepEqual(foo, FOO);
  },
  1,
  {
    knownArchiveFailure: true,
  },
);

scaffold(
  'fixtures-dynamic-import-esm-noNamespaceBox',
  test,
  fixture,
  async (t, { namespace }) => {
    // @ts-expect-error - untyped
    const foo = await namespace.getFoo();
    t.deepEqual(foo, FOO);
  },
  1,
  {
    knownArchiveFailure: true,
    additionalOptions: {
      Compartment: class extends Compartment {
        constructor(options = {}) {
          super({ ...options, __noNamespaceBox__: true });
        }
      },
    },
  },
);

/**
 * Import the app fixture and call getDynamic with the given specifier.
 * @param {ReadPowers | ReadNowPowers} powers
 * @param {string} specifier
 * @returns {Promise<unknown>}
 */
const runDynamic = async (powers, specifier) => {
  const { namespace } = await importLocation(powers, fixture, {});
  return /** @type {any} */ (namespace).getDynamic(specifier);
};

test('dynamic import: relative specifier ./foo.js', async t => {
  const result = await runDynamic(readPowers, './foo.js');
  t.deepEqual(result, FOO);
});

test('dynamic import: relative nested specifier ./lib/bar.js', async t => {
  // lib/bar.js is within the app compartment; referrer is app/index.js.
  const result = await runDynamic(readPowers, './lib/bar.js');
  t.is(result, 'bar');
});

test('dynamic import: bare package name dep', async t => {
  const result = await runDynamic(readPowers, 'dep');
  t.is(result, 'dep-default');
});

test('dynamic import: bare package subpath dep/other.js', async t => {
  const result = await runDynamic(readPowers, 'dep/other.js');
  t.is(result, 'dep-other');
});

test('dynamic import: undeclared bare package throws', async t => {
  // 'not-a-dep' is not in app's dependency graph; must not resolve.
  await t.throwsAsync(() => runDynamic(readPowers, 'not-a-dep'));
});

test('dynamic import: absolute path within compartment', async t => {
  const appDir = readNowPowers.fileURLToPath(
    new URL('fixtures-dynamic-import-esm/node_modules/app/', import.meta.url)
      .href,
  );
  const absoluteFoo = path.join(appDir, 'foo.js');
  const result = await runDynamic(readNowPowers, absoluteFoo);
  t.deepEqual(result, FOO);
});

test('dynamic import: absolute path cross-compartment without policy throws Could not import', async t => {
  // findRedirect throws "Could not import module" when there is no policy
  // permitting the cross-compartment access.
  const depDir = readNowPowers.fileURLToPath(
    new URL('fixtures-dynamic-import-esm/node_modules/dep/', import.meta.url)
      .href,
  );
  const absoluteDep = path.join(depDir, 'index.js');
  await t.throwsAsync(() => runDynamic(readNowPowers, absoluteDep), {
    message: /Could not import/,
  });
});

test('dynamic import: file: URL within compartment', async t => {
  // file:// URLs need no sync powers — packageLocation is itself a file: URL
  // and all resolution is pure URL arithmetic.
  const fileUrl = new URL(
    'fixtures-dynamic-import-esm/node_modules/app/foo.js',
    import.meta.url,
  ).href;
  const result = await runDynamic(readPowers, fileUrl);
  t.deepEqual(result, FOO);
});

test('dynamic import: file: URL cross-compartment without policy throws Could not import', async t => {
  // findRedirect throws "Could not import module" when there is no policy.
  const fileUrl = new URL(
    'fixtures-dynamic-import-esm/node_modules/dep/index.js',
    import.meta.url,
  ).href;
  await t.throwsAsync(() => runDynamic(readPowers, fileUrl), {
    message: /Could not import/,
  });
});

test('dynamic import: file: URL and relative specifier share the same module instance', async t => {
  // Both spellings should resolve to the same module record, so their
  // namespaces are reference-identical.
  const fileUrl = new URL(
    'fixtures-dynamic-import-esm/node_modules/app/foo.js',
    import.meta.url,
  ).href;
  const { namespace } = await importLocation(readPowers, fixture, {});
  const ns = /** @type {any} */ (namespace);
  const nsFromRelative = await ns.getDynamic('./foo.js');
  const nsFromFileUrl = await ns.getDynamic(fileUrl);
  t.is(nsFromRelative, nsFromFileUrl);
});

test('dynamic import: absolute path and relative specifier share the same module instance', async t => {
  const appDir = readNowPowers.fileURLToPath(
    new URL('fixtures-dynamic-import-esm/node_modules/app/', import.meta.url)
      .href,
  );
  const absoluteFoo = path.join(appDir, 'foo.js');
  const { namespace } = await importLocation(readNowPowers, fixture, {});
  const ns = /** @type {any} */ (namespace);
  const nsFromRelative = await ns.getDynamic('./foo.js');
  const nsFromAbsolute = await ns.getDynamic(absoluteFoo);
  t.is(nsFromRelative, nsFromAbsolute);
});

/** The absolute path of `foo.js` inside the app fixture compartment. */
const absoluteFooPath = () =>
  path.join(
    readNowPowers.fileURLToPath(
      new URL('fixtures-dynamic-import-esm/node_modules/app/', import.meta.url)
        .href,
    ),
    'foo.js',
  );

test('dynamic import: absolute path falls through to the exit-module handler when isAbsolute is a stub', async t => {
  // Omitting `path` from makeReadPowers substitutes a stub isAbsolute that
  // always answers false, so no specifier is ever recognized as a location —
  // even though this powers object does supply pathToFileURL. Absolute paths
  // are therefore gated on `path`, not merely on `pathToFileURL`.
  const powers = makeReadPowers({ fs, url });
  t.is(powers.isAbsolute?.('/definitely/absolute.js'), false);

  await t.throwsAsync(() => runDynamic(powers, absoluteFooPath()), {
    message: /Cannot find external module/,
  });
});

test('dynamic import: absolute POSIX path resolves without pathToFileURL', async t => {
  // A leading slash resolves against the root under plain URL arithmetic, so
  // the conversion needs no power. Dropping pathToFileURL leaves POSIX
  // absolute paths working; only non-slash forms (Windows) require it.
  const { pathToFileURL: _dropped, ...powers } = makeReadNowPowers({
    fs,
    url,
    path,
  });
  const result = await runDynamic(
    /** @type {any} */ (powers),
    absoluteFooPath(),
  );
  t.deepEqual(result, FOO);
});

test('dynamic import: file: URL succeeds with bare read-only readPowers (no sync powers)', async t => {
  // file:// URLs require zero additional powers beyond the standard read power.
  const fileUrl = new URL(
    'fixtures-dynamic-import-esm/node_modules/app/foo.js',
    import.meta.url,
  ).href;
  const result = await runDynamic(readPowers, fileUrl);
  t.deepEqual(result, FOO);
});

// A Windows path such as `C:\dir\mod.js` has no leading slash, so it is
// syntactically indistinguishable from a bare package specifier. Recognizing
// one therefore requires `isAbsolute` from readPowers, and converting it to a
// URL requires `pathToFileURL`.
//
// Node supplies neither in a Windows flavor when the host is POSIX: `node:path`
// is `path.posix` (so `isAbsolute('C:\\x')` is false), and while
// `url.pathToFileURL` accepts a `windows` option, the default resolves such a
// path against cwd. The tests below inject win32-flavored powers so the
// Windows branch can be exercised on any host.

const WINDOWS_ABSOLUTE_SPECIFIER = 'C:\\Users\\me\\app\\foo.js';

/**
 * A win32-flavored `pathToFileURL`. Node's own conversion does the work; the
 * `windows` option is not reflected in the `ReadPowers` signature, so this
 * wrapper both applies it and restores the expected arity.
 *
 * The resulting drive letter is then dropped, so the fake drive `C:` behaves
 * as though mounted at the POSIX root. That fiction lets a test address the
 * real fixture directory by its Windows spelling.
 *
 * @param {string} filePath
 * @returns {URL}
 */
const win32PathToFileURL = filePath =>
  new URL(
    url
      .pathToFileURL(filePath, { windows: true })
      .href.replace(/^file:\/\/\/[A-Za-z]:\//, 'file:///'),
  );

/**
 * Spells a POSIX path the way a Windows host would, as the inverse of the
 * drive-letter fiction above.
 *
 * @param {string} posixPath
 * @returns {string}
 */
const asWindowsPath = posixPath => `C:${posixPath.replace(/\//g, '\\')}`;

/** readPowers presenting a Windows-like platform to importHook. */
const win32Powers = {
  ...makeReadNowPowers({ fs, url, path }),
  isAbsolute: path.win32.isAbsolute,
  pathToFileURL: win32PathToFileURL,
};

test('dynamic import: Windows absolute path within compartment resolves', async t => {
  const appDir = readNowPowers.fileURLToPath(
    new URL('fixtures-dynamic-import-esm/node_modules/app/', import.meta.url)
      .href,
  );
  const windowsFoo = asWindowsPath(path.join(appDir, 'foo.js'));
  t.regex(windowsFoo, /^C:\\/);

  const result = await runDynamic(win32Powers, windowsFoo);
  t.deepEqual(result, FOO);
});

test('dynamic import: Windows absolute path is recognized as a location, not a package name', async t => {
  // A Windows path pointing outside any compartment reaches findRedirect,
  // which walks to the filesystem root and reports an unknown module. The
  // distinct error proves the specifier was treated as a location rather than
  // falling through to the exit-module branch as a bare package name.
  await t.throwsAsync(
    () => runDynamic(win32Powers, WINDOWS_ABSOLUTE_SPECIFIER),
    { message: /Could not import unknown module/ },
  );
});

test('dynamic import: Windows absolute falls through to exit module hook without a Windows-aware isAbsolute', async t => {
  // On a POSIX host node:path is path.posix, which does not recognize drive
  // letters, so the specifier is indistinguishable from a package name and
  // falls through to the exit module hook.
  t.false(path.isAbsolute(WINDOWS_ABSOLUTE_SPECIFIER));
  t.true(path.win32.isAbsolute(WINDOWS_ABSOLUTE_SPECIFIER));

  await t.throwsAsync(
    () => runDynamic(readNowPowers, WINDOWS_ABSOLUTE_SPECIFIER),
    { message: /Cannot find external module/ },
  );
});
