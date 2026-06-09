// @ts-check
/// <reference types="ses"/>

/** @import { ERef } from '@endo/far' */
/** @import { File, Filesystem } from '@endo/endo-fs' */
/** @import { MountReadToolRecord, ToolSchema } from './types.js' */

import { E } from '@endo/far';
import { walk, collectBytes } from '@endo/endo-fs';

/**
 * Default text-read truncation cap, in characters. A `maxChars` option of `0`
 * disables truncation entirely.
 */
const DEFAULT_MAX_TEXT_CHARS = 50_000;

/**
 * A read-only filesystem tool bound to an `@endo/endo-fs` `Filesystem`
 * capability. Reads a single text file by root-relative path and returns
 * its UTF-8 contents.
 *
 * The path is split into `Filesystem` segments and resolved by `walk`.
 * Confinement, symlink containment, and revocation are enforced by the
 * `Filesystem` capability this tool receives.
 *
 * @param {ERef<Filesystem>} fs An `@endo/endo-fs` `Filesystem` ERef. Callers
 *   can attenuate authority with `readOnly` or `chroot`.
 * @param {object} [opts] Configuration options.
 * @param {number} [opts.maxChars] Maximum number of UTF-8 characters returned
 *   before the result is truncated. Defaults to `DEFAULT_MAX_TEXT_CHARS`
 *   (50,000). A value of `0` disables the limit; the full file contents are
 *   returned untruncated.
 * @returns {MountReadToolRecord}
 */
export const makeMountReadTool = (fs, opts = {}) => {
  const { maxChars = DEFAULT_MAX_TEXT_CHARS } = opts;
  const limitDisabled = maxChars === 0;
  // `open().read(0n, length)` is exclusive of `length`, so request one extra
  // byte to detect overflow past the cap. With the limit disabled, read the
  // whole file in one unbounded request.
  const readLength = limitDisabled ? undefined : BigInt(maxChars + 1);
  /** @type {ToolSchema} */
  const schema = harden({
    type: 'function',
    function: {
      name: 'mountReadText',
      description:
        'Read a UTF-8 text file from the mounted project directory. ' +
        'Path is relative to the mount root; "../" escapes are rejected.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Mount-relative path to the file to read.',
          },
        },
        required: ['path'],
        additionalProperties: false,
      },
    },
  });

  return harden({
    schema: () => schema,
    async execute(args) {
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
      const segments = path
        .split('/')
        .map(segment => segment || '.')
        .filter(segment => segment !== '.');
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
    help: () =>
      'Read a text file from the mounted project directory (read-only).',
  });
};
harden(makeMountReadTool);
