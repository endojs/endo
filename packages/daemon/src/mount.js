// @ts-check
/// <reference types="ses"/>

/** @import { FilePowers } from './types.js' */

import { makeExo } from '@endo/exo';
import { q } from '@endo/errors';
import { makeIteratorRef } from './reader-ref.js';
import { MountInterface, MountFileInterface } from './interfaces.js';


/**
 * Validate a single path segment.
 * Rejects '/', '\', '\0', and empty strings.
 *
 * @param {string} segment
 */
const assertValidSegment = segment => {
  if (typeof segment !== 'string') {
    throw new Error(`Path segment must be a string, got ${q(typeof segment)}`);
  }
  if (segment === '') {
    throw new Error('Path segment must not be empty');
  }
  if (segment.includes('/') || segment.includes('\\') || segment.includes('\0')) {
    throw new Error(`Path segment must not contain '/', '\\', or '\\0': ${q(segment)}`);
  }
};
harden(assertValidSegment);

/**
 * Resolve path segments relative to a current directory, clamped to a
 * confinement root.  '.' skips, '..' pops (clamped at root).
 *
 * @param {string} currentDir
 * @param {string} confinementRoot
 * @param {string[]} segments
 * @param {FilePowers} filePowers
 * @returns {string}
 */
const resolveSegments = (currentDir, confinementRoot, segments, filePowers) => {
  let resolved = currentDir;
  for (const segment of segments) {
    if (segment === '.') {
      // skip
    } else if (segment === '..') {
      const parent = filePowers.joinPath(resolved, '..');
      if (parent.length >= confinementRoot.length) {
        resolved = parent;
      } else {
        resolved = confinementRoot;
      }
    } else {
      assertValidSegment(segment);
      resolved = filePowers.joinPath(resolved, segment);
    }
  }
  return resolved;
};
harden(resolveSegments);

/**
 * Assert that a resolved path is contained within the confinement root.
 *
 * @param {string} candidatePath
 * @param {string} confinementRoot
 * @param {FilePowers} filePowers
 */
const assertConfined = async (candidatePath, confinementRoot, filePowers) => {
  let resolved;
  try {
    resolved = await filePowers.realPath(candidatePath);
  } catch {
    throw new Error(`Path does not exist and cannot be verified: ${q(candidatePath)}`);
  }
  const rootResolved = await filePowers.realPath(confinementRoot);
  if (resolved !== rootResolved && !resolved.startsWith(`${rootResolved}/`)) {
    throw new Error(`Path escapes mount root: ${q(candidatePath)}`);
  }
};
harden(assertConfined);

/**
 * Check confinement of a path that may not exist yet.
 * Walks up to find the deepest existing ancestor.
 *
 * @param {string} candidatePath
 * @param {string} confinementRoot
 * @param {FilePowers} filePowers
 */
const assertConfinedOrAncestor = async (candidatePath, confinementRoot, filePowers) => {
  const rootResolved = await filePowers.realPath(confinementRoot);
  let check = candidatePath;
  for (;;) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const resolved = await filePowers.realPath(check);
      if (resolved !== rootResolved && !resolved.startsWith(`${rootResolved}/`)) {
        throw new Error(`Path escapes mount root: ${q(candidatePath)}`);
      }
      return;
    } catch (/** @type {any} */ e) {
      if (e.message && e.message.startsWith('Path escapes')) {
        throw e;
      }
      const parent = filePowers.joinPath(check, '..');
      if (parent === check) {
        throw new Error(`Path escapes mount root: ${q(candidatePath)}`);
      }
      check = parent;
    }
  }
};
harden(assertConfinedOrAncestor);

/**
 * Check if a path is confined (returns boolean, does not throw).
 *
 * @param {string} candidatePath
 * @param {string} confinementRoot
 * @param {FilePowers} filePowers
 * @returns {Promise<boolean>}
 */
const isConfinedPath = async (candidatePath, confinementRoot, filePowers) => {
  try {
    const resolved = await filePowers.realPath(candidatePath);
    const rootResolved = await filePowers.realPath(confinementRoot);
    return resolved === rootResolved || resolved.startsWith(`${rootResolved}/`);
  } catch {
    return false;
  }
};
harden(isConfinedPath);

/**
 * @typedef {object} MountContext
 * @property {string} currentDir
 * @property {string} confinementRoot
 * @property {boolean} readOnly
 * @property {FilePowers} filePowers
 * @property {string} description
 */

/**
 * Create a mount exo for a filesystem directory.
 *
 * @param {MountContext} ctx
 * @returns {object}
 */
const makeMountExo = ctx => {
  const {
    currentDir,
    confinementRoot,
    readOnly,
    filePowers,
    description,
  } = ctx;

  const assertWritable = () => {
    if (readOnly) {
      throw new Error('Mount is read-only');
    }
  };

  /**
   * @param {string[]} segments
   * @returns {string}
   */
  const resolve = segments =>
    resolveSegments(currentDir, confinementRoot, segments, filePowers);

  return makeExo('EndoMount', MountInterface, {
    help() {
      return `${description}\n\n${mountHelp['']}`;
    },

    async has(...pathSegments) {
      await null;
      if (pathSegments.length === 0) {
        return true;
      }
      const target = resolve(pathSegments);
      const pathExists = await filePowers.exists(target);
      if (!pathExists) {
        return false;
      }
      return isConfinedPath(target, confinementRoot, filePowers);
    },

    async list(...pathSegments) {
      await null;
      const target = resolve(pathSegments);
      await assertConfined(target, confinementRoot, filePowers);
      const entries = await filePowers.readDirectory(target);
      const confined = [];
      for (const entry of entries.sort()) {
        const entryPath = filePowers.joinPath(target, entry);
        // eslint-disable-next-line no-await-in-loop
        if (await isConfinedPath(entryPath, confinementRoot, filePowers)) {
          confined.push(entry);
        }
      }
      return harden(confined);
    },

    async lookup(pathArg) {
      await null;
      const segments = typeof pathArg === 'string' ? [pathArg] : pathArg;
      const target = resolve(segments);
      await assertConfined(target, confinementRoot, filePowers);

      const isDir = await filePowers.isDirectory(target);
      if (isDir) {
        return makeMountExo({
          ...ctx,
          currentDir: target,
          description: `Subdirectory of ${description}`,
        });
      }

      return makeMountFileExo(target, readOnly, filePowers, confinementRoot);
    },

    async write(pathSegments, value) {
      await null;
      assertWritable();
      const target = resolve(pathSegments);
      await assertConfinedOrAncestor(target, confinementRoot, filePowers);

      const parent = filePowers.joinPath(target, '..');
      await filePowers.makePath(parent);

      if (typeof value === 'string') {
        await filePowers.writeFileText(target, value);
      } else {
        // Assume value has streamBase64() method (ReadableBlob-like).
        const iterator = await /** @type {any} */ (value).streamBase64();
        const chunks = [];
        for (;;) {
          // eslint-disable-next-line no-await-in-loop
          const { done, value: chunk } = await iterator.next();
          if (done) break;
          chunks.push(chunk);
        }
        const text = chunks.join('');
        const bytes = Uint8Array.from(atob(text), c => c.charCodeAt(0));
        await filePowers.writeFileText(target, new TextDecoder().decode(bytes));
      }
    },

    async remove(pathSegments) {
      await null;
      assertWritable();
      const target = resolve(pathSegments);
      await assertConfined(target, confinementRoot, filePowers);
      await filePowers.removePath(target);
    },

    async move(fromSegments, toSegments) {
      await null;
      assertWritable();
      const from = resolve(fromSegments);
      const to = resolve(toSegments);
      await assertConfined(from, confinementRoot, filePowers);
      await assertConfinedOrAncestor(to, confinementRoot, filePowers);
      await filePowers.renamePath(from, to);
    },

    async makeDirectory(pathSegments) {
      await null;
      assertWritable();
      const target = resolve(pathSegments);
      await assertConfinedOrAncestor(target, confinementRoot, filePowers);
      await filePowers.makePath(target);
    },

    readOnly() {
      if (readOnly) {
        return this; // eslint-disable-line no-invalid-this
      }
      return makeMountExo({
        ...ctx,
        readOnly: true,
        description: `Read-only view of ${description}`,
      });
    },

    async snapshot() {
      throw new Error('snapshot() is not yet implemented');
    },
  });
};
harden(makeMountExo);

/**
 * Create a transient file exo for a file within a mount.
 *
 * @param {string} filePath
 * @param {boolean} readOnly
 * @param {FilePowers} filePowers
 * @param {string} confinementRoot
 * @returns {object}
 */
const makeMountFileExo = (filePath, readOnly, filePowers, confinementRoot) => {
  const assertWritable = () => {
    if (readOnly) {
      throw new Error('Mount is read-only');
    }
  };

  return makeExo('EndoMountFile', MountFileInterface, {
    help() {
      return 'MountFile — A file within a mounted directory.';
    },

    async text() {
      await null;
      await assertConfined(filePath, confinementRoot, filePowers);
      return filePowers.readFileText(filePath);
    },

    streamBase64() {
      const reader = filePowers.makeFileReader(filePath);
      return makeIteratorRef(reader);
    },

    async json() {
      await null;
      const text = await filePowers.readFileText(filePath);
      return JSON.parse(text);
    },

    async writeText(content) {
      await null;
      assertWritable();
      await assertConfined(filePath, confinementRoot, filePowers);
      await filePowers.writeFileText(filePath, content);
    },

    async writeBytes(readableRef) {
      await null;
      assertWritable();
      await assertConfined(filePath, confinementRoot, filePowers);
      const writer = filePowers.makeFileWriter(filePath);
      const iterator = /** @type {AsyncIterator<Uint8Array>} */ (readableRef);
      for (;;) {
        // eslint-disable-next-line no-await-in-loop
        const { done, value } = await iterator.next();
        if (done) break;
        // eslint-disable-next-line no-await-in-loop
        await writer.next(value);
      }
      await writer.return(undefined);
    },

    readOnly() {
      return makeMountFileExo(filePath, true, filePowers, confinementRoot);
    },
  });
};
harden(makeMountFileExo);

/** @type {import('./help-text.js').HelpText} */
export const mountHelp = {
  '': `\
EndoMount — Live mutable access to a filesystem directory.

All paths are confined to the mount root. Symlinks that escape
the root are invisible. Use readOnly() for an attenuated view.`,

  help: `\
help() -> string
Get documentation for this interface.`,

  has: `\
has(...path) -> Promise<boolean>
Check if a path exists within the mount.
path: string[] — Path segments.`,

  list: `\
list(...path) -> Promise<string[]>
List directory entries at the given path.
path: string[] — Path segments (optional, defaults to root).
Entries with symlinks escaping the mount root are excluded.`,

  lookup: `\
lookup(path) -> Promise<EndoMount | EndoMountFile>
Resolve a path within the mount.
path: string | string[] — Name or path segments.
Returns EndoMount for directories, EndoMountFile for files.`,

  write: `\
write(path, value) -> Promise<void>
Write content to a file at the given path.
path: string[] — Path segments.
value: string | ReadableBlob — Content to write.
Creates parent directories as needed. Throws if read-only.`,

  remove: `\
remove(path) -> Promise<void>
Remove a file or empty directory.
path: string[] — Path segments.`,

  move: `\
move(from, to) -> Promise<void>
Rename an entry within the mount.
from: string[] — Source path segments.
to: string[] — Destination path segments.`,

  makeDirectory: `\
makeDirectory(path) -> Promise<void>
Create a directory (and missing parents).
path: string[] — Path segments.`,

  readOnly: `\
readOnly() -> EndoMount
Returns a read-only view of this mount.`,

  snapshot: `\
snapshot() -> Promise<SnapshotTree>
Capture current state as an immutable readable-tree. (Not yet implemented.)`,
};
harden(mountHelp);

/**
 * Create a mount exo backed by a filesystem directory.
 *
 * @param {object} opts
 * @param {string} opts.rootPath
 * @param {boolean} opts.readOnly
 * @param {FilePowers} opts.filePowers
 * @returns {object}
 */
export const makeMount = ({ rootPath, readOnly, filePowers }) => {
  const prefix = readOnly ? 'Read-only mount' : 'Mount';
  /** @type {MountContext} */
  const ctx = {
    currentDir: rootPath,
    confinementRoot: rootPath,
    readOnly,
    filePowers,
    description: `${prefix} at ${rootPath}`,
  };

  return makeMountExo(ctx);
};
harden(makeMount);
