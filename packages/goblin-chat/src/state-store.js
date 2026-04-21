// @ts-check
/* global process */

/**
 * Persistent on-disk state for the goblin-chat TUI.
 *
 * Stores two things between sessions:
 *   - `name`         the user's `self-proposed-name`.
 *   - `recentRooms`  a most-recent-first list of past chatroom URIs,
 *                    with optional `displayName` (the room's
 *                    `self-proposed-name`) and `lastJoinedAt` for the
 *                    "join previous chat" picker.
 *
 * File location follows the XDG Base Directory spec where possible:
 *   $XDG_CONFIG_HOME/goblin-chat/state.json   (if set)
 *   $HOME/.config/goblin-chat/state.json      (POSIX fallback)
 *   $APPDATA/goblin-chat/state.json           (Windows)
 *
 * Reads are synchronous and resilient: a missing file or a corrupted
 * file both yield the default (empty) state with no warning at the
 * call site — the TUI's own log panel surfaces issues via the
 * optional `onError` callback.
 *
 * Writes are also synchronous (the persisted state is tiny — kilobytes
 * at most — and we only write on user actions like rename or join).
 * Atomic-write via `<file>.tmp` + `rename` so a crash mid-write can't
 * leave a half-written file on disk.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve as resolvePath } from 'node:path';

const MAX_RECENT_ROOMS = 32;

/**
 * @typedef {object} RecentRoom
 * @property {string} uri
 *   The full `ocapn://…/s/<base64url>?…` sturdyref URI as the user
 *   originally pasted it. We keep the raw string rather than a parsed
 *   form so future re-joins go through the same parser path and any
 *   parser-improvement applies retroactively.
 * @property {string} [displayName]
 *   The chatroom's `self-proposed-name` as observed on the most recent
 *   successful join. Optional — older entries (or rooms whose name
 *   lookup failed) won't have it. Only used as a label in the picker.
 * @property {string} lastJoinedAt
 *   ISO-8601 wallclock of the most recent successful join. Used to
 *   sort the picker most-recent-first; also handy for users to spot a
 *   stale entry.
 *
 * @typedef {object} PersistedState
 * @property {string} [name]
 *   `self-proposed-name` to use on the next join. Persists across
 *   sessions so the user doesn't have to retype it.
 * @property {RecentRoom[]} recentRooms
 *   Most-recent-first; bounded at `MAX_RECENT_ROOMS` entries.
 */

/** @returns {PersistedState} */
const emptyState = () => ({ recentRooms: [] });

/**
 * Resolve the on-disk path to the persisted state file. Honors
 * `GOBLIN_CHAT_STATE_FILE` for tests / advanced users; otherwise picks
 * the platform-appropriate location.
 *
 * @returns {string}
 */
export const defaultStateFilePath = () => {
  const override = process.env.GOBLIN_CHAT_STATE_FILE;
  if (override && override.length > 0) {
    return resolvePath(override);
  }
  // XDG: explicit XDG_CONFIG_HOME wins on any platform that sets it,
  // since some Linux/macOS users keep all dotfiles under a non-default
  // root via XDG.
  const xdg = process.env.XDG_CONFIG_HOME;
  if (xdg && xdg.length > 0) {
    return join(xdg, 'goblin-chat', 'state.json');
  }
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA;
    if (appData && appData.length > 0) {
      return join(appData, 'goblin-chat', 'state.json');
    }
  }
  return join(homedir(), '.config', 'goblin-chat', 'state.json');
};

/**
 * Validate-and-coerce a raw JSON parse into the persisted-state shape.
 * Anything we don't recognise is dropped silently — the file format is
 * an internal cache, not an API.
 *
 * @param {unknown} raw
 * @returns {PersistedState}
 */
const coerce = raw => {
  if (!raw || typeof raw !== 'object') return emptyState();
  const r = /** @type {Record<string, unknown>} */ (raw);
  /** @type {PersistedState} */
  const out = emptyState();
  if (typeof r.name === 'string' && r.name.length > 0) {
    out.name = r.name;
  }
  if (Array.isArray(r.recentRooms)) {
    for (const item of r.recentRooms) {
      if (item && typeof item === 'object') {
        const rec = /** @type {Record<string, unknown>} */ (item);
        if (typeof rec.uri === 'string' && rec.uri.length > 0) {
          /** @type {RecentRoom} */
          const room = {
            uri: rec.uri,
            lastJoinedAt:
              typeof rec.lastJoinedAt === 'string'
                ? rec.lastJoinedAt
                : new Date(0).toISOString(),
          };
          if (
            typeof rec.displayName === 'string' &&
            rec.displayName.length > 0
          ) {
            room.displayName = rec.displayName;
          }
          out.recentRooms.push(room);
        }
      }
    }
  }
  return out;
};

/**
 * @typedef {object} StateStore
 * @property {string} filePath
 * @property {() => PersistedState} read
 *   Snapshot of the in-memory state (also reflects the on-disk file at
 *   construction time). Returns a *copy* so callers can't mutate
 *   internal state by accident.
 * @property {(name: string) => void} setName
 * @property {(uri: string, displayName?: string) => void} recordJoin
 *   Push the room to the front of `recentRooms` (deduped by `uri`),
 *   stamp `lastJoinedAt` to now, and persist. If the room is already
 *   present, its existing `displayName` is preserved unless the new
 *   call provides one.
 * @property {(uri: string) => void} forgetRoom
 *   Remove a room from `recentRooms` (e.g. so the user can prune a
 *   stale entry). No-op if the URI isn't present.
 */

/**
 * Open (or create) the state store. Reads the file once at
 * construction; subsequent mutators write through synchronously. The
 * store keeps an in-memory copy so the hot path (rendering the recent
 * list) doesn't re-read the file on every frame.
 *
 * @param {object} [options]
 * @param {string} [options.filePath]   Override the default location.
 * @param {(err: unknown, op: 'read' | 'write') => void} [options.onError]
 *   Optional sink for IO errors. Defaults to a no-op so a busted home
 *   directory can't crash the TUI on first launch.
 * @returns {StateStore}
 */
export const openStateStore = ({ filePath, onError } = {}) => {
  const path = filePath || defaultStateFilePath();
  const reportError = onError || (() => undefined);

  /** @type {PersistedState} */
  let state = emptyState();
  try {
    if (existsSync(path)) {
      const text = readFileSync(path, 'utf8');
      state = coerce(JSON.parse(text));
    }
  } catch (err) {
    reportError(err, 'read');
    state = emptyState();
  }

  const persist = () => {
    try {
      mkdirSync(dirname(path), { recursive: true });
      const tmp = `${path}.tmp`;
      writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
      // `renameSync` is atomic on POSIX (and best-effort on Windows);
      // either the new file is fully present or the old one survives.
      renameSync(tmp, path);
    } catch (err) {
      reportError(err, 'write');
    }
  };

  /** @returns {PersistedState} */
  const read = () => ({
    name: state.name,
    recentRooms: state.recentRooms.map(r => ({ ...r })),
  });

  /** @param {string} name */
  const setName = name => {
    const trimmed = name.trim();
    if (trimmed.length === 0) return;
    if (state.name === trimmed) return;
    state = { ...state, name: trimmed };
    persist();
  };

  /**
   * @param {string} uri
   * @param {string} [displayName]
   */
  const recordJoin = (uri, displayName) => {
    const now = new Date().toISOString();
    const existing = state.recentRooms.find(r => r.uri === uri);
    /** @type {RecentRoom} */
    const updated = {
      uri,
      lastJoinedAt: now,
      ...(displayName ?? existing?.displayName
        ? { displayName: displayName ?? existing?.displayName }
        : {}),
    };
    const others = state.recentRooms.filter(r => r.uri !== uri);
    const recentRooms = [updated, ...others].slice(0, MAX_RECENT_ROOMS);
    state = { ...state, recentRooms };
    persist();
  };

  /** @param {string} uri */
  const forgetRoom = uri => {
    const next = state.recentRooms.filter(r => r.uri !== uri);
    if (next.length === state.recentRooms.length) return;
    state = { ...state, recentRooms: next };
    persist();
  };

  return harden({
    filePath: path,
    read,
    setName,
    recordJoin,
    forgetRoom,
  });
};
