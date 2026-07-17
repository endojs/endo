// @ts-check
import harden from '@endo/harden';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

import { Fail, q } from '@endo/errors';

/**
 * @import {TablesRecord} from './persistent-tables.js'
 */

/**
 * A publication binds an OCapN swissnum to a slot in one worker's CapTP
 * session, so the host can rebind its locator after a restart.
 *
 * @typedef {object} PublicationRecord
 * @property {string} workerName
 * @property {string} slot ours-perspective import slot, e.g. `o-2`
 * @property {string | null} iface
 */

/**
 * @typedef {object} WorkerMeta
 * @property {string} [bootSlot] import slot of the worker's bootstrap facet
 * @property {string | null} [bootIface]
 * @property {{ ref: unknown, journalLength: number } | null} [snapshot]
 * @property {Array<string>} [pendingGuestQuestions] question IDs the
 *   worker has asked the host that the host has not yet answered; a
 *   restarted host rejects these (at-most-once), since the answering
 *   computation died with the previous host process
 * @property {Array<string>} [pendingPromiseExports] ours-perspective
 *   promise slots the host has exported to this worker but not yet
 *   resolved; a restarted host rejects these (at-most-once), since the
 *   resolution subscription died with the previous host process
 * @property {number} [deliveredLength] absolute journal index of the
 *   live-delivered prefix: entries below it had their outbound effects
 *   processed by some host incarnation (replay them suppressed); entries
 *   at or above it were journaled but never live-delivered (deliver them
 *   as fresh traffic on the next wake)
 */

/**
 * Durable storage for one worker: its CapTP tables record, its inbound
 * message journal, and its metadata (bootstrap slot, engine snapshot ref,
 * resource export descriptions).
 *
 * The journal is indexed by absolute entry number: indices remain stable
 * across truncation, so a snapshot's recorded `journalLength` always
 * names the same suffix.
 *
 * @typedef {object} WorkerStore
 * @property {() => TablesRecord | undefined} getTablesRecord
 * @property {(record: TablesRecord) => void} setTablesRecord
 * @property {() => WorkerMeta} getMeta
 * @property {(meta: WorkerMeta) => void} setMeta
 * @property {(entry: unknown) => void} appendJournal
 * @property {(from?: number) => Array<any>} readJournal entries with
 *   absolute index >= from (entries before the truncation point are gone)
 * @property {() => number} journalLength total absolute entry count
 * @property {(upTo: number) => void} truncateJournal drops entries with
 *   absolute index < upTo; call only after a snapshot covering them is
 *   durably recorded
 */

/**
 * @typedef {object} SiestaStore
 * @property {() => Array<string>} listWorkerNames
 * @property {(name: string) => WorkerStore} provideWorkerStore
 * @property {() => Record<string, PublicationRecord>} getPublications
 * @property {(secret: string, record: PublicationRecord) => void} setPublication
 */

const WORKER_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9-]{0,63}$/;

/** @param {string} name */
export const assertWorkerName = name => {
  WORKER_NAME_PATTERN.test(name) ||
    Fail`Worker name must match ${q(WORKER_NAME_PATTERN.source)}, got ${q(
      name,
    )}`;
};
harden(assertWorkerName);

/**
 * @param {string} path
 * @returns {any}
 */
const readJsonMaybe = path => {
  if (!existsSync(path)) {
    return undefined;
  }
  return JSON.parse(readFileSync(path, 'utf8'));
};

/**
 * Crash-safe JSON write: temp file plus atomic rename, so a crash
 * mid-write leaves the previous version intact rather than a torn file.
 *
 * @param {string} path
 * @param {string} text
 */
const writeFileAtomic = (path, text) => {
  const tempPath = `${path}.tmp`;
  writeFileSync(tempPath, text);
  renameSync(tempPath, path);
};

/**
 * Filesystem-backed {@link SiestaStore}. All writes are synchronous
 * write-through so durable state always precedes any message reaching a
 * worker ("disk before graph").
 *
 * Layout under `statePath`:
 * - `publications.json`
 * - `workers/<name>/meta.json`
 * - `workers/<name>/tables.json`
 * - `workers/<name>/journal.jsonl`
 *
 * @param {string} statePath
 * @returns {SiestaStore}
 */
export const makeFsStore = statePath => {
  const workersPath = join(statePath, 'workers');
  const publicationsPath = join(statePath, 'publications.json');
  mkdirSync(workersPath, { recursive: true });

  /** @param {string} name */
  const makeWorkerStore = name => {
    assertWorkerName(name);
    const workerPath = join(workersPath, name);
    mkdirSync(workerPath, { recursive: true });
    const tablesPath = join(workerPath, 'tables.json');
    const metaPath = join(workerPath, 'meta.json');
    const journalPath = join(workerPath, 'journal.jsonl');

    // The journal's first line is a header recording the absolute index
    // of the first entry line, so truncation can drop a prefix while
    // keeping absolute indices stable. Truncation rewrites the file via
    // rename so the base and the entries change atomically. Appends are
    // plain appends, so a crash mid-append can leave a torn final line;
    // it is dropped on the first read (safe, because the host journals
    // before delivering: a torn entry was never delivered) and the file
    // is repaired before any further append so the tear cannot swallow
    // the next entry.

    /** @param {string} line */
    const isWholeJsonLine = line => {
      try {
        JSON.parse(line);
        return true;
      } catch (_error) {
        return false;
      }
    };

    let journalRepaired = false;

    /** @returns {{ base: number, lines: Array<string> }} */
    const readJournalFile = () => {
      if (!existsSync(journalPath)) {
        return { base: 0, lines: [] };
      }
      const text = readFileSync(journalPath, 'utf8');
      const lines = text.split('\n').filter(line => line !== '');
      const header = JSON.parse(lines[0] ?? '{}');
      typeof header.base === 'number' ||
        Fail`Journal at ${q(journalPath)} is missing its base header`;
      let entries = lines.slice(1);
      if (entries.length > 0 && !isWholeJsonLine(entries[entries.length - 1])) {
        // Torn final line from a crash mid-append: the entry was never
        // delivered, so forgetting it is correct.
        entries = entries.slice(0, -1);
        // eslint-disable-next-line no-use-before-define
        writeJournalFile(header.base, entries);
      }
      return { base: header.base, lines: entries };
    };

    /**
     * @param {number} base
     * @param {Array<string>} lines
     */
    const writeJournalFile = (base, lines) => {
      const text = [JSON.stringify({ base }), ...lines, ''].join('\n');
      const tempPath = `${journalPath}.tmp`;
      writeFileSync(tempPath, text);
      renameSync(tempPath, journalPath);
      journalRepaired = true;
    };

    const ensureJournalRepaired = () => {
      if (!journalRepaired) {
        // Reading repairs a torn tail (rewriting the file) so a
        // subsequent append cannot concatenate onto a partial line.
        readJournalFile();
        journalRepaired = true;
      }
    };

    /** @type {WorkerStore} */
    const workerStore = {
      getTablesRecord: () => readJsonMaybe(tablesPath),
      setTablesRecord: record =>
        writeFileAtomic(tablesPath, `${JSON.stringify(record)}\n`),
      getMeta: () => readJsonMaybe(metaPath) ?? {},
      setMeta: meta => writeFileAtomic(metaPath, `${JSON.stringify(meta)}\n`),
      appendJournal: entry => {
        if (!existsSync(journalPath)) {
          writeJournalFile(0, []);
        }
        ensureJournalRepaired();
        appendFileSync(journalPath, `${JSON.stringify(entry)}\n`);
      },
      readJournal: (from = 0) => {
        const { base, lines } = readJournalFile();
        return lines
          .slice(Math.max(0, from - base))
          .map(line => JSON.parse(line));
      },
      journalLength: () => {
        const { base, lines } = readJournalFile();
        return base + lines.length;
      },
      truncateJournal: upTo => {
        const { base, lines } = readJournalFile();
        if (upTo <= base) {
          return;
        }
        upTo <= base + lines.length ||
          Fail`Cannot truncate journal beyond its length`;
        writeJournalFile(upTo, lines.slice(upTo - base));
      },
    };
    return harden(workerStore);
  };

  /** @type {SiestaStore} */
  const store = {
    listWorkerNames: () =>
      existsSync(workersPath) ? readdirSync(workersPath).sort() : [],
    provideWorkerStore: makeWorkerStore,
    getPublications: () => readJsonMaybe(publicationsPath) ?? {},
    setPublication: (secret, record) => {
      const publications = readJsonMaybe(publicationsPath) ?? {};
      publications[secret] = record;
      writeFileAtomic(
        publicationsPath,
        `${JSON.stringify(publications, undefined, 2)}\n`,
      );
    },
  };
  return harden(store);
};
harden(makeFsStore);

/**
 * In-memory {@link SiestaStore} for tests. Simulates restart survival as
 * long as the same store object is handed to each host incarnation.
 *
 * @returns {SiestaStore}
 */
export const makeMemoryStore = () => {
  /** @type {Map<string, { tables?: TablesRecord, meta: WorkerMeta, base: number, journal: Array<any> }>} */
  const workers = new Map();
  /** @type {Record<string, PublicationRecord>} */
  const publications = {};

  /** @param {string} name */
  const provideWorkerStore = name => {
    assertWorkerName(name);
    let entry = workers.get(name);
    if (!entry) {
      entry = { tables: undefined, meta: {}, base: 0, journal: [] };
      workers.set(name, entry);
    }
    const state = entry;
    /** @type {WorkerStore} */
    const workerStore = {
      getTablesRecord: () => state.tables,
      setTablesRecord: record => {
        state.tables = record;
      },
      getMeta: () => state.meta,
      setMeta: meta => {
        state.meta = meta;
      },
      appendJournal: message =>
        state.journal.push(JSON.parse(JSON.stringify(message))),
      readJournal: (from = 0) =>
        state.journal.slice(Math.max(0, from - state.base)),
      journalLength: () => state.base + state.journal.length,
      truncateJournal: upTo => {
        if (upTo <= state.base) {
          return;
        }
        upTo <= state.base + state.journal.length ||
          Fail`Cannot truncate journal beyond its length`;
        state.journal = state.journal.slice(upTo - state.base);
        state.base = upTo;
      },
    };
    return harden(workerStore);
  };

  /** @type {SiestaStore} */
  const store = {
    listWorkerNames: () => [...workers.keys()].sort(),
    provideWorkerStore,
    getPublications: () => ({ ...publications }),
    setPublication: (secret, record) => {
      publications[secret] = record;
    },
  };
  return harden(store);
};
harden(makeMemoryStore);
