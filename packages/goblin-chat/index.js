#!/usr/bin/env node
// @ts-check
/* eslint-disable import/no-unresolved */
/* global process */

/**
 * `@endo/goblin-chat` — Ink-based TUI client for the OCapN chat
 * protocol. Connects to a chatroom hosted by an Endo OCapN peer or a
 * Spritely Goblins peer, given a sturdyref URI.
 *
 * This file is the **runnable entrypoint**: `node packages/goblin-chat`
 * (or `node packages/goblin-chat/index.js`, or the `goblin-chat` shim
 * under `bin/`) launches the TUI. It is *not* the library entrypoint
 * — programmatic consumers import from `@endo/goblin-chat` (resolves
 * to `./api.js`, no side effects) or from one of the explicit
 * subpath exports (e.g. `@endo/goblin-chat/backend`).
 *
 * Why split? `@endo/init` performs SES lockdown as a side effect of
 * being imported, so a module that includes it can't double as a
 * library export — every library consumer would get lockdown
 * unconditionally. Keeping lockdown here, in the runnable script,
 * preserves the choice for embedders.
 *
 * Layout (top to bottom):
 *   - header              room name + phase status
 *   - main body           varies by phase: menu / inputs / chat scroll
 *   - log panel           hidden by default; toggle with Ctrl+L
 *   - input / hints       phase-appropriate input box and key hints
 *
 * Persisted state lives at `$XDG_CONFIG_HOME/goblin-chat/state.json`
 * (or platform default — see `src/state-store.js`). It carries the
 * user's display name and a most-recent-first list of rooms they've
 * joined, so subsequent launches surface a "Join previous chat"
 * picker instead of forcing them to dig the URI out of scrollback.
 *
 * No JSX — this file runs directly under Node without a transform.
 */

import '@endo/init';

import { createWriteStream } from 'node:fs';
import { resolve as resolvePath } from 'node:path';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Text, render, useApp, useInput, useStdout } from 'ink';

import { lookupName } from './src/chat-state.js';
import { useGoblinChat, shutdownHandle } from './src/use-goblin-chat.js';
import { openStateStore } from './src/state-store.js';
import { AnimatedLogo } from './src/animated-logo.js';

/**
 * @typedef {import('./src/chat-state.js').ChatMessage} ChatMessage
 * @typedef {import('./src/chat-state.js').SystemEvent} SystemEvent
 * @typedef {import('./src/chat-state.js').LogEntry}    LogEntry
 * @typedef {import('./src/chat-state.js').Phase}       Phase
 * @typedef {import('./src/state-store.js').StateStore} StateStore
 * @typedef {import('./src/state-store.js').RecentRoom} RecentRoom
 * @typedef {import('./src/use-goblin-chat.js').LogSink} LogSink
 */

const h = React.createElement;

const DEFAULT_NAME = process.env.GOBLIN_CHAT_NAME || 'goblin-chatter';
const DEFAULT_CAPTP_VERSION = process.env.OCAPN_CAPTP_VERSION || '1.0'; // 'goblins-0.16';

// Height of the log panel when visible. Hidden by default; toggled
// with Ctrl+L. Picked to be tall enough to read the most recent few
// netlayer/client lines without crowding out the main view.
const LOG_PANEL_ROWS = 8;

// ---------------------------------------------------------------------------
// Per-session log file
// ---------------------------------------------------------------------------

/**
 * Build a filename-safe local timestamp: `YYYYMMDD-HHMMSS`. We avoid
 * `:` (illegal on Windows / awkward in shells) and the timezone suffix
 * so the filename stays short and predictable.
 * @param {Date} d
 */
const formatTimestampForFilename = d => {
  const pad = (/** @type {number} */ n) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  );
};

/**
 * Open a per-session log file in CWD and return a `LogSink` plus a
 * `close` function. The sink is non-blocking (write stream) and never
 * throws — failed writes are swallowed so a full disk or revoked
 * permission can't take the TUI down. `GOBLIN_CHAT_LOG_FILE`, when set,
 * overrides the auto-generated path; pass an empty string to disable
 * file logging entirely.
 * @param {Date} startedAt
 * @returns {{ sink: LogSink, close: () => void, filePath: string | undefined }}
 */
const openLogFile = startedAt => {
  const override = process.env.GOBLIN_CHAT_LOG_FILE;
  if (override === '') {
    return {
      sink: () => undefined,
      close: () => undefined,
      filePath: undefined,
    };
  }
  const filePath = resolvePath(
    override ?? `goblin-chat-${formatTimestampForFilename(startedAt)}.log`,
  );
  const stream = createWriteStream(filePath, { flags: 'a' });
  // Swallow stream-level errors (EPIPE on a yanked file, ENOSPC on a
  // full disk, etc.) so a broken log can never take the TUI down.
  stream.on('error', () => undefined);
  // Header so a file appended across multiple runs stays readable.
  stream.write(
    `# goblin-chat tui session — started ${startedAt.toISOString()}\n`,
  );
  /** @type {LogSink} */
  const sink = (level, source, text) => {
    // After Ctrl+C, the websocket's `close` event fires a tick later
    // and emits one last `info` log via `handleConnectionClose`. By
    // that point we may have already closed the file (or be about to),
    // so the write would explode with "write after end". Bail out
    // silently if the stream is no longer writable — the panel still
    // shows the line, we just can't archive it.
    if (!stream.writable || stream.writableEnded) return;
    const line = `${new Date().toISOString()} ${level.padEnd(5)} [${source}] ${text}\n`;
    try {
      stream.write(line);
    } catch (_) {
      // belt-and-suspenders: even with the writableEnded guard above
      // we can race the close event; never let a logging line throw.
    }
  };
  const close = () => {
    if (stream.writableEnded) return;
    try {
      stream.end();
    } catch (_) {
      // best-effort
    }
  };
  return { sink, close, filePath };
};

// ---------------------------------------------------------------------------
// View-level helpers
// ---------------------------------------------------------------------------

/** @param {{ message: ChatMessage, userNames: Map<object, string> }} props */
const MessageLine = ({ message, userNames }) => {
  const name =
    message.sender.kind === 'self'
      ? message.sender.name
      : lookupName(userNames, message.sender.user);
  return h(
    Text,
    {
      color: message.sender.kind === 'self' ? 'green' : undefined,
      wrap: 'wrap',
    },
    `<${name}> ${message.text}`,
  );
};

/** @param {{ event: SystemEvent, userNames: Map<object, string> }} props */
const EventLine = ({ event, userNames }) => {
  switch (event.kind) {
    case 'joined':
      return h(
        Text,
        { color: 'magenta', dimColor: true, wrap: 'wrap' },
        `* ${lookupName(userNames, event.user)} joined`,
      );
    case 'left':
      return h(
        Text,
        { color: 'magenta', dimColor: true, wrap: 'wrap' },
        `* ${lookupName(userNames, event.user)} left`,
      );
    case 'present': {
      const names = event.users.map(u => lookupName(userNames, u));
      return h(
        Text,
        { color: 'magenta', dimColor: true, wrap: 'wrap' },
        `present: ${names.join(', ')}`,
      );
    }
    case 'info':
      return h(Text, { color: 'gray', wrap: 'wrap' }, `· ${event.text}`);
    case 'error':
    default:
      return h(Text, { color: 'red', wrap: 'wrap' }, `! ${event.text}`);
  }
};

const LOG_LEVEL_COLORS = /** @type {const} */ ({
  log: 'white',
  info: 'gray',
  error: 'red',
});

/** @param {{ entry: LogEntry }} props */
const LogLine = ({ entry }) => {
  // Collapse to a single line — the panel is height-constrained so a
  // wrapped multi-line stack would push older entries off-screen quickly.
  const oneLine = entry.text.replace(/\s+/gu, ' ').trim();
  return h(
    Text,
    { color: LOG_LEVEL_COLORS[entry.level], wrap: 'truncate-end' },
    `[${entry.source}] ${oneLine}`,
  );
};

// ---------------------------------------------------------------------------
// Main menu
// ---------------------------------------------------------------------------

/**
 * @typedef {(
 *   | 'set-name'
 *   | 'join-new'
 *   | 'join-previous'
 *   | 'quit'
 * )} MenuItemId
 */

/** @type {{ id: MenuItemId, label: string }[]} */
const BASE_MENU_ITEMS = [
  { id: 'join-new', label: 'Join a new chat' },
  { id: 'join-previous', label: 'Join a previous chat' },
  { id: 'set-name', label: 'Set your name' },
  { id: 'quit', label: 'Quit' },
];

/**
 * @param {{
 *   currentName: string,
 *   recentRoomCount: number,
 *   selected: number,
 * }} props
 */
const MainMenu = ({ currentName, recentRoomCount, selected }) =>
  h(
    Box,
    { flexDirection: 'column', paddingY: 1, paddingX: 2 },
    h(Text, { dimColor: true }, `current name: ${currentName}`),
    h(Text, null, ' '),
    ...BASE_MENU_ITEMS.map((item, i) => {
      const disabled = item.id === 'join-previous' && recentRoomCount === 0;
      const cursor = i === selected ? '› ' : '  ';
      const text = disabled ? `${item.label} (none yet)` : item.label;
      // dimColor for disabled, inverse for selection; never both — a
      // disabled+selected row should still be visibly the cursor row,
      // just not invitingly so.
      return h(
        Text,
        {
          key: item.id,
          inverse: i === selected,
          dimColor: disabled,
        },
        `${cursor}${text}`,
      );
    }),
  );

// ---------------------------------------------------------------------------
// Recent-rooms picker
// ---------------------------------------------------------------------------

/**
 * @param {{ recentRooms: RecentRoom[], selected: number }} props
 */
const RecentRoomsList = ({ recentRooms, selected }) => {
  if (recentRooms.length === 0) {
    return h(
      Box,
      { paddingY: 1, paddingX: 2 },
      h(Text, { dimColor: true }, 'No previous chats yet.'),
    );
  }
  return h(
    Box,
    { flexDirection: 'column', paddingY: 1, paddingX: 2 },
    ...recentRooms.map((room, i) => {
      const cursor = i === selected ? '› ' : '  ';
      const label = room.displayName
        ? `${room.displayName} — ${room.uri}`
        : room.uri;
      return h(
        Text,
        {
          key: `${room.uri}-${i}`,
          inverse: i === selected,
          wrap: 'truncate-end',
        },
        `${cursor}${label}`,
      );
    }),
  );
};

// ---------------------------------------------------------------------------
// Top-level App
// ---------------------------------------------------------------------------

/**
 * @param {{
 *   logSink?: LogSink,
 *   logFilePath?: string,
 *   store: StateStore,
 *   initialName: string,
 * }} props
 */
const App = ({ logSink, logFilePath, store, initialName }) => {
  const { exit } = useApp();
  const { stdout } = useStdout();

  // Snapshot of the persisted store. We re-read it after every
  // mutation rather than wiring a subscription — mutations are rare
  // and originate from the UI itself, so a synchronous re-read is
  // both simpler and avoids stale-closure bugs.
  const [storedSnap, setStoredSnap] = useState(() => store.read());
  const refreshStore = () => setStoredSnap(store.read());

  const [name, setName] = useState(initialName);
  const [input, setInput] = useState('');
  const [menuSelected, setMenuSelected] = useState(0);
  const [recentSelected, setRecentSelected] = useState(0);
  const [showLog, setShowLog] = useState(false);

  // The hook owns OCapN-side state. We hand it an `onJoined` callback
  // so successful joins push into our persisted recent-rooms list
  // without the hook having to know what a state-store is.
  const onJoinedRef = useRef(
    /** @type {((args: { uri: string, roomName?: string }) => void) | undefined} */ (
      undefined
    ),
  );
  const { state, joinRoom, sendMessage, leaveRoom, setPhase } = useGoblinChat({
    captpVersion: DEFAULT_CAPTP_VERSION,
    logSink,
    onJoined: ({ uri, roomName }) => {
      // Indirection through a ref so we always see the latest store
      // reference without re-creating the hook on every render.
      if (onJoinedRef.current) onJoinedRef.current({ uri, roomName });
    },
  });

  useEffect(() => {
    onJoinedRef.current = ({ uri, roomName }) => {
      store.recordJoin(uri, roomName);
      refreshStore();
    };
  }, [store]);

  /**
   * Run the action selected from the main menu.
   * @param {MenuItemId} id
   */
  const activateMenuItem = id => {
    setInput('');
    switch (id) {
      case 'set-name':
        setInput(name);
        setPhase('name-input');
        break;
      case 'join-new':
        setPhase('uri-input');
        break;
      case 'join-previous':
        if (storedSnap.recentRooms.length === 0) return;
        setRecentSelected(0);
        setPhase('recent-list');
        break;
      case 'quit':
        leaveRoom();
        exit();
        break;
      default:
        break;
    }
  };

  /**
   * Submit whatever the user just typed for the current input phase.
   * @param {string} value
   */
  const submit = value => {
    const trimmed = value.trim();
    setInput('');
    switch (state.phase) {
      case 'name-input': {
        if (trimmed.length > 0) {
          setName(trimmed);
          store.setName(trimmed);
          refreshStore();
        }
        setPhase('menu');
        break;
      }
      case 'uri-input': {
        if (trimmed.length === 0) {
          setPhase('menu');
          return;
        }
        joinRoom({ uri: trimmed, name });
        break;
      }
      case 'chat': {
        if (trimmed.length === 0) return;
        sendMessage(trimmed);
        break;
      }
      default:
        break;
    }
  };

  useInput((rawInput, key) => {
    // Top-level keys, available in every phase.
    if (key.ctrl && rawInput === 'c') {
      // From the menu, Ctrl+C exits. From elsewhere it backs out to
      // the menu (leaving any active room politely on the way).
      if (state.phase === 'menu') {
        leaveRoom();
        exit();
        return;
      }
      if (state.phase === 'chat') {
        leaveRoom();
        return;
      }
      setPhase('menu');
      setInput('');
      return;
    }
    if (key.ctrl && rawInput === 'l') {
      // Toggle the log panel. Ctrl+L is intentional: in raw mode the
      // shell's clear-screen meaning doesn't apply, the byte never
      // collides with regular chat input, and "L" reads as "log".
      setShowLog(prev => !prev);
      return;
    }

    // Per-phase handlers below.
    switch (state.phase) {
      case 'menu': {
        if (key.upArrow) {
          setMenuSelected(
            prev =>
              (prev - 1 + BASE_MENU_ITEMS.length) % BASE_MENU_ITEMS.length,
          );
          return;
        }
        if (key.downArrow) {
          setMenuSelected(prev => (prev + 1) % BASE_MENU_ITEMS.length);
          return;
        }
        if (key.return || /** @type {any} */ (key).enter) {
          activateMenuItem(BASE_MENU_ITEMS[menuSelected].id);
          return;
        }
        // Number-key shortcuts (1-N) for quick access.
        const idx = Number.parseInt(rawInput, 10);
        if (!Number.isNaN(idx) && idx >= 1 && idx <= BASE_MENU_ITEMS.length) {
          activateMenuItem(BASE_MENU_ITEMS[idx - 1].id);
        }
        return;
      }

      case 'recent-list': {
        const list = storedSnap.recentRooms;
        if (list.length === 0) {
          setPhase('menu');
          return;
        }
        if (key.escape) {
          setPhase('menu');
          return;
        }
        if (key.upArrow) {
          setRecentSelected(prev => (prev - 1 + list.length) % list.length);
          return;
        }
        if (key.downArrow) {
          setRecentSelected(prev => (prev + 1) % list.length);
          return;
        }
        if (key.return || /** @type {any} */ (key).enter) {
          const room = list[recentSelected];
          if (room) joinRoom({ uri: room.uri, name });
          return;
        }
        if (rawInput === 'd') {
          // Prune the highlighted room from the persisted list.
          const room = list[recentSelected];
          if (room) {
            store.forgetRoom(room.uri);
            const next = store.read();
            setStoredSnap(next);
            // Clamp the cursor to the new bounds so a delete-from-end
            // doesn't leave us pointing past the array.
            if (recentSelected >= next.recentRooms.length) {
              setRecentSelected(Math.max(0, next.recentRooms.length - 1));
            }
          }
        }
        return;
      }

      case 'connecting':
        // Connecting is non-interactive; only Ctrl+C/Ctrl+L (handled
        // above) work. A future enhancement might add an Esc-to-cancel
        // path, but `client.shutdown()` mid-handshake is messy.
        return;

      case 'name-input':
      case 'uri-input':
      case 'chat':
        // Fall through to the shared text-editor block below.
        break;

      default:
        return;
    }

    // Shared text-editor handling for the input phases above.
    if (key.escape) {
      // Esc backs out of name/uri inputs; in chat it's a no-op (use
      // Ctrl+C to leave the room — Esc is too easy to hit by accident
      // mid-message).
      if (state.phase === 'name-input' || state.phase === 'uri-input') {
        setInput('');
        setPhase('menu');
      }
      return;
    }
    // Enter: commit. Ink reports it as `key.return` (CR) or `key.enter`
    // (LF, from PTYs that only forward \n). It can also deliver a
    // pasted blob ending in \r/\n as a single event with the newline
    // embedded in `rawInput`, in which case neither key flag is set.
    const enterPressed = key.return || /** @type {any} */ (key).enter;
    if (enterPressed || /[\r\n]/u.test(rawInput)) {
      const buffered = enterPressed
        ? rawInput
        : rawInput.replace(/[\r\n].*$/u, '');
      const cleaned = buffered.replace(/[\r\n]/gu, '');
      submit(input + cleaned);
      return;
    }
    if (key.backspace || key.delete) {
      setInput(prev => prev.slice(0, -1));
      return;
    }
    if (key.ctrl || key.meta) {
      return;
    }
    if (
      rawInput &&
      !key.upArrow &&
      !key.downArrow &&
      !key.leftArrow &&
      !key.rightArrow
    ) {
      setInput(prev => prev + rawInput);
    }
  });

  const rows = (stdout && stdout.rows) || 24;
  const cols = (stdout && stdout.columns) || 80;

  /**
   * @typedef {(
   *   | { kind: 'message', entry: ChatMessage }
   *   | { kind: 'event',   entry: SystemEvent }
   * )} TimelineItem
   */

  /** @type {TimelineItem[]} */
  const timeline = useMemo(() => {
    /** @type {TimelineItem[]} */
    const items = [
      ...state.messages.map(
        m => /** @type {TimelineItem} */ ({ kind: 'message', entry: m }),
      ),
      ...state.events.map(
        e => /** @type {TimelineItem} */ ({ kind: 'event', entry: e }),
      ),
    ];
    items.sort((a, b) => a.entry.seq - b.entry.seq);
    return items;
  }, [state.messages, state.events]);

  // --- header ----------------------------------------------------------
  const headerLine = (() => {
    if (state.phase === 'chat' && state.roomName) {
      return `goblin-chat #${state.roomName} — ${state.status}`;
    }
    if (state.phase === 'menu') {
      return `goblin-chat — ${state.status}`;
    }
    return `goblin-chat — ${state.status}`;
  })();

  // --- footer ----------------------------------------------------------
  const phaseHints = {
    menu: '↑/↓ select • Enter activate • 1–4 quick • Ctrl+C quit',
    'name-input': 'type your name • Enter save • Esc cancel',
    'uri-input': 'paste an ocapn://… URI • Enter join • Esc cancel',
    'recent-list': '↑/↓ select • Enter join • d delete • Esc back',
    connecting: 'connecting…  • Ctrl+C cancel',
    chat: 'Enter send • Ctrl+C leave room',
  };
  const baseHint = phaseHints[state.phase] ?? '';
  const logHint = `Ctrl+L ${showLog ? 'hide' : 'show'} log`;
  const footerLeft = `${baseHint}  •  ${logHint}`;

  // --- input box -------------------------------------------------------
  const inputBox = (() => {
    /** @type {string} */
    let prompt = '';
    /** @type {string} */
    const value = input;
    if (state.phase === 'name-input') {
      prompt = 'name> ';
    } else if (state.phase === 'uri-input') {
      prompt = 'sturdyref> ';
    } else if (state.phase === 'chat') {
      prompt = `${name}> `;
    } else {
      // No editable input in menu / recent-list / connecting phases.
      return undefined;
    }
    return h(
      Box,
      { borderStyle: 'single', borderColor: 'gray', paddingX: 1 },
      h(
        Text,
        null,
        h(Text, { color: 'yellow' }, prompt),
        h(Text, null, value),
        h(Text, { inverse: true }, ' '),
      ),
    );
  })();

  // --- main body -------------------------------------------------------
  // Carve out vertical room. Header(3) + footer(1) + input(3 if shown) +
  // log(LOG_PANEL_ROWS if shown) ≈ overhead. We compute the remaining
  // rows for the body so it scrolls instead of overflowing.
  const inputHeight = inputBox ? 3 : 0;
  const logHeight = showLog ? LOG_PANEL_ROWS : 0;
  const bodyRows = Math.max(1, rows - 4 - inputHeight - logHeight);

  /** @returns {React.ReactElement} */
  const renderBody = () => {
    switch (state.phase) {
      case 'menu':
        // Centre the logo + menu group both vertically and horizontally
        // within the body. `justifyContent: 'center'` puts the group on
        // the body's vertical midline; `alignItems: 'center'` centres
        // each child horizontally, so the menu lines up directly under
        // the logo regardless of the menu's intrinsic width.
        return h(
          Box,
          {
            flexDirection: 'column',
            flexGrow: 1,
            justifyContent: 'center',
            alignItems: 'center',
          },
          h(AnimatedLogo, { cols }),
          h(MainMenu, {
            currentName: name,
            recentRoomCount: storedSnap.recentRooms.length,
            selected: menuSelected,
          }),
        );
      case 'recent-list':
        return h(RecentRoomsList, {
          recentRooms: storedSnap.recentRooms,
          selected: recentSelected,
        });
      case 'name-input':
        return h(
          Box,
          { paddingY: 1, paddingX: 2, flexDirection: 'column' },
          h(Text, null, 'Set your display name.'),
          h(Text, { dimColor: true }, 'It will be saved for next time.'),
        );
      case 'uri-input':
        return h(
          Box,
          { paddingY: 1, paddingX: 2, flexDirection: 'column' },
          h(Text, null, 'Paste an OCapN sturdyref URI.'),
          h(
            Text,
            { dimColor: true },
            'e.g. ocapn://….websocket/s/<base64url>?url=ws://….',
          ),
        );
      case 'connecting':
        return h(
          Box,
          { paddingY: 1, paddingX: 2, flexDirection: 'column' },
          h(Text, null, state.status),
        );
      case 'chat':
      default:
        return h(
          Box,
          {
            flexDirection: 'column',
            flexGrow: 1,
            paddingX: 1,
            overflowY: 'hidden',
          },
          ...timeline.slice(-Math.max(1, bodyRows - 1)).map(item =>
            item.kind === 'message'
              ? h(MessageLine, {
                  key: `m${item.entry.id}`,
                  message: item.entry,
                  userNames: state.userNames,
                })
              : h(EventLine, {
                  key: `e${item.entry.id}`,
                  event: item.entry,
                  userNames: state.userNames,
                }),
          ),
        );
    }
  };

  /** @type {(React.ReactElement | undefined)[]} */
  const children = [
    h(
      Box,
      {
        key: 'header',
        borderStyle: 'single',
        borderColor: 'cyan',
        paddingX: 1,
      },
      h(Text, { bold: true, color: 'cyan' }, headerLine),
    ),
    h(
      Box,
      {
        key: 'body',
        flexDirection: 'column',
        flexGrow: 1,
        height: bodyRows,
        overflowY: 'hidden',
      },
      renderBody(),
    ),
    showLog
      ? h(
          Box,
          {
            key: 'log',
            borderStyle: 'single',
            borderColor: 'gray',
            flexDirection: 'column',
            height: LOG_PANEL_ROWS,
            paddingX: 1,
          },
          // Header line for the panel: combines the toggle hint with
          // the on-disk log path. Putting the path here (instead of
          // the global footer) means the bottom bar stays uncluttered
          // when the panel is hidden — nobody needs to know the log
          // path until they're actually looking at the log.
          h(
            Box,
            { justifyContent: 'space-between' },
            h(Text, { dimColor: true }, 'log (Ctrl+L to hide)'),
            logFilePath
              ? h(
                  Text,
                  { dimColor: true, wrap: 'truncate-middle' },
                  logFilePath,
                )
              : null,
          ),
          ...state.logs
            .slice(-(LOG_PANEL_ROWS - 3))
            .map(entry => h(LogLine, { key: `l${entry.id}`, entry })),
        )
      : undefined,
    inputBox ? h(React.Fragment, { key: 'input' }, inputBox) : undefined,
    h(
      Box,
      { key: 'footer', paddingX: 1 },
      h(Text, { dimColor: true, wrap: 'truncate-end' }, footerLeft),
    ),
  ].filter(Boolean);

  return h(
    Box,
    { flexDirection: 'column', width: cols, height: rows },
    ...children,
  );
};

// ---------------------------------------------------------------------------
// Entrypoint
// ---------------------------------------------------------------------------

const ALT_SCREEN_ON = '\u001B[?1049h';
const ALT_SCREEN_OFF = '\u001B[?1049l';

const main = () => {
  // Open the per-session log file *before* any other side effects so
  // the very first netlayer/client log line is captured. The filename
  // is pinned to the wallclock at process start, so each TUI
  // invocation gets its own file even if multiple instances run in
  // the same dir.
  const startedAt = new Date();
  const {
    sink: logSink,
    close: closeLogFile,
    filePath: logFilePath,
  } = openLogFile(startedAt);

  // Persistent state (name + recent rooms). IO errors funnel through
  // the log file (when it's open) — the TUI itself never sees them.
  const store = openStateStore({
    onError: (err, op) => {
      try {
        logSink('error', 'state-store', `${op}: ${err}`);
      } catch (_) {
        // best-effort
      }
    },
  });
  const initialName = store.read().name ?? DEFAULT_NAME;

  const useAltScreen = Boolean(process.stdout.isTTY);
  let altScreenLeft = false;
  const leaveAltScreen = () => {
    if (useAltScreen && !altScreenLeft) {
      altScreenLeft = true;
      process.stdout.write(ALT_SCREEN_OFF);
    }
  };
  // Enter the alt screen *before* the first React commit so the
  // initial frame is never painted onto the user's scrollback. The
  // matching restore must run on every exit path (clean exit,
  // unhandled error, SIGINT, SIGTERM) — losing it strands the user on
  // a blank alt buffer.
  if (useAltScreen) {
    process.stdout.write(ALT_SCREEN_ON);
  }
  process.once('exit', leaveAltScreen);
  process.once('exit', closeLogFile);
  // Catch the cases ink's `useInput` Ctrl+C branch doesn't see:
  //   SIGINT  — `kill -INT $pid`, or Ctrl+C from a parent if we ever
  //             lose raw mode (e.g. during a crash unwind).
  //   SIGTERM — `kill $pid`, init-system shutdown.
  //   SIGHUP  — controlling terminal went away (closed tab, ssh
  //             dropped).
  //
  // Everything in here MUST be synchronous. Ink registers its own
  // listener via `signal-exit`, which re-raises the signal with
  // default disposition once all listeners return — so any
  // `setTimeout`/microtask we schedule will never fire.
  // `client.shutdown()` (via `shutdownHandle.run`) closes the
  // websocket synchronously (the TCP FIN/close frame goes straight
  // onto the wire), which is the message the chatroom most needs to
  // see; the eventual-send `leave`/`unsubscribe` calls only really
  // get to flush on the in-app Ctrl+C path, where we exit through
  // ink's normal unmount instead of a signal.
  for (const signal of /** @type {const} */ (['SIGINT', 'SIGTERM', 'SIGHUP'])) {
    process.once(signal, () => {
      try {
        shutdownHandle.run();
      } catch (_) {
        // best-effort; never block exit on cleanup
      }
      leaveAltScreen();
      closeLogFile();
      process.exit(0);
    });
  }

  const { waitUntilExit } = render(
    h(App, { logSink, logFilePath, store, initialName }),
    {
      exitOnCtrlC: false,
      // SES lockdown removes console.Console, which ink's patchConsole
      // needs.
      patchConsole: false,
    },
  );
  // Note: we deliberately don't `closeLogFile()` here. Ink's
  // `waitUntilExit()` resolves as soon as the React tree unmounts,
  // but the websocket's `close` event (which writes one last
  // `handleConnectionClose` log line) fires a tick later. Closing the
  // stream now would race that write and surface as "write after
  // end". The `process.once('exit', closeLogFile)` registered above
  // runs once the event loop drains, by which point the late log
  // lines have flushed.
  waitUntilExit()
    .catch(err => {
      leaveAltScreen();
      console.error(err);
      process.exit(1);
    })
    .then(() => {
      leaveAltScreen();
    });
};

main();
