// @ts-check

import harden from '@endo/harden';
import { q } from '@endo/errors';

/** @import { Config, Formula, FormulaNumber } from './types.js' */

/**
 * @typedef {object} DaemonDatabase
 * @property {import('better-sqlite3').Database} db - The underlying SQLite database handle.
 * @property {() => void} close
 * @property {(formulaNumber: string, nodeNumber: string, formula: Formula) => void} writeFormula
 * @property {(formulaNumber: string) => boolean} hasFormula
 * @property {(formulaNumber: string) => {node: string, formula: Formula}} readFormula
 * @property {(formulaNumber: string) => void} deleteFormula
 * @property {() => Array<{number: string, node: string}>} listFormulas
 * @property {(nodeNumber: string) => string[]} listFormulaNumbersByNode
 * @property {(key: string) => string | undefined} getState
 * @property {(key: string, value: string) => void} setState
 * @property {(publicKey: string, privateKey: string, agentId: string) => void} writeAgentKey
 * @property {(publicKey: string) => {publicKey: string, privateKey: string, agentId: string} | undefined} getAgentKey
 * @property {(publicKey: string) => boolean} hasAgentKey
 * @property {() => Array<{publicKey: string, privateKey: string, agentId: string}>} listAgentKeys
 * @property {(publicKey: string) => void} deleteAgentKey
 * @property {(publicKey: string, daemonNode: string) => void} writeRemoteAgentKey
 * @property {(publicKey: string) => string | undefined} getRemoteAgentKey
 * @property {(storeNumber: string, storeType: string, name: string, formulaId: string) => void} writePetStoreEntry
 * @property {(storeNumber: string, storeType: string, name: string) => void} deletePetStoreEntry
 * @property {(storeNumber: string, storeType: string, fromName: string, toName: string) => void} renamePetStoreEntry
 * @property {(storeNumber: string, storeType: string) => Array<{name: string, formulaId: string}>} listPetStoreEntries
 * @property {(storeNumber: string, storeType: string) => void} deletePetStore
 * @property {(guestPublicKey: string, formulaNumber: string) => void} writeRetention
 * @property {(guestPublicKey: string, formulaNumber: string) => void} deleteRetention
 * @property {(guestPublicKey: string) => Array<{formulaNumber: string}>} listRetention
 * @property {(guestPublicKey: string, formulaNumbers: string[]) => void} replaceRetention
 * @property {(guestPublicKey: string) => void} deleteAllRetention
 * @property {(storeNumber: string, name: string, locator: string | null, timestamp: number, writer: string) => void} writeSyncedEntry
 * @property {(storeNumber: string, name: string) => void} deleteSyncedEntry
 * @property {(storeNumber: string) => Array<{name: string, locator: string | null, timestamp: number, writer: string}>} listSyncedEntries
 * @property {(storeNumber: string) => void} deleteAllSyncedEntries
 * @property {(storeNumber: string) => {localClock: number, remoteAckedClock: number}} getSyncedMeta
 * @property {(storeNumber: string, localClock: number, remoteAckedClock: number) => void} setSyncedMeta
 * @property {(storeNumber: string) => void} deleteSyncedMeta
 */

const SCHEMA_VERSION = 2;

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS daemon_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS formula (
    number TEXT PRIMARY KEY,
    node TEXT NOT NULL DEFAULT '',
    type TEXT NOT NULL,
    body TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_formula_node ON formula(node);

  CREATE TABLE IF NOT EXISTS agent_key (
    public_key TEXT PRIMARY KEY,
    private_key TEXT NOT NULL,
    agent_id TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS remote_agent_key (
    public_key TEXT PRIMARY KEY,
    daemon_node TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS pet_store_entry (
    store_number TEXT NOT NULL,
    store_type TEXT NOT NULL,
    name TEXT NOT NULL,
    formula_id TEXT NOT NULL,
    PRIMARY KEY (store_number, store_type, name)
  );

  CREATE TABLE IF NOT EXISTS retention (
    guest_public_key TEXT NOT NULL,
    retained_formula_number TEXT NOT NULL,
    PRIMARY KEY (guest_public_key, retained_formula_number)
  );

  CREATE TABLE IF NOT EXISTS synced_store_entry (
    store_number TEXT NOT NULL,
    name TEXT NOT NULL,
    locator TEXT,
    timestamp INTEGER NOT NULL,
    writer TEXT NOT NULL,
    PRIMARY KEY (store_number, name)
  );

  CREATE TABLE IF NOT EXISTS synced_store_meta (
    store_number TEXT PRIMARY KEY,
    local_clock INTEGER NOT NULL DEFAULT 0,
    remote_acked_clock INTEGER NOT NULL DEFAULT 0
  );
`;

/**
 * Open or create the daemon SQLite database.
 *
 * The Database constructor is injectable so the same schema and
 * statement layer can target either Node's `better-sqlite3` (the
 * default, supplied by `daemon-database-node.js`) or the XS
 * Rust-supervisor shim (`./better-sqlite3-xs.js`), both of which
 * present the same synchronous prepared-statement surface.
 *
 * @param {Config} config
 * @param {object} options
 * @param {new (path: string) => any} options.Database
 * @returns {DaemonDatabase}
 */
export const makeDaemonDatabase = (config, options) => {
  const { Database } = options;
  if (typeof Database !== 'function') {
    throw new TypeError(
      'makeDaemonDatabase requires options.Database (a better-sqlite3-compatible constructor)',
    );
  }
  const dbPath = `${config.statePath}/endo.sqlite`;
  const db = new Database(dbPath);

  // Enable WAL mode for better concurrent read performance.
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Create schema if needed.
  db.exec(SCHEMA_SQL);

  // Check/set schema version.
  const versionRow = db
    .prepare('SELECT version FROM schema_version LIMIT 1')
    .get();
  if (versionRow === undefined) {
    db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(
      SCHEMA_VERSION,
    );
  }

  // -- Prepared statements --

  const stmtWriteFormula = db.prepare(
    'INSERT OR REPLACE INTO formula (number, node, type, body) VALUES (?, ?, ?, ?)',
  );
  const stmtReadFormula = db.prepare(
    'SELECT node, body FROM formula WHERE number = ?',
  );
  const stmtHasFormula = db.prepare('SELECT 1 FROM formula WHERE number = ?');
  const stmtDeleteFormula = db.prepare('DELETE FROM formula WHERE number = ?');
  const stmtListFormulas = db.prepare('SELECT number, node FROM formula');
  const stmtListFormulaNumbersByNode = db.prepare(
    'SELECT number FROM formula WHERE node = ?',
  );

  const stmtGetState = db.prepare(
    'SELECT value FROM daemon_state WHERE key = ?',
  );
  const stmtSetState = db.prepare(
    'INSERT OR REPLACE INTO daemon_state (key, value) VALUES (?, ?)',
  );

  const stmtWriteAgentKey = db.prepare(
    'INSERT OR REPLACE INTO agent_key (public_key, private_key, agent_id) VALUES (?, ?, ?)',
  );
  const stmtGetAgentKey = db.prepare(
    'SELECT public_key AS publicKey, private_key AS privateKey, agent_id AS agentId FROM agent_key WHERE public_key = ?',
  );
  const stmtHasAgentKey = db.prepare(
    'SELECT 1 FROM agent_key WHERE public_key = ?',
  );
  const stmtListAgentKeys = db.prepare(
    'SELECT public_key AS publicKey, private_key AS privateKey, agent_id AS agentId FROM agent_key',
  );
  const stmtDeleteAgentKey = db.prepare(
    'DELETE FROM agent_key WHERE public_key = ?',
  );

  const stmtWriteRemoteAgentKey = db.prepare(
    'INSERT OR REPLACE INTO remote_agent_key (public_key, daemon_node) VALUES (?, ?)',
  );
  const stmtGetRemoteAgentKey = db.prepare(
    'SELECT daemon_node AS daemonNode FROM remote_agent_key WHERE public_key = ?',
  );

  const stmtWritePetEntry = db.prepare(
    'INSERT OR REPLACE INTO pet_store_entry (store_number, store_type, name, formula_id) VALUES (?, ?, ?, ?)',
  );
  const stmtDeletePetEntry = db.prepare(
    'DELETE FROM pet_store_entry WHERE store_number = ? AND store_type = ? AND name = ?',
  );
  const stmtRenamePetEntry = db.prepare(
    'UPDATE pet_store_entry SET name = ? WHERE store_number = ? AND store_type = ? AND name = ?',
  );
  const stmtListPetEntries = db.prepare(
    'SELECT name, formula_id AS formulaId FROM pet_store_entry WHERE store_number = ? AND store_type = ?',
  );
  const stmtDeleteAllPetEntries = db.prepare(
    'DELETE FROM pet_store_entry WHERE store_number = ? AND store_type = ?',
  );

  const stmtWriteRetention = db.prepare(
    'INSERT OR IGNORE INTO retention (guest_public_key, retained_formula_number) VALUES (?, ?)',
  );
  const stmtDeleteRetention = db.prepare(
    'DELETE FROM retention WHERE guest_public_key = ? AND retained_formula_number = ?',
  );
  const stmtListRetention = db.prepare(
    'SELECT retained_formula_number AS formulaNumber FROM retention WHERE guest_public_key = ?',
  );
  const stmtDeleteAllRetention = db.prepare(
    'DELETE FROM retention WHERE guest_public_key = ?',
  );

  const stmtWriteSyncedEntry = db.prepare(
    'INSERT OR REPLACE INTO synced_store_entry (store_number, name, locator, timestamp, writer) VALUES (?, ?, ?, ?, ?)',
  );
  const stmtDeleteSyncedEntry = db.prepare(
    'DELETE FROM synced_store_entry WHERE store_number = ? AND name = ?',
  );
  const stmtListSyncedEntries = db.prepare(
    'SELECT name, locator, timestamp, writer FROM synced_store_entry WHERE store_number = ?',
  );
  const stmtDeleteAllSyncedEntries = db.prepare(
    'DELETE FROM synced_store_entry WHERE store_number = ?',
  );

  const stmtGetSyncedMeta = db.prepare(
    'SELECT local_clock AS localClock, remote_acked_clock AS remoteAckedClock FROM synced_store_meta WHERE store_number = ?',
  );
  const stmtSetSyncedMeta = db.prepare(
    'INSERT OR REPLACE INTO synced_store_meta (store_number, local_clock, remote_acked_clock) VALUES (?, ?, ?)',
  );
  const stmtDeleteSyncedMeta = db.prepare(
    'DELETE FROM synced_store_meta WHERE store_number = ?',
  );

  // -- Formula operations --

  /** @param {string} formulaNumber */
  const hasFormula = formulaNumber => {
    return stmtHasFormula.get(formulaNumber) !== undefined;
  };

  /** @param {string} formulaNumber */
  const readFormula = formulaNumber => {
    const row = /** @type {{node: string, body: string} | undefined} */ (
      stmtReadFormula.get(formulaNumber)
    );
    if (row === undefined) {
      throw new ReferenceError(
        `No formula exists for number ${q(formulaNumber)}`,
      );
    }
    try {
      return { node: row.node, formula: JSON.parse(row.body) };
    } catch (error) {
      throw new TypeError(
        `Corrupt formula for number ${q(formulaNumber)}: ${/** @type {Error} */ (error).message}`,
      );
    }
  };

  /**
   * @param {string} formulaNumber
   * @param {string} nodeNumber
   * @param {Formula} formula
   */
  const writeFormula = (formulaNumber, nodeNumber, formula) => {
    stmtWriteFormula.run(
      formulaNumber,
      nodeNumber,
      formula.type,
      JSON.stringify(formula),
    );
  };

  /** @param {string} formulaNumber */
  const deleteFormula = formulaNumber => {
    stmtDeleteFormula.run(formulaNumber);
  };

  const listFormulas = () => {
    return /** @type {Array<{number: string, node: string}>} */ (
      stmtListFormulas.all()
    );
  };

  /**
   * Return all formula numbers whose node matches the given value.
   * Used to compute the retention set: "what formulas from peer X
   * do we hold locally?"
   *
   * @param {string} nodeNumber
   * @returns {string[]}
   */
  const listFormulaNumbersByNode = nodeNumber => {
    const rows = /** @type {Array<{number: string}>} */ (
      stmtListFormulaNumbersByNode.all(nodeNumber)
    );
    return rows.map(r => r.number);
  };

  // -- Daemon state --

  /** @param {string} key */
  const getState = key => {
    const row = /** @type {{value: string} | undefined} */ (
      stmtGetState.get(key)
    );
    return row?.value;
  };

  /**
   * @param {string} key
   * @param {string} value
   */
  const setState = (key, value) => {
    stmtSetState.run(key, value);
  };

  // -- Agent key operations --

  /**
   * @param {string} publicKey
   * @param {string} privateKey
   * @param {string} agentId
   */
  const writeAgentKey = (publicKey, privateKey, agentId) => {
    stmtWriteAgentKey.run(publicKey, privateKey, agentId);
  };

  /** @param {string} publicKey */
  const getAgentKey = publicKey => {
    return /** @type {{publicKey: string, privateKey: string, agentId: string} | undefined} */ (
      stmtGetAgentKey.get(publicKey)
    );
  };

  /** @param {string} publicKey */
  const hasAgentKey = publicKey => {
    return stmtHasAgentKey.get(publicKey) !== undefined;
  };

  const listAgentKeys = () => {
    return /** @type {Array<{publicKey: string, privateKey: string, agentId: string}>} */ (
      stmtListAgentKeys.all()
    );
  };

  /** @param {string} publicKey */
  const deleteAgentKey = publicKey => {
    stmtDeleteAgentKey.run(publicKey);
  };

  // -- Remote agent key operations --

  /**
   * Record that a remote agent key belongs to a specific daemon.
   *
   * @param {string} publicKey - The remote agent's public key.
   * @param {string} daemonNode - The daemon's localNodeNumber.
   */
  const writeRemoteAgentKey = (publicKey, daemonNode) => {
    stmtWriteRemoteAgentKey.run(publicKey, daemonNode);
  };

  /**
   * Look up which daemon owns a remote agent key.
   *
   * @param {string} publicKey
   * @returns {string | undefined} The daemon's node number, or undefined.
   */
  const getRemoteAgentKey = publicKey => {
    const row = /** @type {{daemonNode: string} | undefined} */ (
      stmtGetRemoteAgentKey.get(publicKey)
    );
    return row?.daemonNode;
  };

  // -- Pet store operations --

  /**
   * @param {string} storeNumber
   * @param {string} storeType
   * @param {string} name
   * @param {string} formulaId
   */
  const writePetStoreEntry = (storeNumber, storeType, name, formulaId) => {
    stmtWritePetEntry.run(storeNumber, storeType, name, formulaId);
  };

  /**
   * @param {string} storeNumber
   * @param {string} storeType
   * @param {string} name
   */
  const deletePetStoreEntry = (storeNumber, storeType, name) => {
    stmtDeletePetEntry.run(storeNumber, storeType, name);
  };

  /**
   * @param {string} storeNumber
   * @param {string} storeType
   * @param {string} fromName
   * @param {string} toName
   */
  const renamePetStoreEntry = (storeNumber, storeType, fromName, toName) => {
    // Delete any existing entry at the target name first to avoid
    // unique constraint violations, then rename.
    stmtDeletePetEntry.run(storeNumber, storeType, toName);
    stmtRenamePetEntry.run(toName, storeNumber, storeType, fromName);
  };

  /**
   * @param {string} storeNumber
   * @param {string} storeType
   * @returns {Array<{name: string, formulaId: string}>}
   */
  const listPetStoreEntries = (storeNumber, storeType) => {
    return /** @type {Array<{name: string, formulaId: string}>} */ (
      stmtListPetEntries.all(storeNumber, storeType)
    );
  };

  /**
   * @param {string} storeNumber
   * @param {string} storeType
   */
  const deletePetStore = (storeNumber, storeType) => {
    stmtDeleteAllPetEntries.run(storeNumber, storeType);
  };

  // -- Retention operations --

  /**
   * @param {string} guestPublicKey
   * @param {string} formulaNumber
   */
  const writeRetention = (guestPublicKey, formulaNumber) => {
    stmtWriteRetention.run(guestPublicKey, formulaNumber);
  };

  /**
   * @param {string} guestPublicKey
   * @param {string} formulaNumber
   */
  const deleteRetention = (guestPublicKey, formulaNumber) => {
    stmtDeleteRetention.run(guestPublicKey, formulaNumber);
  };

  /**
   * @param {string} guestPublicKey
   * @returns {Array<{formulaNumber: string}>}
   */
  const listRetention = guestPublicKey => {
    return /** @type {Array<{formulaNumber: string}>} */ (
      stmtListRetention.all(guestPublicKey)
    );
  };

  /**
   * Replace the entire retention set for a guest with a new set.
   *
   * @param {string} guestPublicKey
   * @param {string[]} formulaNumbers
   */
  const replaceRetention = (guestPublicKey, formulaNumbers) => {
    stmtDeleteAllRetention.run(guestPublicKey);
    for (const num of formulaNumbers) {
      stmtWriteRetention.run(guestPublicKey, num);
    }
  };

  /** @param {string} guestPublicKey */
  const deleteAllRetention = guestPublicKey => {
    stmtDeleteAllRetention.run(guestPublicKey);
  };

  // -- Synced store operations --

  /**
   * @param {string} storeNumber
   * @param {string} name
   * @param {string | null} locator
   * @param {number} timestamp
   * @param {string} writer
   */
  const writeSyncedEntry = (storeNumber, name, locator, timestamp, writer) => {
    stmtWriteSyncedEntry.run(storeNumber, name, locator, timestamp, writer);
  };

  /**
   * @param {string} storeNumber
   * @param {string} name
   */
  const deleteSyncedEntry = (storeNumber, name) => {
    stmtDeleteSyncedEntry.run(storeNumber, name);
  };

  /**
   * @param {string} storeNumber
   * @returns {Array<{name: string, locator: string | null, timestamp: number, writer: string}>}
   */
  const listSyncedEntries = storeNumber => {
    return /** @type {Array<{name: string, locator: string | null, timestamp: number, writer: string}>} */ (
      stmtListSyncedEntries.all(storeNumber)
    );
  };

  /** @param {string} storeNumber */
  const deleteAllSyncedEntries = storeNumber => {
    stmtDeleteAllSyncedEntries.run(storeNumber);
  };

  /**
   * @param {string} storeNumber
   * @returns {{localClock: number, remoteAckedClock: number}}
   */
  const getSyncedMeta = storeNumber => {
    const row =
      /** @type {{localClock: number, remoteAckedClock: number} | undefined} */ (
        stmtGetSyncedMeta.get(storeNumber)
      );
    if (row === undefined) {
      return { localClock: 0, remoteAckedClock: 0 };
    }
    return row;
  };

  /**
   * @param {string} storeNumber
   * @param {number} localClock
   * @param {number} remoteAckedClock
   */
  const setSyncedMeta = (storeNumber, localClock, remoteAckedClock) => {
    stmtSetSyncedMeta.run(storeNumber, localClock, remoteAckedClock);
  };

  /** @param {string} storeNumber */
  const deleteSyncedMeta = storeNumber => {
    stmtDeleteSyncedMeta.run(storeNumber);
  };

  const close = () => {
    db.close();
  };

  return harden({
    db,
    close,
    hasFormula,
    writeFormula,
    readFormula,
    deleteFormula,
    listFormulas,
    listFormulaNumbersByNode,
    getState,
    setState,
    writeAgentKey,
    getAgentKey,
    hasAgentKey,
    listAgentKeys,
    deleteAgentKey,
    writeRemoteAgentKey,
    getRemoteAgentKey,
    writePetStoreEntry,
    deletePetStoreEntry,
    renamePetStoreEntry,
    listPetStoreEntries,
    deletePetStore,
    writeRetention,
    deleteRetention,
    listRetention,
    replaceRetention,
    deleteAllRetention,
    writeSyncedEntry,
    deleteSyncedEntry,
    listSyncedEntries,
    deleteAllSyncedEntries,
    getSyncedMeta,
    setSyncedMeta,
    deleteSyncedMeta,
  });
};
harden(makeDaemonDatabase);
