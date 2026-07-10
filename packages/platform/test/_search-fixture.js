// @ts-check

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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
 * Load the shared, cross-language mount/search fixture manifest. This is the
 * canonical copy the engine tests here exercise directly; the daemon keeps its
 * own copy for the mount-level parity tests (the machine-readable
 * `mount-glob-contract.json` is the single shared drift check across both).
 *
 * @returns {{ description: string, entries: FixtureRecord[], outsideRoot?: FixtureRecord[] }}
 */
export const loadMountFixtureManifest = () =>
  JSON.parse(fs.readFileSync(manifestUrl, 'utf8'));
harden(loadMountFixtureManifest);

/**
 * Materialize one fixture record beneath `baseDir`.
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
 * Materialize the shared fixture manifest into a fresh temp directory and
 * return the mount root path. The `outsideRoot` records materialize one level
 * above the root so the manifest's escaping symlink (`escape ->
 * ../escape-target`) resolves to a real sibling outside confinement.
 *
 * @param {import('ava').ExecutionContext} t
 * @returns {{ root: string, created: Set<string>, skipped: Set<string> }}
 */
export const buildMountFixture = t => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'search-fixture-'));
  t.teardown(() => fs.rmSync(parent, { recursive: true, force: true }));

  const root = path.join(parent, 'root');
  fs.mkdirSync(root);

  const { entries, outsideRoot = [] } = loadMountFixtureManifest();
  /** @type {Set<string>} */
  const created = new Set();
  /** @type {Set<string>} */
  const skipped = new Set();

  for (const record of outsideRoot) {
    materializeRecord(parent, record, created, skipped);
  }
  for (const record of entries) {
    materializeRecord(root, record, created, skipped);
  }

  return { root, created, skipped };
};
harden(buildMountFixture);
