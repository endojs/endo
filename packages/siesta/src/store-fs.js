// @ts-check
import harden from '@endo/harden';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
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
 */

/**
 * Durable storage for one worker: its CapTP tables record, its inbound
 * message journal, and its metadata (bootstrap slot, engine snapshot ref).
 *
 * @typedef {object} WorkerStore
 * @property {() => TablesRecord | undefined} getTablesRecord
 * @property {(record: TablesRecord) => void} setTablesRecord
 * @property {() => WorkerMeta} getMeta
 * @property {(meta: WorkerMeta) => void} setMeta
 * @property {(entry: unknown) => void} appendJournal
 * @property {(from?: number) => Array<any>} readJournal
 * @property {() => number} journalLength
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

    const readJournalLines = () => {
      if (!existsSync(journalPath)) {
        return [];
      }
      const text = readFileSync(journalPath, 'utf8');
      return text.split('\n').filter(line => line !== '');
    };

    /** @type {WorkerStore} */
    const workerStore = {
      getTablesRecord: () => readJsonMaybe(tablesPath),
      setTablesRecord: record =>
        writeFileSync(tablesPath, `${JSON.stringify(record)}\n`),
      getMeta: () => readJsonMaybe(metaPath) ?? {},
      setMeta: meta => writeFileSync(metaPath, `${JSON.stringify(meta)}\n`),
      appendJournal: entry =>
        appendFileSync(journalPath, `${JSON.stringify(entry)}\n`),
      readJournal: (from = 0) =>
        readJournalLines()
          .slice(from)
          .map(line => JSON.parse(line)),
      journalLength: () => readJournalLines().length,
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
      writeFileSync(
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
  /** @type {Map<string, { tables?: TablesRecord, meta: WorkerMeta, journal: Array<any> }>} */
  const workers = new Map();
  /** @type {Record<string, PublicationRecord>} */
  const publications = {};

  /** @param {string} name */
  const provideWorkerStore = name => {
    assertWorkerName(name);
    let entry = workers.get(name);
    if (!entry) {
      entry = { tables: undefined, meta: {}, journal: [] };
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
      readJournal: (from = 0) => state.journal.slice(from),
      journalLength: () => state.journal.length,
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
