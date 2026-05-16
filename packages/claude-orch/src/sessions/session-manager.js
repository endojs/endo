// @ts-check
/* global setImmediate */
/**
 * @import {
 *   CreateSessionRequest,
 *   OrchestratorConfig,
 *   Session,
 *   SessionRecord,
 *   SessionState,
 *   SessionSummary,
 * } from '../../protocol.types.js'
 */

import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';

/**
 * In-memory session table plus per-session lifecycle helpers.
 *
 * The session manager owns:
 *   - session id allocation
 *   - the boot nonce (single-use; see DESIGN.md §5.3)
 *   - per-session UDS path allocation under <config.sessionDir>/<id>/
 *   - state transitions and the table of records
 *   - optional disk persistence of the table to a sessions.json file
 *
 * It does NOT own QEMU, networking, RPC, or the API server. Those are
 * orchestrated by the higher-level main entrypoint, which calls
 * session-manager methods at the appropriate lifecycle points.
 *
 * @param {{
 *   config: OrchestratorConfig,
 *   persistencePath?: string,
 * }} opts
 */
export const makeSessionManager = ({ config, persistencePath }) => {
  /** @type {Map<string, SessionRecord>} */
  const sessions = new Map();
  let persistTimer = null;

  const persistNow = async () => {
    if (!persistencePath) return;
    const entries = Array.from(sessions.values()).map(r => ({
      ...r,
      // Drop runtime-only fields that don't survive restart.
      netAttachment: undefined,
    }));
    const tmp = `${persistencePath}.tmp`;
    await writeFile(tmp, JSON.stringify(entries, null, 2));
    await rename(tmp, persistencePath);
  };

  const schedulePersist = () => {
    if (!persistencePath) return;
    if (persistTimer) return;
    persistTimer = setImmediate(() => {
      persistTimer = null;
      persistNow().catch(() => {
        // best-effort
      });
    });
  };

  /**
   * @param {SessionRecord} record
   * @returns {Session}
   */
  const toSession = record => ({
    id: record.id,
    state: record.state,
    fsSocketPath: record.fsSocketPath,
    controlSocketPath: record.ctlSocketPath,
    attachSocketPath:
      record.request.attachMode === 'stream'
        ? record.attachSocketPath
        : undefined,
    createdAt: record.createdAt,
  });

  /**
   * @param {SessionRecord} record
   * @returns {SessionSummary}
   */
  const toSummary = record => ({
    id: record.id,
    state: record.state,
    createdAt: record.createdAt,
  });

  /**
   * Generate a session id. Short (8 hex) is appended to network device names
   * so the id needs no more entropy than that; the full id is the directory
   * name and the API handle.
   */
  const generateSessionId = () => randomUUID().replace(/-/g, '').slice(0, 16);

  /**
   * @param {CreateSessionRequest} request
   * @returns {Promise<SessionRecord>}
   */
  const createSession = async request => {
    const id = generateSessionId();
    const sessionDir = path.join(config.sessionDir, id);
    // 0o700: only the orchestrator UID can list/traverse the per-session
    // dir, which contains the fs/ctl/agent/stdio/attach UDS endpoints.
    // Anything looser would let any local group member connect to those
    // sockets and impersonate the session.
    await mkdir(sessionDir, { recursive: true, mode: 0o700 });

    /** @type {SessionRecord} */
    const record = {
      id,
      state: 'pending',
      request,
      bootNonce: randomBytes(32).toString('hex'),
      bootNonceUsed: false,
      sessionDir,
      fsSocketPath: path.join(sessionDir, 'fs.sock'),
      ctlSocketPath: path.join(sessionDir, 'ctl.sock'),
      agentSocketPath: path.join(sessionDir, 'agent.sock'),
      stdioSocketPath: path.join(sessionDir, 'stdio.sock'),
      qmpSocketPath: path.join(sessionDir, 'qmp.sock'),
      attachSocketPath: path.join(sessionDir, 'attach.sock'),
      createdAt: new Date().toISOString(),
    };

    sessions.set(id, record);
    schedulePersist();
    return record;
  };

  /**
   * @param {string} id
   * @returns {SessionRecord | undefined}
   */
  const getRecord = id => sessions.get(id);

  /**
   * @param {string} id
   * @returns {Session | undefined}
   */
  const getSession = id => {
    const record = sessions.get(id);
    return record ? toSession(record) : undefined;
  };

  /**
   * @returns {SessionSummary[]}
   */
  const listSessions = () => Array.from(sessions.values(), toSummary);

  /**
   * @param {string} id
   * @param {SessionState} state
   * @param {Partial<SessionRecord>} [updates]
   */
  const setState = (id, state, updates = {}) => {
    const record = sessions.get(id);
    if (!record) {
      throw new Error(`Unknown session ${id}`);
    }
    record.state = state;
    Object.assign(record, updates);
    if (state === 'ready' && !record.readyAt) {
      record.readyAt = new Date().toISOString();
    }
    if (
      (state === 'terminated' || state === 'boot_failed') &&
      !record.terminatedAt
    ) {
      record.terminatedAt = new Date().toISOString();
    }
    schedulePersist();
  };

  /**
   * Validate and single-use the boot nonce from a Hello message.
   *
   * @param {string} id
   * @param {string} nonce
   * @returns {boolean}
   */
  const consumeBootNonce = (id, nonce) => {
    const record = sessions.get(id);
    if (!record) return false;
    if (record.bootNonceUsed) return false;
    if (record.bootNonce !== nonce) return false;
    record.bootNonceUsed = true;
    record.bootNonce = ''; // purge from memory
    return true;
  };

  /**
   * Remove a session from the table and clean its UDS directory.
   * Leaves the network/QEMU side to the caller (it owns those handles).
   *
   * @param {string} id
   */
  const forget = async id => {
    const record = sessions.get(id);
    if (!record) return;
    sessions.delete(id);
    schedulePersist();
    await rm(record.sessionDir, { recursive: true, force: true });
  };

  /**
   * Restore session records from disk. Called at orchestrator startup.
   * Each restored record is set to state="terminated" because we cannot
   * prove the QEMU process is still alive without per-pid probing — the
   * caller (main.js) inspects vmPid against `kill 0` and re-elevates to
   * `ready` for sessions whose VMs are still alive.
   *
   * @returns {Promise<SessionRecord[]>}
   */
  const restoreFromDisk = async () => {
    if (!persistencePath) return [];
    let data;
    try {
      data = await readFile(persistencePath, 'utf8');
    } catch {
      return [];
    }
    /** @type {SessionRecord[]} */
    let parsed;
    try {
      parsed = JSON.parse(data);
    } catch {
      return [];
    }
    for (const rec of parsed) {
      // The bootNonce can't be reused; if a session somehow re-enters the
      // bootstrap path after restart, it must be torn down.
      rec.bootNonceUsed = true;
      rec.bootNonce = '';
      sessions.set(rec.id, rec);
    }
    return parsed;
  };

  return harden({
    createSession,
    getRecord,
    getSession,
    listSessions,
    setState,
    consumeBootNonce,
    forget,
    toSession,
    restoreFromDisk,
    persistNow,
  });
};
harden(makeSessionManager);
