// @ts-check
import harden from '@endo/harden';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

import { Fail, q } from '@endo/errors';

/**
 * The daemon-side record of one worker session: under the unified
 * daemon, export descriptions, resolver obligations, and the answer
 * epoch (worker-session-records.js).
 *
 * @typedef {Record<string, any>} TablesRecord
 */

/**
 * A publication binds an OCapN swissnum to the durable description of a
 * capability (worker-session-records.js), so the daemon can rebind its
 * locator after a restart.
 *
 * @typedef {Record<string, any>} PublicationRecord
 */

/**
 * @typedef {object} WorkerMeta
 * @property {string} [debugLabel] optional human-readable label; used
 *   only in diagnostics, never as an identifier
 * @property {string} [bootSlot] import slot of the worker's bootstrap facet
 * @property {string | null} [bootIface]
 * @property {{ ref: unknown, journalLength?: number, cut?: number } | null} [snapshot]
 *   the engine snapshot and the absolute journal index it subsumes —
 *   `journalLength` under the captp host, `cut` under the durable
 *   worker transport (protocol unification)
 * @property {number} [outboundSinceSnapshot] durable worker transport:
 *   count of worker→host OCapN frames processed since the last
 *   snapshot, persisted before each dispatch; a wake's replay discards
 *   regenerated frames up to this watermark
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
 * Durable storage for one resumable OCapN session: its identity and
 * export descriptions (meta) and its unacknowledged outbound frames.
 *
 * @typedef {object} SessionStore
 * @property {() => Record<string, any>} getMeta
 * @property {(meta: Record<string, any>) => void} setMeta
 * @property {(entry: { n: number, b64: string }) => void} appendFrame
 * @property {() => Array<{ n: number, b64: string }>} readFrames
 * @property {(upToN: number) => void} truncateFramesUpTo drops frames
 *   with sequence number <= upToN (the peer acknowledged them)
 */

/**
 * @typedef {object} SiestaStore
 * @property {() => Array<string>} listWorkerIds
 * @property {(workerId: string) => WorkerStore} provideWorkerStore
 * @property {(workerId: string) => void} deleteWorker removes the
 *   worker's durable state (tables, journal, meta) entirely
 * @property {() => Record<string, PublicationRecord>} getPublications
 * @property {(secret: string, record: PublicationRecord) => void} setPublication
 * @property {(secret: string) => void} deletePublication
 * @property {() => Array<string>} listSessionTokens
 * @property {(token: string) => SessionStore} provideSessionStore
 * @property {(token: string) => void} deleteSession
 */

// Worker ids are host-generated unguessable random hex, never
// user-chosen names: reaching a worker requires a capability (a
// publication, a durable cross-worker link, or a facade), not a string.
const WORKER_ID_PATTERN = /^[0-9a-f]{32}$/;

// Resume tokens arrive over the network and become directory names:
// validate the exact shape the durable netlayer mints before any
// filesystem use.
const SESSION_TOKEN_PATTERN = /^[0-9a-f]{32}$/;

/** @param {string} token */
export const isSessionToken = token =>
  typeof token === 'string' && SESSION_TOKEN_PATTERN.test(token);
harden(isSessionToken);

/** @param {string} token */
const assertSessionToken = token => {
  isSessionToken(token) ||
    Fail`Session token must match ${q(SESSION_TOKEN_PATTERN.source)}`;
};

/** @param {string} workerId */
export const assertWorkerId = workerId => {
  WORKER_ID_PATTERN.test(workerId) ||
    Fail`Worker id must match ${q(WORKER_ID_PATTERN.source)}, got ${q(
      workerId,
    )}`;
};
harden(assertWorkerId);

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
 * - `workers/<workerId>/meta.json`
 * - `workers/<workerId>/tables.json`
 * - `workers/<workerId>/journal.jsonl`
 * - `sessions/<token>/meta.json`
 * - `sessions/<token>/frames.jsonl`
 *
 * @param {string} statePath
 * @returns {SiestaStore}
 */
export const makeFsStore = statePath => {
  const workersPath = join(statePath, 'workers');
  const sessionsPath = join(statePath, 'sessions');
  const publicationsPath = join(statePath, 'publications.json');
  mkdirSync(workersPath, { recursive: true });

  /** @param {string} token */
  const makeSessionStore = token => {
    assertSessionToken(token);
    const sessionPath = join(sessionsPath, token);
    mkdirSync(sessionPath, { recursive: true });
    const metaPath = join(sessionPath, 'meta.json');
    const framesPath = join(sessionPath, 'frames.jsonl');

    /** @returns {Array<{ n: number, b64: string }>} */
    const readFramesFile = () => {
      if (!existsSync(framesPath)) {
        return [];
      }
      const lines = readFileSync(framesPath, 'utf8')
        .split('\n')
        .filter(line => line !== '');
      /** @type {Array<{ n: number, b64: string }>} */
      const entries = [];
      for (const line of lines) {
        try {
          entries.push(JSON.parse(line));
        } catch (_error) {
          // Torn tail from a crash mid-append: the frame was never
          // acknowledged, so the peer will retransmit-tolerate its loss.
          break;
        }
      }
      return entries;
    };

    /** @param {Array<{ n: number, b64: string }>} entries */
    const writeFramesFile = entries => {
      const text = [...entries.map(entry => JSON.stringify(entry)), ''].join(
        '\n',
      );
      writeFileAtomic(framesPath, text);
    };

    /** @type {SessionStore} */
    const sessionStore = {
      getMeta: () => readJsonMaybe(metaPath) ?? {},
      setMeta: meta => writeFileAtomic(metaPath, `${JSON.stringify(meta)}\n`),
      appendFrame: entry => {
        if (!existsSync(framesPath)) {
          writeFramesFile([]);
        }
        appendFileSync(framesPath, `${JSON.stringify(entry)}\n`);
      },
      readFrames: readFramesFile,
      truncateFramesUpTo: upToN => {
        writeFramesFile(readFramesFile().filter(entry => entry.n > upToN));
      },
    };
    return harden(sessionStore);
  };

  /** @param {string} workerId */
  const makeWorkerStore = workerId => {
    assertWorkerId(workerId);
    const workerPath = join(workersPath, workerId);
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
    listWorkerIds: () =>
      existsSync(workersPath) ? readdirSync(workersPath).sort() : [],
    provideWorkerStore: makeWorkerStore,
    deleteWorker: workerId => {
      assertWorkerId(workerId);
      rmSync(join(workersPath, workerId), { recursive: true, force: true });
    },
    getPublications: () => readJsonMaybe(publicationsPath) ?? {},
    setPublication: (secret, record) => {
      const publications = readJsonMaybe(publicationsPath) ?? {};
      publications[secret] = record;
      writeFileAtomic(
        publicationsPath,
        `${JSON.stringify(publications, undefined, 2)}\n`,
      );
    },
    deletePublication: secret => {
      const publications = readJsonMaybe(publicationsPath) ?? {};
      if (secret in publications) {
        delete publications[secret];
        writeFileAtomic(
          publicationsPath,
          `${JSON.stringify(publications, undefined, 2)}\n`,
        );
      }
    },
    listSessionTokens: () =>
      existsSync(sessionsPath) ? readdirSync(sessionsPath).sort() : [],
    provideSessionStore: makeSessionStore,
    deleteSession: token => {
      assertSessionToken(token);
      rmSync(join(sessionsPath, token), { recursive: true, force: true });
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

  /** @param {string} workerId */
  const provideWorkerStore = workerId => {
    assertWorkerId(workerId);
    let entry = workers.get(workerId);
    if (!entry) {
      entry = { tables: undefined, meta: {}, base: 0, journal: [] };
      workers.set(workerId, entry);
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

  /** @type {Map<string, { meta: Record<string, any>, frames: Array<{ n: number, b64: string }> }>} */
  const sessions = new Map();

  /** @param {string} token */
  const provideSessionStore = token => {
    assertSessionToken(token);
    let entry = sessions.get(token);
    if (!entry) {
      entry = { meta: {}, frames: [] };
      sessions.set(token, entry);
    }
    const state = entry;
    /** @type {SessionStore} */
    const sessionStore = {
      getMeta: () => state.meta,
      setMeta: meta => {
        state.meta = JSON.parse(JSON.stringify(meta));
      },
      appendFrame: frame => state.frames.push({ ...frame }),
      readFrames: () => state.frames.map(frame => ({ ...frame })),
      truncateFramesUpTo: upToN => {
        state.frames = state.frames.filter(frame => frame.n > upToN);
      },
    };
    return harden(sessionStore);
  };

  /** @type {SiestaStore} */
  const store = {
    listWorkerIds: () => [...workers.keys()].sort(),
    provideWorkerStore,
    deleteWorker: workerId => {
      workers.delete(workerId);
    },
    getPublications: () => ({ ...publications }),
    setPublication: (secret, record) => {
      publications[secret] = record;
    },
    deletePublication: secret => {
      delete publications[secret];
    },
    listSessionTokens: () => [...sessions.keys()].sort(),
    provideSessionStore,
    deleteSession: token => {
      sessions.delete(token);
    },
  };
  return harden(store);
};
harden(makeMemoryStore);
