// @ts-check

import fs from 'fs';
import os from 'os';
import path from 'path';
import { Buffer } from 'node:buffer';

const manifestUrl = new URL('./mount-fixture-manifest.json', import.meta.url);

/**
 * @typedef {object} FixtureRecord
 * @property {string} path
 * @property {'file' | 'directory' | 'symlink'} type
 * @property {string} [content]
 * @property {'base64'} [encoding]
 * @property {string} [target]
 * @property {boolean} [optional]
 */

/**
 * Load the shared, cross-language mount fixture manifest.
 *
 * @returns {{ description: string, entries: FixtureRecord[], outsideRoot?: FixtureRecord[] }}
 */
export const loadMountFixtureManifest = () =>
  JSON.parse(fs.readFileSync(manifestUrl, 'utf8'));
harden(loadMountFixtureManifest);

/**
 * Materialize one fixture record beneath `baseDir`, recording the created or
 * skipped path in the given sets. Shared by the in-root `entries` and the
 * above-root `outsideRoot` passes so both honor identical encoding, symlink,
 * and optional-skip semantics.
 *
 * @param {string} baseDir
 * @param {FixtureRecord} record
 * @param {Set<string>} created
 * @param {Set<string>} skipped
 */
const materializeRecord = (baseDir, record, created, skipped) => {
  const dest = path.join(baseDir, record.path);
  if (record.type === 'directory') {
    fs.mkdirSync(dest, { recursive: true });
  } else if (record.type === 'file') {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const body =
      record.encoding === 'base64'
        ? Buffer.from(record.content ?? '', 'base64')
        : (record.content ?? '');
    fs.writeFileSync(dest, body);
  } else if (record.type === 'symlink') {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    try {
      fs.symlinkSync(/** @type {string} */ (record.target), dest);
      created.add(record.path);
    } catch (error) {
      if (record.optional) {
        skipped.add(record.path);
      } else {
        throw error;
      }
    }
  } else {
    throw new Error(`Unknown fixture record type: ${record.type}`);
  }
};

/**
 * Materialize the shared mount fixture manifest into a fresh temp directory
 * and return the mount root path. The mount root is a `root/` subdirectory of
 * a private parent temp dir, and the manifest's `outsideRoot` records
 * materialize in that parent — one level *above* the mount root — so the
 * manifest's escaping symlink (`escape -> ../escape-target`) resolves to a
 * real sibling outside confinement, exercising exclusion. The above-root tree
 * is declared in the manifest (not created imperatively here) so a Rust/XS
 * runner reading only the manifest builds the identical sibling and does not
 * pass the confinement cases vacuously against a dangling link.
 *
 * Records flagged `optional: true` (the symlink) are skipped when the platform
 * cannot create them; the returned `created` / `skipped` sets let a case-table
 * runner gate expectations that depend on the optional entries.
 *
 * @param {import('ava').ExecutionContext} t
 * @returns {{ root: string, created: Set<string>, skipped: Set<string> }}
 */
export const buildMountFixture = t => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'mount-fixture-'));
  t.teardown(() => fs.rmSync(parent, { recursive: true, force: true }));

  const root = path.join(parent, 'root');
  fs.mkdirSync(root);

  const { entries, outsideRoot = [] } = loadMountFixtureManifest();
  /** @type {Set<string>} */
  const created = new Set();
  /** @type {Set<string>} */
  const skipped = new Set();

  // Above-root records first, so the escaping symlink in `entries` resolves to
  // an existing sibling rather than a dangling target.
  for (const record of outsideRoot) {
    materializeRecord(parent, record, created, skipped);
  }
  for (const record of entries) {
    materializeRecord(root, record, created, skipped);
  }

  return { root, created, skipped };
};
harden(buildMountFixture);
