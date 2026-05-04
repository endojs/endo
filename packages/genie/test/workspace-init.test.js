// @ts-check

/**
 * Tests for {@link initWorkspaceMount} / {@link isWorkspaceMount}
 * (TODO/23) — drive the seed-template copy through an Endo `Mount`
 * cap, using a `makeMemoryVFS`-style in-memory fake so the test runs
 * without a real daemon.
 *
 * The fake exposes the subset of `MountInterface` that `init.js`
 * touches (`has`, `writeText`, `makeDirectory`).  We additionally
 * surface a `readText` helper for assertions; the production
 * `MountInterface` has `readText` too, but `initWorkspaceMount` does
 * not call it, so the fake's surface stays minimal.
 *
 * The `workspace_template/` files shipped with the package are read
 * from the host filesystem during the test (option (2) from
 * `TODO/23`); the test asserts that every file the template carries
 * shows up under the Mount fake's tree, plus the marker file.
 */

import '@endo/init/debug.js';

import { promises as fs } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

import test from 'ava';

import { initWorkspaceMount, isWorkspaceMount } from '../src/workspace/init.js';

const moduleDirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_DIR = resolve(moduleDirname, '..', 'workspace_template');

// ---------------------------------------------------------------------------
// In-memory Mount fake
// ---------------------------------------------------------------------------

/**
 * @typedef {{
 *   type: 'directory';
 *   children: Map<string, MemNode>;
 * } | {
 *   type: 'file';
 *   content: string;
 * }} MemNode
 */

/**
 * Build a hand-rolled `Mount`-shaped fake whose `has`, `writeText`,
 * and `makeDirectory` methods match the daemon's `MountInterface`
 * semantics.  Backed by a nested Map so assertions can walk the
 * resulting tree without needing CapTP.
 */
const makeMemoryMount = () => {
  /** @type {MemNode} */
  const root = { type: 'directory', children: new Map() };

  /**
   * @param {string | string[]} pathArg
   * @returns {string[]}
   */
  const segmentsOf = pathArg =>
    typeof pathArg === 'string' ? [pathArg] : [...pathArg];

  /**
   * Walk the tree to the node addressed by `segments`, returning
   * `undefined` if any intermediate hop is missing.
   *
   * @param {string[]} segments
   * @returns {MemNode | undefined}
   */
  const lookup = segments => {
    /** @type {MemNode} */
    let node = root;
    for (const segment of segments) {
      if (node.type !== 'directory') return undefined;
      const child = node.children.get(segment);
      if (!child) return undefined;
      node = child;
    }
    return node;
  };

  /**
   * Create directories along `segments`, returning the final dir node.
   * Mirrors the daemon's `makePath` semantics: idempotent, and the
   * caller is welcome to point at an existing directory.
   *
   * @param {string[]} segments
   * @returns {MemNode & { type: 'directory' }}
   */
  const ensureDir = segments => {
    /** @type {MemNode & { type: 'directory' }} */
    let cursor = /** @type {MemNode & { type: 'directory' }} */ (root);
    for (const segment of segments) {
      const existing = cursor.children.get(segment);
      if (existing) {
        if (existing.type !== 'directory') {
          throw new Error(
            `cannot create directory: ${segment} already exists as a file`,
          );
        }
        cursor = existing;
      } else {
        /** @type {MemNode & { type: 'directory' }} */
        const next = { type: 'directory', children: new Map() };
        cursor.children.set(segment, next);
        cursor = next;
      }
    }
    return cursor;
  };

  return harden({
    /** @param {string[]} segments */
    async has(...segments) {
      return lookup(segments) !== undefined;
    },
    /**
     * @param {string | string[]} pathArg
     * @param {string} content
     */
    async writeText(pathArg, content) {
      const segments = segmentsOf(pathArg);
      if (segments.length === 0) {
        throw new Error('writeText requires at least one path segment');
      }
      const fileName = /** @type {string} */ (segments[segments.length - 1]);
      const parent = ensureDir(segments.slice(0, -1));
      const existing = parent.children.get(fileName);
      if (existing && existing.type === 'directory') {
        throw new Error(`cannot write to ${fileName}: it is a directory`);
      }
      parent.children.set(fileName, { type: 'file', content });
    },
    /** @param {string | string[]} pathArg */
    async makeDirectory(pathArg) {
      ensureDir(segmentsOf(pathArg));
    },
    /** @param {string | string[]} pathArg */
    async readText(pathArg) {
      const node = lookup(segmentsOf(pathArg));
      if (!node || node.type !== 'file') {
        throw new Error(`no file at ${segmentsOf(pathArg).join('/')}`);
      }
      return node.content;
    },
    /** Test-only inspector. */
    _root: () => root,
  });
};

/**
 * Read every file under `dir` (host fs) and return a flat list of
 * `{ relPath, content }` entries with POSIX-style relative paths.
 * Used as the source of truth for what `initWorkspaceMount` should
 * have copied onto the destination Mount.
 *
 * @param {string} dir
 * @param {string} [prefix]
 * @returns {Promise<Array<{ relPath: string; content: string }>>}
 */
const walkHostTemplate = async (dir, prefix = '') => {
  await Promise.resolve();

  /** @type {Array<{ relPath: string; content: string }>} */
  const out = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  // `for await` over a sync iterable lets each entry's IO complete
  // before moving on — the seed copy itself is sequential, so
  // mirroring that here keeps the test's traversal order stable.
  for await (const entry of entries) {
    const childRel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      const sub = await walkHostTemplate(join(dir, entry.name), childRel);
      out.push(...sub);
    } else {
      const content = await fs.readFile(join(dir, entry.name), 'utf8');
      out.push({ relPath: childRel, content });
    }
  }
  return out;
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('isWorkspaceMount returns false on an empty Mount', async t => {
  await null;
  const mount = makeMemoryMount();
  t.false(await isWorkspaceMount(mount));
});

test('initWorkspaceMount seeds every template file plus the marker', async t => {
  const mount = makeMemoryMount();
  const expected = await walkHostTemplate(TEMPLATE_DIR);
  t.true(expected.length > 0, 'sanity: workspace_template should be non-empty');

  const ran = await initWorkspaceMount(mount);
  t.true(ran, 'first run should seed the workspace');

  // Every host-template file landed on the Mount with identical bytes.
  // `for await` over a sync iterable suppresses the no-await-in-loop
  // lint here (assertions must stay sequential to point at the first
  // mismatch via t.is's third-arg message).
  for await (const { relPath, content } of expected) {
    const segments = relPath.split('/');
    t.true(
      await mount.has(...segments),
      `mount should expose seeded ${relPath}`,
    );
    t.is(await mount.readText(segments), content, `mismatch at ${relPath}`);
  }

  // The marker file is present.
  t.true(await mount.has('.genie-workspace-init'));
  t.true(await isWorkspaceMount(mount));
});

test('initWorkspaceMount is idempotent — second run is a no-op', async t => {
  await null;
  const mount = makeMemoryMount();

  t.true(await initWorkspaceMount(mount));
  t.false(
    await initWorkspaceMount(mount),
    'second run should detect the marker and skip',
  );
});

test('initWorkspaceMount preserves user customisations on re-run', async t => {
  // Simulate a workspace that was seeded on a previous launch and
  // then customised by the user before a daemon restart.  The user's
  // file content must survive even though the marker would normally
  // skip the seed copy entirely; we delete the marker first to force
  // the copy path to run.
  const mount = makeMemoryMount();

  // Seed once so the marker exists.
  await initWorkspaceMount(mount);

  // Mutate one of the seeded files in place.
  const customSoul = '# my custom soul\n';
  await mount.writeText(['SOUL.md'], customSoul);

  // Drop the marker by re-creating the mount fake without it but with
  // the same files: the simplest way to exercise the "marker absent,
  // file already exists" branch is to seed an empty mount with a
  // pre-existing customised SOUL.md.
  const fresh = makeMemoryMount();
  await fresh.writeText(['SOUL.md'], customSoul);

  const ran = await initWorkspaceMount(fresh);
  t.true(ran);

  // SOUL.md retains the user's content; other template files are
  // copied as usual.
  t.is(await fresh.readText(['SOUL.md']), customSoul);
  t.true(await fresh.has('HEARTBEAT.md'));
  t.true(await fresh.has('memory', 'observations.md'));
});

test('initWorkspaceMount writes through the Mount surface only', async t => {
  // Regression guard: ensure `initWorkspaceMount` never falls back to
  // ambient host fs writes.  We swap `writeText` for a tracker; the
  // marker write at the end of the seed copy must hit the tracker.
  const mount = makeMemoryMount();

  /** @type {string[]} */
  const writes = [];

  const wrapped = harden({
    has: mount.has,
    makeDirectory: mount.makeDirectory,
    /**
     * @param {string | string[]} pathArg
     * @param {string} content
     */
    async writeText(pathArg, content) {
      const segments = typeof pathArg === 'string' ? [pathArg] : [...pathArg];
      writes.push(segments.join('/'));
      return mount.writeText(pathArg, content);
    },
  });

  await initWorkspaceMount(wrapped);

  // Marker was written through the Mount surface.
  t.true(writes.includes('.genie-workspace-init'));
  // Every host-template file was written through the Mount surface
  // too — there are no other write paths in the implementation.
  const expected = await walkHostTemplate(TEMPLATE_DIR);
  for (const { relPath } of expected) {
    t.true(writes.includes(relPath), `expected mount.writeText for ${relPath}`);
  }
});
