// @ts-nocheck

/**
 * `makeLocalTree` tests — the host-directory ReadableTree now also exposes
 * the recursive `listTree`. See designs/platform-range-and-tree-reads.md.
 */

import '@endo/init/debug.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import test from 'ava';
import { E } from '@endo/eventual-send';

import { makeLocalTree } from '../src/fs-node/local-tree.js';

// Build a directory tree under a fresh temp dir and return its path.
const makeTempTree = t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'local-tree-'));
  t.teardown(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, 'top.txt'), 'top');
  fs.mkdirSync(path.join(dir, 'sub'));
  fs.writeFileSync(path.join(dir, 'sub', 'a.txt'), 'a');
  fs.mkdirSync(path.join(dir, 'sub', 'nested'));
  fs.writeFileSync(path.join(dir, 'sub', 'nested', 'deep.txt'), 'deep');
  fs.mkdirSync(path.join(dir, 'sub', 'nested', '.git')); // always ignored
  fs.writeFileSync(path.join(dir, 'sub', 'nested', '.git', 'HEAD'), 'ref');
  return dir;
};

test('LocalTree.list stays shallow; listTree walks the whole subtree', async t => {
  const tree = makeLocalTree(makeTempTree(t));
  t.deepEqual(await E(tree).list(), ['sub', 'top.txt']);

  const entries = await E(tree).listTree([]);
  t.deepEqual(entries, [
    { path: ['sub'], type: 'directory' },
    { path: ['sub', 'a.txt'], type: 'file' },
    { path: ['sub', 'nested'], type: 'directory' },
    { path: ['sub', 'nested', 'deep.txt'], type: 'file' },
    { path: ['top.txt'], type: 'file' },
  ]);
});

test('LocalTree.listTree omits .git and returns no size/stat fields', async t => {
  const tree = makeLocalTree(makeTempTree(t));
  const entries = await E(tree).listTree([]);
  // `.git` and its contents are never surfaced.
  t.false(entries.some(e => e.path.includes('.git')));
  // Only `path` and `type` are present — no size / mtime leak.
  for (const entry of entries) {
    t.deepEqual(Object.keys(entry).sort(), ['path', 'type']);
  }
});

test('LocalTree.listTree accepts a sub-path and returns paths relative to it', async t => {
  const tree = makeLocalTree(makeTempTree(t));
  const entries = await E(tree).listTree('sub');
  t.deepEqual(entries, [
    { path: ['a.txt'], type: 'file' },
    { path: ['nested'], type: 'directory' },
    { path: ['nested', 'deep.txt'], type: 'file' },
  ]);
});

test('LocalTree.listTree of an empty directory is empty', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'local-tree-empty-'));
  t.teardown(() => fs.rmSync(dir, { recursive: true, force: true }));
  const tree = makeLocalTree(dir);
  t.deepEqual(await E(tree).listTree([]), []);
});

test('LocalTree.listTree augments the ignore set via options.ignore', async t => {
  const tree = makeLocalTree(makeTempTree(t));
  // `sub` is hidden for this call, so neither it nor its descendants appear —
  // the caller augments the ignore set at the read site without the surface
  // baking in an arbitrary default.
  const entries = await E(tree).listTree([], { ignore: ['sub'] });
  t.deepEqual(entries, [{ path: ['top.txt'], type: 'file' }]);

  // The augmentation is per-call: a later call without it sees `sub` again,
  // and `.git` stays ignored throughout (the base set is preserved).
  const again = await E(tree).listTree([]);
  t.true(again.some(e => e.path[0] === 'sub'));
  t.false(again.some(e => e.path.includes('.git')));
});
