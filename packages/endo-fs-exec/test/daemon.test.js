// @ts-nocheck
/* global process */

// End-to-end: spin a real Endo daemon, mount a project directory as
// an endo-fs Filesystem cap, wrap it in this package's tree-view,
// then run the program via the daemon's `make-from-tree` formula
// and assert the returned exo behaves as the fixture defines.
//
// Daemon tests are serial because each one forks a full daemon
// process and shares the filesystem under `test/tmp`.

// eslint-disable-next-line import/order
import '@endo/init/debug.js';

import test from 'ava';
import path from 'path';
import fs from 'fs';
import url from 'url';
import crypto from 'crypto';
import { createRequire } from 'module';
import { E } from '@endo/far';
import { makePromiseKit } from '@endo/promise-kit';
import { makeArchive as makeCompartmentArchive } from '@endo/compartment-mapper';
import { makeReadPowers } from '@endo/compartment-mapper/node-powers.js';
import { defaultParserForLanguage as sourceParserForLanguage } from '@endo/compartment-mapper/import-parsers.js';
import { ZipReader } from '@endo/zip/reader.js';
import { start, stop, purge, makeEndoClient } from '@endo/daemon';

const dirname = url.fileURLToPath(new URL('.', import.meta.url));
const require = createRequire(import.meta.url);

const archiveReadPowers = makeReadPowers({ fs, url, crypto, path });

const treeViewModuleHref = url.pathToFileURL(
  path.join(dirname, '..', 'src', 'tree-view-module.js'),
).href;

const nodeFsModuleHref = url.pathToFileURL(
  require.resolve('@endo/endo-fs/src/node-fs-module.js'),
).href;

let testCounter = 0;

/**
 * Build a fresh daemon config under `test/tmp/NNNN/`. Paths are kept
 * short because the Unix-domain socket path length is bounded
 * (sockaddr_un sun_path ~108 bytes on Linux).
 */
const makeConfig = () => {
  testCounter += 1;
  const tag = String(testCounter).padStart(4, '0');
  const base = path.join(dirname, 'tmp', tag);
  return {
    statePath: path.join(base, 'state'),
    ephemeralStatePath: path.join(base, 'run'),
    cachePath: path.join(base, 'cache'),
    sockPath:
      process.platform === 'win32'
        ? `\\\\?\\pipe\\endo-fs-exec-${tag}.sock`
        : path.join(base, 'endo.sock'),
    address: '127.0.0.1:0',
    pets: new Map(),
    values: new Map(),
  };
};

const prepareHost = async t => {
  const config = makeConfig();
  const { reject: cancel, promise: cancelled } = makePromiseKit();
  cancelled.catch(() => {});

  await purge(config);
  await start(config);
  t.teardown(async () => {
    cancel(new Error('test teardown'));
    await stop(config).catch(() => {});
  });

  const { getBootstrap, closed } = await makeEndoClient(
    'client',
    config.sockPath,
    cancelled,
  );
  closed.catch(() => {});

  const bootstrap = getBootstrap();
  const host = E(bootstrap).host();
  return { host, config };
};

/**
 * Pack a Node package directory (with `package.json` + `index.js`)
 * into a compartment-mapper archive and unzip into `targetDir`. The
 * resulting layout — `compartment-map.json` at the root plus per-
 * module sources at their referenced paths — is exactly what
 * `make-from-tree` expects to read through our tree-view.
 */
const unpackFixtureTree = async (packageDir, targetDir) => {
  const moduleLocation = url.pathToFileURL(packageDir).href;
  const archiveBytes = await makeCompartmentArchive(
    archiveReadPowers,
    moduleLocation,
    { parserForLanguage: sourceParserForLanguage },
  );
  const reader = new ZipReader(archiveBytes);
  fs.mkdirSync(targetDir, { recursive: true });
  for (const [archivePath, file] of reader.files) {
    const fullPath = path.join(targetDir, archivePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, file.content);
  }
};

test.serial(
  'end-to-end: endo-fs filesystem → tree-view → make-from-tree → exo',
  async t => {
    t.timeout(90_000);
    const { host, config } = await prepareHost(t);

    // 1. Stage the fixture as a compartment-mapper-shaped tree on disk
    //    so endo-fs can mount it.
    const sourceDir = path.join(dirname, 'fixtures', 'env-echo');
    const treeDir = path.join(config.statePath, '..', 'tree-fixture');
    await unpackFixtureTree(sourceDir, treeDir);

    // 2. Make an endo-fs Filesystem cap rooted at treeDir.
    await E(host).makeUnconfined('@node', nodeFsModuleHref, {
      powersName: '@none',
      env: { ENDO_FS_ROOT: treeDir },
      resultName: 'workspace-fs',
    });

    // 3. Adapt that Filesystem to make-from-tree's shape via the
    //    new tree-view module.
    await E(host).makeUnconfined('@node', treeViewModuleHref, {
      powersName: 'workspace-fs',
      resultName: 'tree-view',
    });

    // 4. Run the program through the existing make-from-tree
    //    formula. The fixture's `make()` returns an exo that echoes
    //    env, which becomes the formula value.
    const exo = await E(host).makeFromTree(undefined, 'tree-view', {
      powersName: '@none',
      env: { HELLO: 'endo-fs-exec' },
    });

    t.is(await E(exo).getEnvVar('HELLO'), 'endo-fs-exec');
  },
);

test.serial(
  'subPath: tree-view rebases lookups into a sub-directory of the filesystem',
  async t => {
    t.timeout(90_000);
    const { host, config } = await prepareHost(t);

    // Stage the fixture under `apps/widget/` inside the mounted
    // root, then point ENDO_FS_TREE_LOCATION at it.
    const sourceDir = path.join(dirname, 'fixtures', 'env-echo');
    const rootDir = path.join(config.statePath, '..', 'tree-fixture-rooted');
    await unpackFixtureTree(sourceDir, path.join(rootDir, 'apps', 'widget'));

    await E(host).makeUnconfined('@node', nodeFsModuleHref, {
      powersName: '@none',
      env: { ENDO_FS_ROOT: rootDir },
      resultName: 'workspace-fs',
    });

    await E(host).makeUnconfined('@node', treeViewModuleHref, {
      powersName: 'workspace-fs',
      env: { ENDO_FS_TREE_LOCATION: 'apps/widget' },
      resultName: 'widget-tree',
    });

    const exo = await E(host).makeFromTree(undefined, 'widget-tree', {
      powersName: '@none',
      env: { WHO: 'widget' },
    });

    t.is(await E(exo).getEnvVar('WHO'), 'widget');
  },
);
