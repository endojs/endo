// @ts-check
import { mkdir, open, readFile, truncate } from 'node:fs/promises';

import { formatEntry, makeHeaderEntry, makeMessageEntry } from './entries.js';

/**
 * @import { SessionEntry, SessionWriter, WriterFs } from '../types.js'
 */

/** @type {WriterFs} */
const nodeFs = { mkdir, readFile, truncate, open };

/**
 * The directory portion of a `/`-delimited path.
 *
 * @param {string} path
 * @returns {string}
 */
const dirOf = path => {
  const index = path.lastIndexOf('/');
  if (index < 0) return '.';
  if (index === 0) return '/';
  return path.slice(0, index);
};

/**
 * The byte length of the longest prefix of `bytes` that ends on a newline. A
 * torn final line (no trailing newline after a crash mid-append) is dropped.
 *
 * @param {Uint8Array} bytes
 * @returns {number}
 */
const completePrefixLength = bytes => {
  for (let i = bytes.length - 1; i >= 0; i -= 1) {
    if (bytes[i] === 0x0a) {
      return i + 1;
    }
  }
  return 0;
};

/**
 * Open an append-only, Pi-compatible JSONL session writer.
 *
 * The file is created lazily on first write, mode `0600`, under a
 * `recursive`-created parent directory. Every write is an `O_APPEND` write
 * (open flag `'a'`), so concurrent reopen-and-append is safe. On reopen, a
 * partial trailing line left by a crash mid-append is recovered by truncating
 * the file back to its last newline — matching Pi's approach.
 *
 * @param {{ path: string, mode?: number, fs?: WriterFs }} options
 * @returns {SessionWriter}
 */
export const makeSessionWriter = ({ path, mode = 0o600, fs = nodeFs }) => {
  /** @type {{ write(data: string): Promise<unknown>, close(): Promise<void> } | null} */
  let handle = null;
  /** The in-flight open, memoized so concurrent first-writes share one open. */
  /** @type {Promise<void> | null} */
  let opening = null;
  /** Whether the file was empty (a fresh session) when this writer opened it. */
  let startedEmpty = false;

  const openNow = async () => {
    // The parent directory is private (0700) to match the 0600 file: the
    // session file names it holds carry timestamps and session ids.
    await fs.mkdir(dirOf(path), { recursive: true, mode: 0o700 });
    let existingLength = 0;
    try {
      const existing = await fs.readFile(path);
      existingLength = existing.length;
      const keep = completePrefixLength(existing);
      if (keep < existing.length) {
        // Recover a torn final line from a prior crash.
        await fs.truncate(path, keep);
        existingLength = keep;
      }
    } catch (error) {
      if (/** @type {NodeJS.ErrnoException} */ (error).code !== 'ENOENT') {
        throw error;
      }
    }
    startedEmpty = existingLength === 0;
    handle = await fs.open(path, 'a', mode);
  };

  // Memoize the in-flight open so concurrent first-writes (writeHeader and an
  // append racing on a fresh file) share ONE fs.open instead of each opening a
  // handle and leaking all but the last. A failed open clears the latch so a
  // later call can retry rather than await a rejected promise forever.
  const ensureOpen = async () => {
    if (handle !== null) {
      return;
    }
    if (opening === null) {
      opening = openNow().catch(error => {
        opening = null;
        throw error;
      });
    }
    await opening;
  };

  /**
   * @param {SessionEntry} entry
   */
  const append = async entry => {
    await ensureOpen();
    // handle is non-null after ensureOpen resolves.
    await /** @type {NonNullable<typeof handle>} */ (handle).write(
      `${formatEntry(entry)}\n`,
    );
  };

  /** @type {SessionWriter} */
  const writer = {
    async writeHeader(fields) {
      await ensureOpen();
      if (!startedEmpty) {
        // Resuming an existing session: its header is already on disk.
        return;
      }
      startedEmpty = false;
      await append(makeHeaderEntry(fields));
    },
    append,
    async appendMessage(message, linkage) {
      const entry = makeMessageEntry(message, linkage);
      await append(entry);
      return entry;
    },
    async close() {
      await null;
      opening = null;
      if (handle !== null) {
        const current = handle;
        handle = null;
        await current.close();
      }
    },
  };
  return writer;
};
