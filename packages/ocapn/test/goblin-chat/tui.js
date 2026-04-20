// @ts-check
/* eslint-disable import/no-unresolved */
/* global process */

/**
 * A small Ink-based TUI client that drives the Endo OCapN goblin-chat
 * app-layer (`./backend.js`) so a human can paste a sturdyref URI and
 * join a chatroom hosted by a Goblins peer (or another OCapN peer).
 *
 * This file deliberately holds only the view and the process-level
 * entrypoint. All OCapN session orchestration (client, netlayer,
 * channel, observers, name resolution) lives in `./use-ocapn-chat.js`,
 * and the underlying state shape + reducer live in `./chat-state.js`.
 *
 * No JSX is used so the file runs directly on Node without a transform.
 */

import '@endo/init';

import { createWriteStream } from 'node:fs';
import { resolve as resolvePath } from 'node:path';

import React, { useMemo, useState } from 'react';
import { Box, Text, render, useApp, useInput, useStdout } from 'ink';

import { lookupName } from './chat-state.js';
import { useOcapnChat, shutdownHandle } from './use-ocapn-chat.js';

/**
 * @typedef {import('./chat-state.js').ChatMessage} ChatMessage
 * @typedef {import('./chat-state.js').SystemEvent} SystemEvent
 * @typedef {import('./chat-state.js').LogEntry}    LogEntry
 */

const h = React.createElement;

const DEFAULT_NAME = process.env.OCAPN_TUI_NAME || 'endo-tui';
const DEFAULT_CAPTP_VERSION =
  process.env.OCAPN_CAPTP_VERSION || '1.0'; // 'goblins-0.16';
const LOG_PANEL_ROWS = 8;

/**
 * @typedef {import('./use-ocapn-chat.js').LogSink} LogSink
 */

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
 * permission can't take the TUI down. `OCAPN_TUI_LOG_FILE`, when set,
 * overrides the auto-generated path; pass an empty string to disable
 * file logging entirely.
 * @param {Date} startedAt
 * @returns {{ sink: LogSink, close: () => void, filePath: string | undefined }}
 */
const openLogFile = startedAt => {
  const override = process.env.OCAPN_TUI_LOG_FILE;
  if (override === '') {
    return { sink: () => undefined, close: () => undefined, filePath: undefined };
  }
  const filePath = resolvePath(
    override ?? `goblin-chat-${formatTimestampForFilename(startedAt)}.log`,
  );
  const stream = createWriteStream(filePath, { flags: 'a' });
  // Header so a file appended across multiple runs stays readable.
  stream.write(`# goblin-chat tui session — started ${startedAt.toISOString()}\n`);
  /** @type {LogSink} */
  const sink = (level, source, text) => {
    // Use a stable, parseable line format: ISO-8601 wallclock, level,
    // source, then the rendered message. `text` may contain newlines
    // (e.g. error stacks); preserve them verbatim — a structured tail
    // is more useful than a single-line panel rendering for forensics.
    const line = `${new Date().toISOString()} ${level.padEnd(5)} [${source}] ${text}\n`;
    stream.write(line);
  };
  const close = () => {
    try {
      stream.end();
    } catch (_) {
      // best-effort
    }
  };
  return { sink, close, filePath };
};

/** @param {{ message: ChatMessage, userNames: Map<object, string> }} props */
const MessageLine = ({ message, userNames }) => {
  const name =
    message.sender.kind === 'self'
      ? message.sender.name
      : lookupName(userNames, message.sender.user);
  return h(
    Text,
    { color: message.sender.kind === 'self' ? 'green' : undefined, wrap: 'wrap' },
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

/** @param {{ logSink?: LogSink, logFilePath?: string }} props */
const App = ({ logSink, logFilePath }) => {
  const { exit } = useApp();
  const { stdout } = useStdout();

  const { state, joinRoom, sendMessage } = useOcapnChat({
    name: DEFAULT_NAME,
    captpVersion: DEFAULT_CAPTP_VERSION,
    logSink,
  });

  // The text in the prompt is purely view-local — the chat reducer
  // doesn't need to know about it. Keeping it out of `useOcapnChat`
  // also means the hook stays focused on the OCapN side.
  const [input, setInput] = useState('');

  /**
   * Dispatches whatever the user just submitted to the appropriate
   * action based on the current connection phase.
   * @param {string} value
   */
  const submit = value => {
    const trimmed = value.trim();
    if (trimmed.length === 0) return;
    setInput('');
    if (state.phase === 'lobby') {
      joinRoom(trimmed);
    } else if (state.phase === 'chat') {
      sendMessage(trimmed);
    }
  };

  useInput((rawInput, key) => {
    if (key.ctrl && rawInput === 'c') {
      shutdownHandle.run();
      exit();
      return;
    }
    if (state.phase === 'connecting') {
      return;
    }
    // ink reports Enter as `key.return` (CR) or `key.enter` (LF, e.g.
    // when a PTY only forwards \n). It can also deliver a pasted blob
    // ending in \r/\n as a single event with the newline embedded in
    // `rawInput`, in which case neither key.return nor key.enter is set.
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

  const headerLine =
    state.phase === 'chat' && state.roomName
      ? `Endo OCapN goblin-chat #${state.roomName} — ${state.status}`
      : `Endo OCapN goblin-chat — ${state.status}`;

  const footerHint =
    state.phase === 'lobby'
      ? 'paste an ocapn://… URI then Enter • Ctrl+C to quit'
      : 'type a message then Enter • Ctrl+C to quit';
  const footerText = logFilePath
    ? `${footerHint}  •  log: ${logFilePath}`
    : footerHint;

  let prompt = '...';
  if (state.phase === 'lobby') {
    prompt = 'sturdyref> ';
  } else if (state.phase === 'chat') {
    prompt = `${DEFAULT_NAME}> `;
  }

  return h(
    Box,
    { flexDirection: 'column', width: cols, height: rows },
    h(
      Box,
      { borderStyle: 'single', borderColor: 'cyan', paddingX: 1 },
      h(Text, { bold: true, color: 'cyan' }, headerLine),
    ),
    h(
      Box,
      {
        flexDirection: 'column',
        flexGrow: 1,
        paddingX: 1,
        overflowY: 'hidden',
      },
      ...timeline
        .slice(-Math.max(1, rows - 6 - LOG_PANEL_ROWS))
        .map(item =>
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
    ),
    h(
      Box,
      {
        borderStyle: 'single',
        borderColor: 'gray',
        flexDirection: 'column',
        height: LOG_PANEL_ROWS,
        paddingX: 1,
      },
      h(Text, { dimColor: true }, 'log'),
      ...state.logs
        .slice(-(LOG_PANEL_ROWS - 3))
        .map(entry => h(LogLine, { key: `l${entry.id}`, entry })),
    ),
    h(
      Box,
      { borderStyle: 'single', borderColor: 'gray', paddingX: 1 },
      h(
        Text,
        null,
        h(Text, { color: 'yellow' }, prompt),
        h(Text, null, input),
        h(Text, { inverse: true }, ' '),
      ),
    ),
    h(
      Box,
      { paddingX: 1 },
      h(Text, { dimColor: true, wrap: 'truncate-end' }, footerText),
    ),
  );
};

const ALT_SCREEN_ON = '\u001B[?1049h';
const ALT_SCREEN_OFF = '\u001B[?1049l';

const main = () => {
  // Open the per-session log file *before* any other side effects so the
  // very first netlayer/client log line is captured. The filename is
  // pinned to the wallclock at process start, so each TUI invocation
  // gets its own file even if multiple instances run in the same dir.
  const startedAt = new Date();
  const { sink: logSink, close: closeLogFile, filePath: logFilePath } =
    openLogFile(startedAt);

  const useAltScreen = Boolean(process.stdout.isTTY);
  let altScreenLeft = false;
  const leaveAltScreen = () => {
    if (useAltScreen && !altScreenLeft) {
      altScreenLeft = true;
      process.stdout.write(ALT_SCREEN_OFF);
    }
  };
  // Enter the alt screen *before* the first React commit so the initial
  // frame is never painted onto the user's scrollback. The matching
  // restore must run on every exit path (clean exit, unhandled error,
  // SIGINT, SIGTERM) — losing it strands the user on a blank alt buffer.
  if (useAltScreen) {
    process.stdout.write(ALT_SCREEN_ON);
  }
  process.once('exit', leaveAltScreen);
  process.once('exit', closeLogFile);
  // Catch the cases ink's `useInput` Ctrl+C branch doesn't see:
  //   SIGINT  — `kill -INT $pid`, or Ctrl+C from a parent if we ever
  //             lose raw mode (e.g. during a crash unwind).
  //   SIGTERM — `kill $pid`, init-system shutdown.
  //   SIGHUP  — controlling terminal went away (closed tab, ssh dropped).
  //
  // Everything in here MUST be synchronous. Ink registers its own
  // listener via `signal-exit`, which re-raises the signal with default
  // disposition once all listeners return — so any `setTimeout`/microtask
  // we schedule will never fire. `client.shutdown()` (via
  // `shutdownHandle.run`) closes the websocket synchronously (the TCP
  // FIN/close frame goes straight onto the wire), which is the message
  // the chatroom most needs to see; the eventual-send `leave`/
  // `unsubscribe` calls only really get to flush on the in-app Ctrl+C
  // path, where we exit through ink's normal unmount instead of a signal.
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

  const { waitUntilExit } = render(h(App, { logSink, logFilePath }), {
    exitOnCtrlC: false,
    // SES lockdown removes console.Console, which ink's patchConsole needs.
    patchConsole: false,
  });
  waitUntilExit()
    .catch(err => {
      leaveAltScreen();
      closeLogFile();
      console.error(err);
      process.exit(1);
    })
    .then(() => {
      leaveAltScreen();
      closeLogFile();
    });
};

main();
