// @ts-check
/// <reference types="ses"/>

/** @import { ERef } from '@endo/far' */
/** @import { File, Filesystem } from '@endo/endo-fs' */
/** @import { MountReadToolRecord, ToolSchema } from './types.js' */

import { E } from '@endo/far';
import { walk, collectBytes } from '@endo/endo-fs';

/**
 * Existing text-read truncation cap.
 */
const MAX_TEXT_CHARS = 50_000;
const MAX_TEXT_BYTES = BigInt(MAX_TEXT_CHARS + 1);

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
 * @returns {MountReadToolRecord}
 */
export const makeMountReadTool = fs => {
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
      const reader = await E(openFile).read(0n, MAX_TEXT_BYTES);
      const bytes = await collectBytes(/** @type {object} */ (reader));
      const content = new TextDecoder().decode(bytes);
      if (content.length > MAX_TEXT_CHARS) {
        return `${content.slice(0, MAX_TEXT_CHARS)}\n\n... (truncated at ${MAX_TEXT_CHARS} chars)`;
      }
      return content;
    },
    help: () =>
      'Read a text file from the mounted project directory (read-only).',
  });
};
harden(makeMountReadTool);
