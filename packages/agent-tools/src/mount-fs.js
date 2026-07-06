// @ts-check
/// <reference types="ses"/>

/** @import { ERef } from '@endo/eventual-send' */
/** @import { File, Filesystem } from '@endo/platform/fs/extended' */
/** @import { ToolRecord } from './types.js' */

import { E } from '@endo/eventual-send';
import { walk, collectBytes } from '@endo/platform/fs/extended';

import { makeTool } from './tool.js';

/**
 * Default text-read truncation cap, in characters. A `maxChars` option of `0`
 * disables truncation entirely.
 */
const DEFAULT_MAX_TEXT_CHARS = 50_000;

/**
 * Split a mount-relative path string into the `Filesystem` `walk` segments.
 * `walk` expects one `Directory.lookup` name per step, so empty components
 * (from a leading, trailing, or doubled slash) and explicit `.` steps collapse
 * to no-ops. A `..` segment is left intact so the `Filesystem` capability
 * rejects the escape rather than a brittle string check here. An empty or
 * all-slash path yields the empty segment list, which denotes the root.
 *
 * @param {string} path
 * @returns {string[]}
 */
const pathToSegments = path =>
  path
    .split('/')
    .map(segment => segment || '.')
    .filter(segment => segment !== '.');

/**
 * Reject a tool-arguments record that carries any key outside `allowed`,
 * before any capability send. The advertised schemas set
 * `additionalProperties: false`, but the JSON Schema is descriptive only; this
 * enforces it at runtime the same way the read tool does.
 *
 * @param {Record<string, unknown>} args
 * @param {string[]} allowed
 * @param {string} toolName
 */
const assertOnlyKeys = (args, allowed, toolName) => {
  for (const key of Object.keys(args)) {
    if (!allowed.includes(key)) {
      throw new Error(`unexpected ${toolName} argument key "${key}"`);
    }
  }
};

/**
 * Decimal-string-encode a portable-stat `bigint` field for a JSON-safe tool
 * result. Endo's tool wire schemas carry `bigint` as a string field decoded by
 * `coerceBigintArgs`; a raw `bigint` would throw in `JSON.stringify`.
 *
 * @param {bigint | undefined} value
 * @returns {string | undefined}
 */
const encodeStatBigint = value =>
  value === undefined ? undefined : `${value}`;

/**
 * JSON Schema for the single `path` parameter the mount read tool advertises.
 * Used verbatim as both the LLM `parameters` and the MCP `inputSchema` by
 * `makeTool`.
 */
const mountReadTextParameters = harden({
  type: 'object',
  properties: {
    path: {
      type: 'string',
      description: 'Mount-relative path to the file to read.',
    },
  },
  required: ['path'],
  additionalProperties: false,
});

/**
 * JSON Schema for the single `path` parameter the list and stat tools
 * advertise. The `path` names a directory (list) or any node (stat), relative
 * to the mount root; the empty string denotes the root directory.
 */
const mountPathParameters = harden({
  type: 'object',
  properties: {
    path: {
      type: 'string',
      description:
        'Mount-relative path. "" denotes the mount root; "../" escapes are ' +
        'rejected by the capability.',
    },
  },
  required: ['path'],
  additionalProperties: false,
});

/**
 * JSON Schema for the whole-file edit tool: a `path` and the full new UTF-8
 * `content` that replaces the file (creating it if absent).
 */
const mountWriteTextParameters = harden({
  type: 'object',
  properties: {
    path: {
      type: 'string',
      description: 'Mount-relative path to the file to create or overwrite.',
    },
    content: {
      type: 'string',
      description: 'The full new UTF-8 contents of the file.',
    },
  },
  required: ['path', 'content'],
  additionalProperties: false,
});

/**
 * A read-only filesystem tool bound to an `@endo/platform/fs/extended`
 * `Filesystem` capability. Reads a single text file by root-relative path and
 * returns its UTF-8 contents.
 *
 * Built through {@link makeTool}, so it emits a canonical `ToolRecord`
 * (`name`/`description`/`parameters`/`inputSchema`/`invoke`) at parity with the
 * git tools and flows through `toPiAgentTool` unchanged.
 *
 * The path is split into `Filesystem` segments and resolved by `walk`.
 * Confinement, symlink containment, and revocation are enforced by the
 * `Filesystem` capability this tool receives.
 *
 * @param {ERef<Filesystem>} fs An `@endo/platform/fs/extended` `Filesystem` ERef. Callers
 *   can attenuate authority with `readOnly` or `chroot`.
 * @param {object} [opts] Configuration options.
 * @param {number} [opts.maxChars] Maximum number of UTF-8 characters returned
 *   before the result is truncated. Defaults to `DEFAULT_MAX_TEXT_CHARS`
 *   (50,000). A value of `0` disables the limit; the full file contents are
 *   returned untruncated.
 * @returns {ToolRecord}
 */
export const makeMountReadTool = (fs, opts = {}) => {
  const { maxChars = DEFAULT_MAX_TEXT_CHARS } = opts;
  const limitDisabled = maxChars === 0;
  // `open().read(0n, length)` is exclusive of `length`, so request one extra
  // byte to detect overflow past the cap. With the limit disabled, read the
  // whole file in one unbounded request.
  const readLength = limitDisabled ? undefined : BigInt(maxChars + 1);

  return makeTool({
    name: 'mountReadText',
    description:
      'Read a UTF-8 text file from the mounted project directory. ' +
      'Path is relative to the mount root; "../" escapes are rejected.',
    parameters: mountReadTextParameters,
    execute: async args => {
      for (const key of Object.keys(args)) {
        if (key !== 'path') {
          throw new Error(`unexpected mountReadText argument key "${key}"`);
        }
      }
      const { path } = /** @type {{ path?: unknown }} */ (args);
      if (typeof path !== 'string' || path === '') {
        throw new Error('mountReadText requires a non-empty string path');
      }
      // `walk` expects one `Directory.lookup` segment at a time. Empty path
      // components become `.` no-op steps, so `/a`, `a//b`, and `a/` work.
      const segments = pathToSegments(path);
      const file = /** @type {File} */ (
        /** @type {unknown} */ (walk(E(fs).root(), segments))
      );
      const openFile = E(file).open({ read: true });
      // `read(offset)` with the length omitted reads to EOF, which is what we
      // want when the limit is disabled (`maxChars === 0`).
      const reader = await E(openFile).read(0n, readLength);
      const bytes = await collectBytes(/** @type {object} */ (reader));
      const content = new TextDecoder().decode(bytes);
      if (!limitDisabled && content.length > maxChars) {
        return `${content.slice(0, maxChars)}\n\n... (truncated at ${maxChars} chars)`;
      }
      return content;
    },
  });
};
harden(makeMountReadTool);

/**
 * A read-only directory-listing tool bound to a `Filesystem` capability. Lists
 * the immediate children of a directory by mount-relative path (the empty
 * string lists the root), returning each entry's `name` and `kind`
 * (`'file'` or `'directory'`). Only files and directories surface; the
 * `Filesystem` base seam already elides symlinks and special nodes.
 *
 * Entries are sorted by name so the result is stable across backings.
 *
 * @param {ERef<Filesystem>} fs An `@endo/platform/fs/extended` `Filesystem` ERef.
 * @returns {ToolRecord}
 */
export const makeMountListTool = fs => {
  return makeTool({
    name: 'mountList',
    description:
      'List the entries of a directory in the mounted project directory. ' +
      'Path is relative to the mount root ("" lists the root); "../" ' +
      'escapes are rejected.',
    parameters: mountPathParameters,
    execute: async args => {
      assertOnlyKeys(args, ['path'], 'mountList');
      const { path } = /** @type {{ path?: unknown }} */ (args);
      if (typeof path !== 'string') {
        throw new Error('mountList requires a string path');
      }
      const segments = pathToSegments(path);
      // The hand-written `Filesystem` `.d.ts` keeps `Directory` narrow (just
      // `lookup`); reach the richer `list` / `write` / `getQid` / `getStat`
      // surface through `any`, the same idiom `readOnly()` and `wrapBackend`
      // use. The `Filesystem` cap still enforces confinement at runtime.
      const dir = /** @type {any} */ (walk(E(fs).root(), segments));
      const cursor = await E(dir).list();
      const entries = /** @type {{ name: string, kind: string }[]} */ (
        await E(cursor).toArray()
      );
      const listed = entries
        .map(entry => ({ name: entry.name, kind: entry.kind }))
        .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
      return harden({ path, entries: listed });
    },
  });
};
harden(makeMountListTool);

/**
 * A read-only stat tool bound to a `Filesystem` capability. Reports the `kind`
 * (`'file'` or `'directory'`) and portable stat of a node by mount-relative
 * path (the empty string stats the root directory). The `size`, `mtime`, and
 * `atime` fields are decimal-string-encoded from the underlying `bigint`s so
 * the record stays JSON-safe on the tool wire.
 *
 * The inherited mount limits apply: no POSIX mode / uid / gid, and directory
 * `size` is reported as the base seam's `0`.
 *
 * @param {ERef<Filesystem>} fs An `@endo/platform/fs/extended` `Filesystem` ERef.
 * @returns {ToolRecord}
 */
export const makeMountStatTool = fs => {
  return makeTool({
    name: 'mountStat',
    description:
      'Report the kind (file or directory) and size / mtime / atime of a ' +
      'path in the mounted project directory. Path is relative to the mount ' +
      'root ("" stats the root); "../" escapes are rejected.',
    parameters: mountPathParameters,
    execute: async args => {
      assertOnlyKeys(args, ['path'], 'mountStat');
      const { path } = /** @type {{ path?: unknown }} */ (args);
      if (typeof path !== 'string') {
        throw new Error('mountStat requires a string path');
      }
      const segments = pathToSegments(path);
      const node = /** @type {any} */ (walk(E(fs).root(), segments));
      // `getQid().type` is the one-send kind probe the base seam exposes for
      // both File and Directory (and passed through by `readOnly()`); the
      // portable `getStat` carries size and timestamps.
      const qid = /** @type {{ type: string }} */ (await E(node).getQid());
      const stat =
        /** @type {{ size?: bigint, mtime?: bigint, atime?: bigint }} */ (
          await E(node).getStat()
        );
      return harden({
        path,
        kind: qid.type,
        size: encodeStatBigint(stat.size),
        mtime: encodeStatBigint(stat.mtime),
        atime: encodeStatBigint(stat.atime),
      });
    },
  });
};
harden(makeMountStatTool);

/**
 * A whole-file edit tool bound to a `Filesystem` capability. Creates or
 * overwrites a file at a mount-relative path with the supplied UTF-8
 * `content`, truncating any prior longer contents. The parent directory must
 * already exist; this tool does not create intermediate directories.
 *
 * This is the write slice of the file-tool set. When the `Filesystem` is a
 * `readOnly()`-attenuated capability the underlying whole-blob write fails
 * closed with `EACCES` at the cap, not here; a read-only deployment should
 * additionally omit this tool from the advertised catalog (see
 * {@link makeMountFsTools}).
 *
 * @param {ERef<Filesystem>} fs An `@endo/platform/fs/extended` `Filesystem` ERef.
 * @returns {ToolRecord}
 */
export const makeMountEditTool = fs => {
  return makeTool({
    name: 'mountWriteText',
    description:
      'Create or overwrite a UTF-8 text file in the mounted project ' +
      'directory with the full new contents. Path is relative to the mount ' +
      'root; the parent directory must exist; "../" escapes are rejected.',
    parameters: mountWriteTextParameters,
    execute: async args => {
      assertOnlyKeys(args, ['path', 'content'], 'mountWriteText');
      const { path, content } =
        /** @type {{ path?: unknown, content?: unknown }} */ (args);
      if (typeof path !== 'string' || path === '') {
        throw new Error('mountWriteText requires a non-empty string path');
      }
      if (typeof content !== 'string') {
        throw new Error('mountWriteText requires a string content');
      }
      const segments = pathToSegments(path);
      if (segments.length === 0) {
        throw new Error('mountWriteText cannot write the mount root');
      }
      // Whole-blob `Directory.write(name, value)` create-or-overwrites the
      // named child of the resolved parent directory; the name must be a
      // single segment, so walk to the parent and pass the leaf.
      const name = segments[segments.length - 1];
      const parentSegments = segments.slice(0, -1);
      const parent = /** @type {any} */ (walk(E(fs).root(), parentSegments));
      await E(parent).write(name, content);
      const byteLength = new TextEncoder().encode(content).length;
      return `Wrote ${byteLength} bytes to ${path}`;
    },
  });
};
harden(makeMountEditTool);

/**
 * The file-tool set (read, list, stat, and, for a writable deployment, edit)
 * over a single `Filesystem` capability, as one array of canonical
 * `ToolRecord`s. The same set reads the live worktree (`mountAsFilesystem`)
 * and history (`Git.filesystemAt(ref)`) unchanged, because both present the
 * same `Filesystem` shape.
 *
 * The read / list / stat tools carry the build-time `scope: 'read'` tag and
 * the edit tool `scope: 'write'`. When `opts.readOnly` is set the write slice
 * is filtered out at construction, so a read-only deployment never advertises
 * an edit tool the underlying cap would reject anyway. The `scope` tag is
 * build-time only and never reaches the wire schema the model receives (the
 * same discipline `makeGitTool` applies via `isGitReadOnly`). Because a
 * `Filesystem` cap is an `ERef` with no synchronous read-only probe, the host
 * (which minted the attenuation) declares it through `opts.readOnly` rather
 * than by cap inspection.
 *
 * @param {ERef<Filesystem>} fs An `@endo/platform/fs/extended` `Filesystem` ERef.
 * @param {object} [opts] Configuration options.
 * @param {boolean} [opts.readOnly] When `true`, omit the write (edit) slice so
 *   a read-only catalog advertises only read / list / stat. Defaults to `false`.
 * @param {number} [opts.maxChars] Forwarded to {@link makeMountReadTool} to cap
 *   read-tool output. See its documentation for the default and the `0`
 *   (unlimited) escape.
 * @returns {ToolRecord[]}
 */
export const makeMountFsTools = (fs, opts = {}) => {
  const { readOnly = false, maxChars } = opts;
  const tagged = [
    { scope: 'read', record: makeMountReadTool(fs, { maxChars }) },
    { scope: 'read', record: makeMountListTool(fs) },
    { scope: 'read', record: makeMountStatTool(fs) },
    { scope: 'write', record: makeMountEditTool(fs) },
  ];
  const records = tagged
    .filter(({ scope }) => !(readOnly && scope === 'write'))
    .map(({ record }) => record);
  return harden(records);
};
harden(makeMountFsTools);
