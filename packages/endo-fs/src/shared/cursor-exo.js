// @ts-check
/* eslint-disable no-await-in-loop */
/**
 * Build a `Cursor` exo over a backend's `list(dirPath)` async
 * iterable. The Cursor owns its position; `read(limit)` returns a
 * bounded page, `stream()` returns a `PassableReader<DirEntry>`,
 * `toArray()` drains the rest.
 *
 * Entries are augmented with a synthesized `qid` so legacy
 * consumers (9p-server's `Treaddir` reads `{ name, qid }`) work
 * unchanged against any wrapBackend-built `Filesystem`.
 *
 * @import { FsBackend, DirEntry } from '../backend-types.js'
 */

import { makeExo } from '@endo/exo';
import { q } from '@endo/errors';
import { readerFromIterator } from '@endo/exo-stream/reader-from-iterator.js';

import { CursorInterface } from '../type-guards.js';
import { toSafeNumber } from './helpers.js';
import { synthQid } from './qid.js';

/**
 * @param {object} opts
 * @param {FsBackend} opts.backend
 * @param {string[]} opts.dirPath
 */
export const makeCursorExo = ({ backend, dirPath }) => {
  /** @type {AsyncIterator<DirEntry> | null} */
  let iter = null;
  let exhausted = false;

  const ensureIter = () => {
    if (iter === null) {
      iter = backend.list(dirPath)[Symbol.asyncIterator]();
    }
    return iter;
  };

  // Augment each backend entry with a synthesized `qid` for legacy
  // consumers. Both `entry.kind` and `entry.qid.type` carry the
  // same information.
  const augment = entry =>
    harden({
      name: entry.name,
      kind: entry.kind,
      qid: synthQid([...dirPath, entry.name], entry.kind),
    });

  return makeExo('Cursor', CursorInterface, {
    async read(limit) {
      if (exhausted) return harden({ entries: [], atEnd: true });
      const max = limit === undefined ? Infinity : toSafeNumber(limit, 'limit');
      const it = ensureIter();
      /** @type {DirEntry[]} */
      const entries = [];
      let atEnd = false;
      while (entries.length < max) {
        const step = await it.next();
        if (step.done) {
          atEnd = true;
          exhausted = true;
          break;
        }
        entries.push(augment(step.value));
      }
      return harden({ entries, atEnd });
    },
    async stream() {
      if (exhausted) {
        return readerFromIterator(
          (async function* empty() {
            // intentionally empty
          })(),
        );
      }
      const it = ensureIter();
      const generator = async function* () {
        for (;;) {
          const step = await it.next();
          if (step.done) {
            exhausted = true;
            return;
          }
          yield augment(step.value);
        }
      };
      return readerFromIterator(generator());
    },
    async toArray() {
      if (exhausted) return harden([]);
      const it = ensureIter();
      /** @type {DirEntry[]} */
      const out = [];
      for (;;) {
        const step = await it.next();
        if (step.done) {
          exhausted = true;
          break;
        }
        out.push(augment(step.value));
      }
      return harden(out);
    },
    async skip(n) {
      const count = toSafeNumber(n, 'n');
      const it = ensureIter();
      for (let i = 0; i < count; i += 1) {
        const step = await it.next();
        if (step.done) {
          exhausted = true;
          return;
        }
      }
    },
    async rewind() {
      iter = null;
      exhausted = false;
    },
    help(method) {
      if (method === undefined) {
        return 'Cursor: paged directory listing — read(limit) | stream() | toArray() | skip(n) | rewind().';
      }
      return `No documentation for method ${q(method)}.`;
    },
  });
};
harden(makeCursorExo);
