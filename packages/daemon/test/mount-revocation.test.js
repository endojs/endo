// @ts-check

// Establish a perimeter:
// eslint-disable-next-line import/order
import '@endo/init/debug.js';

import test from 'ava';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { E } from '@endo/eventual-send';
import { iterateReader } from '@endo/exo-stream/iterate-reader.js';
import { iterateBytesReader } from '@endo/exo-stream/iterate-bytes-reader.js';

import { makeFilePowers } from '../src/manager-node-powers.js';
import {
  makeMount,
  makeRevocableMount,
  defaultDeniedSegments,
} from '../src/mount.js';

/**
 * Unit tests for PR A of the #127 reconstruction: the mount revocation
 * caretaker (`makeRevocableMount` / `EndoMountControl`) and the
 * defense-in-depth deny-pattern set with its overridable `deniedSegments`
 * creation option. Each test drives `makeMount` / `makeRevocableMount`
 * directly against a real temp directory, mirroring the conformance suite,
 * so every branch is exercised in-process.
 */

const filePowers = makeFilePowers({ fs, path });

/**
 * @param {import('ava').ExecutionContext} t
 */
const makeTemporaryRoot = t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mount-revoke-'));
  t.teardown(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
};

/**
 * Materialize a fixture tree carrying both restricted names and an ordinary
 * dotfile, so a single mount exercises deny-throws, deny-hides, and the
 * dotfile-stays-accessible cases.
 *
 * @param {import('ava').ExecutionContext} t
 */
const makeDenyFixture = t => {
  const rootPath = makeTemporaryRoot(t);
  fs.mkdirSync(path.join(rootPath, '.ssh'));
  fs.writeFileSync(path.join(rootPath, '.ssh', 'id_rsa'), 'PRIVATE');
  fs.mkdirSync(path.join(rootPath, '.aws'));
  fs.writeFileSync(path.join(rootPath, '.aws', 'credentials'), 'SECRET');
  fs.writeFileSync(path.join(rootPath, '.env'), 'TOKEN=xyz');
  fs.writeFileSync(path.join(rootPath, '.gitignore'), 'node_modules\n');
  fs.writeFileSync(path.join(rootPath, 'README.md'), '# readme');
  fs.mkdirSync(path.join(rootPath, 'src'));
  fs.writeFileSync(path.join(rootPath, 'src', 'index.js'), 'export {};');
  return rootPath;
};

// Deny defaults.

test('default deny: naming a restricted segment in a path throws', async t => {
  const rootPath = makeDenyFixture(t);
  const mount = makeMount({ rootPath, readOnly: false, filePowers });

  await t.throwsAsync(() => E(mount).readText(['.ssh', 'id_rsa']), {
    message: /Access denied: .* is a restricted path/,
  });
  await t.throwsAsync(() => E(mount).lookup('.aws'), {
    message: /Access denied/,
  });
  await t.throwsAsync(() => E(mount).list('.ssh'), {
    message: /Access denied/,
  });
  await t.throwsAsync(() => E(mount).stat(['.env']), {
    message: /Access denied/,
  });
  await t.throwsAsync(() => E(mount).writeText(['.env'], 'nope'), {
    message: /Access denied/,
  });
});

test('default deny: matching is case-insensitive', async t => {
  const rootPath = makeTemporaryRoot(t);
  const mount = makeMount({ rootPath, readOnly: false, filePowers });
  await t.throwsAsync(() => E(mount).lookup('.SSH'), {
    message: /Access denied/,
  });
  await t.throwsAsync(() => E(mount).lookup('.Env'), {
    message: /Access denied/,
  });
});

test('default deny: list() hides restricted names but keeps ordinary dotfiles', async t => {
  const rootPath = makeDenyFixture(t);
  const mount = makeMount({ rootPath, readOnly: false, filePowers });
  const names = await E(mount).list();
  t.deepEqual(names, ['.gitignore', 'README.md', 'src']);
  t.false(names.includes('.ssh'));
  t.false(names.includes('.aws'));
  t.false(names.includes('.env'));
});

test('default deny: ordinary dotfiles remain accessible', async t => {
  const rootPath = makeDenyFixture(t);
  const mount = makeMount({ rootPath, readOnly: false, filePowers });
  t.is(await E(mount).readText(['.gitignore']), 'node_modules\n');
});

test('default deny: followNameChanges snapshot omits restricted names', async t => {
  const rootPath = makeDenyFixture(t);
  const mount = makeMount({ rootPath, readOnly: false, filePowers });
  const changes = iterateReader(await E(mount).followNameChanges());
  // The confined, non-denied entries are `.gitignore`, `README.md`, `src`
  // in sorted order; `.ssh`, `.aws`, `.env` never appear.
  const collected = [];
  for (let i = 0; i < 3; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const record = /** @type {any} */ ((await changes.next()).value);
    collected.push(record.add);
  }
  await changes.return();
  t.deepEqual(collected, ['.gitignore', 'README.md', 'src']);
  t.false(collected.includes('.ssh'));
  t.false(collected.includes('.env'));
});

test('default deny: entry() denies a restricted segment in string and array forms', async t => {
  const rootPath = makeDenyFixture(t);
  const mount = makeMount({ rootPath, readOnly: false, filePowers });
  // Both the slash-joined string form and the array form deny eagerly at
  // mint, so a restricted name never reaches an entry handle in the first
  // place — the two forms enforce identically.
  await t.throwsAsync(() => E(mount).entry('.ssh/id_rsa'), {
    message: /Access denied/,
  });
  await t.throwsAsync(() => E(mount).entry(['.ssh', 'id_rsa']), {
    message: /Access denied/,
  });
});

test('default deny: entry child() denies a restricted segment', async t => {
  const rootPath = makeDenyFixture(t);
  const mount = makeMount({ rootPath, readOnly: false, filePowers });
  const entry = await E(mount).entry('subdir');
  await t.throwsAsync(() => E(entry).child('.aws'), {
    message: /Access denied/,
  });
});

test('default deny: list() hides restricted names at depth, not only the root', async t => {
  const rootPath = makeTemporaryRoot(t);
  fs.mkdirSync(path.join(rootPath, 'nested'));
  fs.writeFileSync(path.join(rootPath, 'nested', '.env'), 'TOKEN=deep');
  fs.writeFileSync(path.join(rootPath, 'nested', 'keep.txt'), 'ok');
  const mount = makeMount({ rootPath, readOnly: false, filePowers });
  const names = await E(mount).list('nested');
  t.deepEqual(names, ['keep.txt']);
  t.false(names.includes('.env'));
});

test('defaultDeniedSegments is exported and contains the canonical names', t => {
  for (const name of ['.ssh', '.aws', '.env', '.gnupg', '.npmrc', '.kube']) {
    t.true(
      defaultDeniedSegments.includes(name),
      `defaultDeniedSegments should include ${name}`,
    );
  }
});

// Overridable deny set.

test('override: a custom set replaces the default (custom names denied)', async t => {
  const rootPath = makeTemporaryRoot(t);
  fs.mkdirSync(path.join(rootPath, 'secret'));
  fs.writeFileSync(path.join(rootPath, 'secret', 'x'), 'S');
  const mount = makeMount({
    rootPath,
    readOnly: false,
    filePowers,
    deniedSegments: ['secret'],
  });
  await t.throwsAsync(() => E(mount).lookup('secret'), {
    message: /Access denied/,
  });
});

test('override: defaults are inert when a custom set is supplied', async t => {
  const rootPath = makeDenyFixture(t);
  const mount = makeMount({
    rootPath,
    readOnly: false,
    filePowers,
    // Replaces the default; `.ssh` is no longer denied under this set.
    deniedSegments: ['secret'],
  });
  t.is(await E(mount).readText(['.ssh', 'id_rsa']), 'PRIVATE');
  t.true((await E(mount).list()).includes('.ssh'));
});

test('override: an empty set disables denial entirely', async t => {
  const rootPath = makeDenyFixture(t);
  const mount = makeMount({
    rootPath,
    readOnly: false,
    filePowers,
    deniedSegments: [],
  });
  t.is(await E(mount).readText(['.env']), 'TOKEN=xyz');
  const names = await E(mount).list();
  t.true(names.includes('.ssh'));
  t.true(names.includes('.env'));
});

test('override: callers extend the default by spreading defaultDeniedSegments', async t => {
  const rootPath = makeDenyFixture(t);
  fs.mkdirSync(path.join(rootPath, 'extra'));
  const mount = makeMount({
    rootPath,
    readOnly: false,
    filePowers,
    deniedSegments: [...defaultDeniedSegments, 'extra'],
  });
  // The extension denies `extra`...
  await t.throwsAsync(() => E(mount).lookup('extra'), {
    message: /Access denied/,
  });
  // ...while the spread preserved the defaults.
  await t.throwsAsync(() => E(mount).lookup('.ssh'), {
    message: /Access denied/,
  });
});

// Revocation.

test('revocation: control.revoke() trips the root mount', async t => {
  const rootPath = makeTemporaryRoot(t);
  const { mount, control } = makeRevocableMount({
    rootPath,
    readOnly: false,
    filePowers,
  });
  await E(mount).writeText(['a.txt'], 'live');
  t.is(await E(mount).readText(['a.txt']), 'live');

  E(control).revoke();

  await t.throwsAsync(() => E(mount).readText(['a.txt']), {
    message: /Mount has been revoked/,
  });
  await t.throwsAsync(() => E(mount).list(), {
    message: /Mount has been revoked/,
  });
  await t.throwsAsync(() => E(mount).has('a.txt'), {
    message: /Mount has been revoked/,
  });
  await t.throwsAsync(() => E(mount).writeText(['b.txt'], 'x'), {
    message: /Mount has been revoked/,
  });
  await t.throwsAsync(() => E(mount).lookup('a.txt'), {
    message: /Mount has been revoked/,
  });
});

test('revocation: propagates to a subView taken before revoke', async t => {
  const rootPath = makeTemporaryRoot(t);
  const { mount, control } = makeRevocableMount({
    rootPath,
    readOnly: false,
    filePowers,
  });
  await E(mount).makeDirectory(['sub']);
  await E(mount).writeText(['sub', 'leaf.txt'], 'in-sub');
  const sub = await E(mount).subView('sub');
  t.is(await E(sub).readText(['leaf.txt']), 'in-sub');

  E(control).revoke();

  await t.throwsAsync(() => E(sub).readText(['leaf.txt']), {
    message: /Mount has been revoked/,
  });
});

test('revocation: propagates to a file handle opened before revoke', async t => {
  const rootPath = makeTemporaryRoot(t);
  const { mount, control } = makeRevocableMount({
    rootPath,
    readOnly: false,
    filePowers,
  });
  await E(mount).writeText(['file.txt'], 'contents');
  const file = await E(mount).lookup('file.txt');
  t.is(await E(file).text(), 'contents');

  E(control).revoke();

  await t.throwsAsync(() => E(file).text(), {
    message: /Mount has been revoked/,
  });
  await t.throwsAsync(() => E(file).stat(), {
    message: /Mount has been revoked/,
  });
});

test('revocation: a base64 file stream refuses on a revoked mount', async t => {
  const rootPath = makeTemporaryRoot(t);
  const { mount, control } = makeRevocableMount({
    rootPath,
    readOnly: false,
    filePowers,
  });
  await E(mount).writeText(['file.txt'], 'streaming-contents');
  const file = await E(mount).lookup('file.txt');

  E(control).revoke();

  // `streamBase64` is liveness-gated like every other file face; its read
  // loop also re-checks liveness per chunk so a revoke mid-read stops
  // delivering the remaining bytes rather than draining the file.
  const reader = iterateBytesReader(/** @type {any} */ (file));
  await t.throwsAsync(() => reader.next(), {
    message: /Mount has been revoked/,
  });
  await reader.return?.(undefined).catch(() => {});
});

test('revocation: propagates to an entry minted before revoke', async t => {
  const rootPath = makeTemporaryRoot(t);
  const { mount, control } = makeRevocableMount({
    rootPath,
    readOnly: false,
    filePowers,
  });
  const entry = await E(mount).entry('a/b.txt');
  t.deepEqual(await E(entry).segments(), ['a', 'b.txt']);

  E(control).revoke();

  await t.throwsAsync(() => E(entry).segments(), {
    message: /Mount has been revoked/,
  });
  await t.throwsAsync(() => E(entry).child('c'), {
    message: /Mount has been revoked/,
  });
});

test('revocation: propagates to a readOnly() view taken before revoke', async t => {
  const rootPath = makeTemporaryRoot(t);
  const { mount, control } = makeRevocableMount({
    rootPath,
    readOnly: false,
    filePowers,
  });
  await E(mount).writeText(['file.txt'], 'data');
  const view = await E(mount).readOnly();
  t.true(await E(view).has('file.txt'));

  E(control).revoke();

  await t.throwsAsync(() => E(view).has('file.txt'), {
    message: /Mount has been revoked/,
  });
  await t.throwsAsync(() => E(view).list(), {
    message: /Mount has been revoked/,
  });
});

test('revocation: calling followNameChanges on a revoked mount fails', async t => {
  const rootPath = makeTemporaryRoot(t);
  const { mount, control } = makeRevocableMount({
    rootPath,
    readOnly: false,
    filePowers,
  });
  await E(mount).writeText(['a.txt'], 'a');
  E(control).revoke();
  await t.throwsAsync(() => E(mount).followNameChanges(), {
    message: /Mount has been revoked/,
  });
});

test('revocation: an open followNameChanges stream fails after revoke', async t => {
  const rootPath = makeTemporaryRoot(t);
  const { mount, control } = makeRevocableMount({
    rootPath,
    readOnly: false,
    filePowers,
  });
  await E(mount).writeText(['alpha.txt'], 'a');
  // `iterateReader` adapts the mount's reader into a standard async iterator
  // so the mid-stream revoke lands on the generator's own event loop.
  const reader = iterateReader(await E(mount).followNameChanges());
  const first = /** @type {any} */ ((await reader.next()).value);
  t.is(first.add, 'alpha.txt');

  E(control).revoke();
  // Revocation wakes the parked stream directly: the generator races each
  // event pull against the revocation signal, so the open stream fails
  // promptly on revoke without waiting for the directory to change.
  await t.throwsAsync(() => reader.next(), {
    message: /Mount has been revoked/,
  });
  await reader.return?.(undefined).catch(() => {});
});

test('revocation: revoke() is idempotent', async t => {
  const rootPath = makeTemporaryRoot(t);
  const { mount, control } = makeRevocableMount({
    rootPath,
    readOnly: false,
    filePowers,
  });
  E(control).revoke();
  await E(control).revoke();
  await t.throwsAsync(() => E(mount).list(), {
    message: /Mount has been revoked/,
  });
});

test('revocation: a plain makeMount is never revoked (no revocation record)', async t => {
  const rootPath = makeTemporaryRoot(t);
  const mount = makeMount({ rootPath, readOnly: false, filePowers });
  await E(mount).writeText(['a.txt'], 'a');
  // No control facet exists; the mount stays live indefinitely.
  t.is(await E(mount).readText(['a.txt']), 'a');
});

// Deny and revocation compose.

test('deny and revocation are both active on a revocable mount', async t => {
  const rootPath = makeDenyFixture(t);
  // Carry a novel segment (`vault`) alongside the defaults so this test
  // proves the supplied deny set is actually applied, rather than passively
  // matching whatever the defaults happen to be.
  fs.mkdirSync(path.join(rootPath, 'vault'));
  fs.writeFileSync(path.join(rootPath, 'vault', 'key'), 'SECRET');
  const { mount, control } = makeRevocableMount({
    rootPath,
    readOnly: false,
    filePowers,
    deniedSegments: [...defaultDeniedSegments, 'vault'],
  });
  // Deny is enforced while live: both a default segment...
  await t.throwsAsync(() => E(mount).lookup('.ssh'), {
    message: /Access denied/,
  });
  // ...and the novel segment unique to this custom set, which the defaults
  // alone would not deny.
  await t.throwsAsync(() => E(mount).lookup('vault'), {
    message: /Access denied/,
  });
  t.is(await E(mount).readText(['README.md']), '# readme');

  E(control).revoke();
  // After revoke, an unrestricted path reports revocation. (A restricted
  // path also stays inaccessible, throwing at whichever gate it reaches
  // first — both are denials, so their precedence is unspecified.)
  await t.throwsAsync(() => E(mount).readText(['README.md']), {
    message: /Mount has been revoked/,
  });
  await t.throwsAsync(() => E(mount).lookup('.ssh'), {
    message: /Access denied|Mount has been revoked/,
  });
});
