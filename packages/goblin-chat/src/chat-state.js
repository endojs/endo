// @ts-check

/**
 * Pure state module for the goblin-chat TUI.
 *
 * Owns the typedefs, the reducer, the initial state, and pure helpers
 * (`formatError`, `lookupName`). Has no dependency on React, ink, or
 * `@endo/eventual-send`, so it can be reasoned about and unit-tested in
 * isolation from the view layer.
 *
 * The reducer state is split into three append-only logs:
 *   - `messages`   chat lines (incl. our own).
 *   - `events`     room transitions + status meta (joins, leaves, info, errors).
 *   - `logs`       OCapN-side log lines piped from `client`/`netlayer`.
 *
 * Each `messages`/`events` entry carries a monotonically-increasing
 * `seq` so the view can merge the two streams chronologically without
 * losing event identity. `logs` get their own id sequence — they're
 * rendered in a separate panel.
 *
 * `userNames` is a Map keyed by user capability; entries are populated
 * lazily by background `self-proposed-name` lookups so the view never
 * blocks waiting on a name to render.
 */

const MAX_MESSAGES = 1000;
const MAX_EVENTS = 500;
const MAX_LOGS = 500;

/**
 * @typedef {{ kind: 'self', name: string } | { kind: 'remote', user: object }} MessageSender
 *
 * @typedef {{
 *   id: number,
 *   seq: number,
 *   timestamp: number,
 *   sender: MessageSender,
 *   text: string,
 * }} ChatMessage
 *
 * @typedef {(
 *   | { id: number, seq: number, timestamp: number, kind: 'joined', user: object }
 *   | { id: number, seq: number, timestamp: number, kind: 'left', user: object }
 *   | { id: number, seq: number, timestamp: number, kind: 'present', users: object[] }
 *   | { id: number, seq: number, timestamp: number, kind: 'info', text: string }
 *   | { id: number, seq: number, timestamp: number, kind: 'error', text: string }
 * )} SystemEvent
 *
 * @typedef {'log' | 'info' | 'error'} LogLevel
 *
 * @typedef {{
 *   id: number,
 *   timestamp: number,
 *   level: LogLevel,
 *   source: string,
 *   text: string,
 * }} LogEntry
 *
 * High-level UI phases. Roughly:
 *   - `menu`              main menu (set name / join new / host / join previous)
 *   - `name-input`        single-line text editor for the user's name
 *   - `uri-input`         single-line text editor for an ocapn:// URI
 *   - `host-name-input`   single-line text editor for a chatroom name to host
 *   - `recent-list`       list-picker over `recentRooms`
 *   - `connecting`        joinRoom (or hostRoom) in flight, no input accepted
 *   - `chat`              in a room, normal chat input
 *
 * @typedef {(
 *   | 'menu'
 *   | 'name-input'
 *   | 'uri-input'
 *   | 'host-name-input'
 *   | 'recent-list'
 *   | 'connecting'
 *   | 'chat'
 * )} Phase
 *
 * @typedef {{
 *   messages: ChatMessage[],
 *   events: SystemEvent[],
 *   logs: LogEntry[],
 *   userNames: Map<object, string>,
 *   nextId: number,
 *   nextSeq: number,
 *   nextLogId: number,
 *   status: string,
 *   roomName: string | undefined,
 *   phase: Phase,
 * }} State
 *
 * @typedef {(
 *   | { type: 'message-received', user: object, text: string }
 *   | { type: 'message-sent', name: string, text: string }
 *   | { type: 'user-joined', user: object }
 *   | { type: 'user-left', user: object }
 *   | { type: 'users-present', users: object[] }
 *   | { type: 'info', text: string }
 *   | { type: 'error', text: string }
 *   | { type: 'log', level: LogLevel, source: string, text: string }
 *   | { type: 'name-resolved', user: object, name: string }
 *   | { type: 'set-status', status: string }
 *   | { type: 'set-phase', phase: Phase }
 *   | { type: 'set-room', roomName: string }
 *   | { type: 'reset-room' }
 * )} Action
 */

/** @type {State} */
export const initialState = {
  messages: [],
  events: [],
  logs: [],
  userNames: new Map(),
  nextId: 1,
  nextSeq: 1,
  nextLogId: 1,
  status: 'main menu',
  roomName: undefined,
  phase: 'menu',
};

/**
 * @template T
 * @param {T[]} list
 * @param {number} max
 * @returns {T[]}
 */
const trimTail = (list, max) =>
  list.length > max ? list.slice(list.length - max) : list;

/**
 * @param {State} state
 * @param {Action} action
 * @returns {State}
 */
export const reducer = (state, action) => {
  switch (action.type) {
    case 'message-received': {
      /** @type {ChatMessage} */
      const message = {
        id: state.nextId,
        seq: state.nextSeq,
        timestamp: Date.now(),
        sender: { kind: 'remote', user: action.user },
        text: action.text,
      };
      return {
        ...state,
        messages: trimTail([...state.messages, message], MAX_MESSAGES),
        nextId: state.nextId + 1,
        nextSeq: state.nextSeq + 1,
      };
    }
    case 'message-sent': {
      /** @type {ChatMessage} */
      const message = {
        id: state.nextId,
        seq: state.nextSeq,
        timestamp: Date.now(),
        sender: { kind: 'self', name: action.name },
        text: action.text,
      };
      return {
        ...state,
        messages: trimTail([...state.messages, message], MAX_MESSAGES),
        nextId: state.nextId + 1,
        nextSeq: state.nextSeq + 1,
      };
    }
    case 'user-joined':
    case 'user-left': {
      /** @type {SystemEvent} */
      const event = {
        id: state.nextId,
        seq: state.nextSeq,
        timestamp: Date.now(),
        kind: action.type === 'user-joined' ? 'joined' : 'left',
        user: action.user,
      };
      return {
        ...state,
        events: trimTail([...state.events, event], MAX_EVENTS),
        nextId: state.nextId + 1,
        nextSeq: state.nextSeq + 1,
      };
    }
    case 'users-present': {
      /** @type {SystemEvent} */
      const event = {
        id: state.nextId,
        seq: state.nextSeq,
        timestamp: Date.now(),
        kind: 'present',
        users: action.users,
      };
      return {
        ...state,
        events: trimTail([...state.events, event], MAX_EVENTS),
        nextId: state.nextId + 1,
        nextSeq: state.nextSeq + 1,
      };
    }
    case 'info':
    case 'error': {
      /** @type {SystemEvent} */
      const event = {
        id: state.nextId,
        seq: state.nextSeq,
        timestamp: Date.now(),
        kind: action.type,
        text: action.text,
      };
      return {
        ...state,
        events: trimTail([...state.events, event], MAX_EVENTS),
        nextId: state.nextId + 1,
        nextSeq: state.nextSeq + 1,
      };
    }
    case 'log': {
      /** @type {LogEntry} */
      const entry = {
        id: state.nextLogId,
        timestamp: Date.now(),
        level: action.level,
        source: action.source,
        text: action.text,
      };
      return {
        ...state,
        logs: trimTail([...state.logs, entry], MAX_LOGS),
        nextLogId: state.nextLogId + 1,
      };
    }
    case 'name-resolved': {
      // Skip if we already have a (presumably good) name for this user; the
      // first answer wins so a slow second lookup can't clobber it.
      if (state.userNames.has(action.user)) {
        return state;
      }
      const userNames = new Map(state.userNames);
      userNames.set(action.user, action.name);
      return { ...state, userNames };
    }
    case 'set-status':
      return { ...state, status: action.status };
    case 'set-phase':
      return { ...state, phase: action.phase };
    case 'set-room':
      return { ...state, roomName: action.roomName };
    case 'reset-room':
      return {
        ...state,
        messages: [],
        events: [],
        userNames: new Map(),
        roomName: undefined,
      };
    default:
      return state;
  }
};

/**
 * @param {unknown} err
 * @returns {string}
 */
export const formatError = err => {
  if (err instanceof Error) {
    return err.stack ? `${err.message}\n${err.stack}` : err.message;
  }
  try {
    return String(err);
  } catch (_) {
    return '<unprintable error>';
  }
};

/**
 * Resolve a user capability into a printable name using the in-state
 * cache, falling back to a placeholder so the line never reads
 * `<undefined>` while the lookup is still pending.
 * @param {Map<object, string>} userNames
 * @param {object} user
 * @returns {string}
 */
export const lookupName = (userNames, user) => userNames.get(user) ?? '…';
