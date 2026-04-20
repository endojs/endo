// @ts-check
/* eslint-disable import/no-unresolved */

/**
 * `useOcapnChat` — React hook that owns the OCapN-side state machine and
 * side effects for the goblin-chat TUI.
 *
 * The hook deliberately encapsulates the `makeClient` call so the same
 * reducer-backed `Logger` can be wired in once and pumped into both the
 * client and any registered netlayer. Callers get back a `state` slice
 * (matching the `chat-state.js` shape) and a small set of action
 * functions; everything else — sessions, capabilities, name lookups —
 * is internal.
 *
 * Shutdown is handled cooperatively. The hook installs a polite-leave
 * function into the exported `shutdownHandle` on mount and clears it on
 * unmount, so signal handlers in the entrypoint can invoke the same
 * teardown as the in-app Ctrl+C path. See the comment on
 * `shutdownHandle` for the raw-mode/`signal-exit` race-condition story.
 */

import { useCallback, useEffect, useReducer, useRef } from 'react';
import { E } from '@endo/eventual-send';
import { Far } from '@endo/marshal';

import { Buffer } from 'node:buffer';

import { makeClient } from '../../src/client/index.js';
import { immutableArrayBufferToUint8Array } from '../../src/buffer-utils.js';
import { makeWebSocketNetLayer } from '../../src/netlayers/websocket.js';
import { makeUserControllerPair } from './backend.js';
import { parseOcapnUri } from './uri-parse.js';
import { initialState, reducer, formatError } from './chat-state.js';

const ASCII_DECODER = new TextDecoder('ascii');

/**
 * Render a swissnum for log display.
 *
 * Two cases:
 *
 *   1. Endo-originated swissnums that happen to be printable ASCII
 *      (e.g. the built-in `'Echo'` test object's name). Show the
 *      literal string — much more useful than its base64 form.
 *
 *   2. The general case: opaque random bytes, e.g. the 32-byte values
 *      that appear in `ocapn://…/s/<base64url>` URIs. Render in the
 *      same canonical base64url form they appeared on the wire.
 *
 * NOTE: this used to delegate to `decodeSwissnum` and rely on its
 * `TextDecoder('ascii', { fatal: true })` to throw on non-ASCII. That
 * doesn't work — per the WHATWG encoding spec the `'ascii'` label is
 * aliased to `'windows-1252'`, every byte 0–255 is "valid" in
 * windows-1252, so `fatal` never fires and 32 random bytes come back
 * as Latin-1 garbage like `ôr¤\`RB…`. We do the printable-ASCII check
 * ourselves now.
 *
 * @param {ArrayBufferLike} swissNum
 * @returns {string}
 */
const formatSwissnumForLog = swissNum => {
  const bytes = immutableArrayBufferToUint8Array(swissNum);
  let allPrintable = bytes.length > 0;
  for (let i = 0; i < bytes.length; i += 1) {
    const c = bytes[i];
    // 0x20 (space) through 0x7e (~) inclusive — the printable ASCII
    // range. Tab/newline are excluded on purpose; a swissnum that
    // contains them is interesting enough to want the base64url form.
    if (c < 0x20 || c > 0x7e) {
      allPrintable = false;
      break;
    }
  }
  if (allPrintable) {
    return ASCII_DECODER.decode(bytes);
  }
  return Buffer.from(bytes).toString('base64url');
};

/**
 * @typedef {import('./chat-state.js').State} State
 * @typedef {import('./chat-state.js').Action} Action
 * @typedef {import('./chat-state.js').LogLevel} LogLevel
 */

/**
 * Mutable handle the hook fills in on mount with a function that
 * politely tears down whatever OCapN session is currently live
 * (`unsubscribe` → `leave` → `client.shutdown()`). Both the in-app
 * Ctrl+C keystroke and the out-of-app signal handlers in the
 * entrypoint invoke it on the way out so we don't disappear from the
 * chatroom without saying goodbye, and so the websocket gets closed
 * cleanly instead of half-open.
 *
 * Why not just use signals? While the TUI is running ink puts the TTY
 * into raw mode, which disables the kernel's ISIG translation — so a
 * literal `^C` keystroke arrives as the byte 0x03 via `useInput`, NOT
 * as SIGINT. Conversely, SIGTERM/SIGHUP and `kill -INT $pid` never
 * touch `useInput`. Both code paths converge through this handle.
 *
 * @type {{ run: () => void }}
 */
export const shutdownHandle = { run: () => undefined };

/**
 * Render an arbitrary `console.*`-style argument for inline display in
 * the log panel. Strings pass through; errors get their `.message`;
 * everything else is JSON-stringified, falling back to `String(value)`
 * when that fails (e.g. circular references, BigInts).
 * @param {unknown} value
 * @returns {string}
 */
const formatLogArg = value => {
  if (typeof value === 'string') return value;
  if (value instanceof Error) return formatError(value);
  try {
    return JSON.stringify(value);
  } catch (_) {
    try {
      return String(value);
    } catch (__) {
      return '<unprintable>';
    }
  }
};

/**
 * @callback LogSink
 * @param {LogLevel} level
 * @param {string} source
 * @param {string} text
 * @returns {void}
 */

/**
 * Build a `Logger` (matching the ocapn `Logger` typedef) that pipes
 * every call into the reducer as a `log` action. Each level is tagged
 * with the supplied `source` so the panel can distinguish e.g.
 * `client` from `netlayer` lines. If a `logSink` is provided, every
 * formatted line is also forwarded there (used by the entrypoint to
 * mirror logs into a session file).
 * @param {(action: Action) => void} dispatch
 * @param {string} source
 * @param {LogSink} [logSink]
 */
const makeReducerLogger = (dispatch, source, logSink) => {
  /** @param {LogLevel} level */
  const make = level =>
    /** @param {unknown[]} args */
    (...args) => {
      const text = args.map(formatLogArg).join(' ');
      dispatch({ type: 'log', level, source, text });
      if (logSink) {
        try {
          logSink(level, source, text);
        } catch (_) {
          // Never let a broken sink (e.g. closed file) take down the app.
        }
      }
    };
  return harden({
    log: make('log'),
    info: make('info'),
    error: make('error'),
  });
};

/**
 * @typedef {object} OcapnChatConfig
 * @property {string} name              Self-proposed display name we
 *   announce on `join-room`.
 * @property {string} [captpVersion]    Forwarded to `makeClient`.
 * @property {boolean} [verbose=true]   Forwarded to `makeClient`. The
 *   default is `true` because the dedicated log panel is the whole
 *   point of having a logger; `info` lines flowing through is what
 *   makes that panel useful.
 * @property {LogSink} [logSink]        Optional side-channel called for
 *   every log line in addition to the reducer dispatch. The TUI
 *   entrypoint uses this to mirror logs to a per-session file.
 *
 * @typedef {object} OcapnChatActions
 * @property {(uri: string) => Promise<void>} joinRoom    Parse a
 *   sturdyref URI, stand up a websocket netlayer, enliven the chatroom,
 *   join, and subscribe. Errors are caught and surfaced via the chat
 *   state's `error` events; the returned promise itself never rejects.
 * @property {(text: string) => Promise<void>} sendMessage  Send a
 *   message into the joined room. Errors are caught and surfaced as
 *   above.
 * @property {() => void} shutdown   Synchronous polite teardown:
 *   unsubscribe (eventual), leave (eventual), `client.shutdown()`
 *   (sync). Safe to call multiple times. The same function is wired
 *   into `shutdownHandle.run` for signal-handler use.
 */

/**
 * @typedef {{
 *   client: ReturnType<typeof makeClient> | undefined,
 *   channel: any,
 *   unsubscribe: any,
 *   selfUser: any,
 *   pendingNames: WeakSet<object>,
 * }} SessionRef
 */

/**
 * @param {OcapnChatConfig} config
 * @returns {{ state: State } & OcapnChatActions}
 */
export const useOcapnChat = ({
  name,
  captpVersion,
  verbose = true,
  logSink,
}) => {
  const [state, dispatch] = useReducer(reducer, initialState);

  const sessionRef = useRef(
    /** @type {SessionRef} */ ({
      client: undefined,
      channel: undefined,
      unsubscribe: undefined,
      selfUser: undefined,
      pendingNames: new WeakSet(),
    }),
  );

  const logInfo = useCallback(
    /** @param {string} text */
    text => dispatch({ type: 'info', text }),
    [],
  );

  const logError = useCallback(
    /**
     * @param {unknown} err
     * @param {string} [context]
     */
    (err, context) => {
      const text = context
        ? `${context}: ${formatError(err)}`
        : formatError(err);
      dispatch({ type: 'error', text });
    },
    [],
  );

  /**
   * Fire-and-forget background lookup of `self-proposed-name`. Dedupes
   * by remembering which capabilities we've already asked about
   * (whether or not the response has come back yet). We never re-ask,
   * even on failure; a failed lookup is recorded as a placeholder name
   * so the cache lookup succeeds on subsequent calls.
   * @param {object} user
   */
  const kickResolveName = useCallback(
    user => {
      const { pendingNames } = sessionRef.current;
      if (pendingNames.has(user)) return;
      pendingNames.add(user);
      E(user)
        ['self-proposed-name']()
        .then(resolved => {
          const display =
            typeof resolved === 'string' ? resolved : '<anonymous>';
          dispatch({ type: 'name-resolved', user, name: display });
        })
        .catch(err => {
          dispatch({
            type: 'name-resolved',
            user,
            name: '<unknown user>',
          });
          logError(err, 'failed to resolve user name');
        });
    },
    [logError],
  );

  const joinRoom = useCallback(
    /** @param {string} uri */
    async uri => {
      await null;
      try {
        dispatch({ type: 'reset-room' });
        dispatch({ type: 'set-phase', phase: 'connecting' });
        dispatch({ type: 'set-status', status: 'parsing URI…' });
        const { location, swissNum, kind } = parseOcapnUri(uri);
        if (!swissNum) {
          throw Error(
            'URI does not include a swiss number (expected ocapn://…/s/<base64url-swiss>)',
          );
        }
        logInfo(
          `parsed ${kind} URI: transport=${location.transport} designator=${location.designator} swissNum=${formatSwissnumForLog(swissNum)}`,
        );

        dispatch({
          type: 'set-status',
          status: 'starting websocket netlayer…',
        });
        const client = makeClient({
          verbose,
          ...(captpVersion ? { captpVersion } : {}),
          logger: makeReducerLogger(dispatch, 'client', logSink),
        });
        sessionRef.current.client = client;
        await client.registerNetlayer(handlers =>
          makeWebSocketNetLayer({
            handlers,
            logger: makeReducerLogger(dispatch, 'netlayer', logSink),
            specifiedHostname: '127.0.0.1',
            specifiedPort: 0,
          }),
        );

        dispatch({ type: 'set-status', status: 'enlivening sturdyref…' });
        
        const sref = client.makeSturdyRef(location, swissNum);
        const chatroom = await client.enlivenSturdyRef(sref);

        dispatch({ type: 'set-status', status: 'fetching room name…' });
        try {
          const roomName = await E(chatroom)['self-proposed-name']();
          if (typeof roomName === 'string') {
            dispatch({ type: 'set-room', roomName });
          }
        } catch (err) {
          logError(err, 'self-proposed-name');
        }

        dispatch({ type: 'set-status', status: 'joining room…' });
        const { user: selfUser, userController } = makeUserControllerPair(name);
        sessionRef.current.selfUser = selfUser;
        const channel = await E(userController)['join-room'](chatroom);
        sessionRef.current.channel = channel;

        // The chatroom (per `backend.js`) broadcasts `new-message` to
        // *every* subscriber including the sender, and some chatroom
        // implementations (e.g. Spritely Goblins) likewise echo
        // `user-joined`/`user-left` back at the actor that triggered
        // them. We render those events optimistically (in `sendMessage`
        // for messages; the lobby→chat phase transition implicitly
        // covers our own join), so the echo would show up as a duplicate
        // if we didn't filter it out here.
        //
        // Identity check: when our own `user` Far is sent out and comes
        // back, Endo's CapTP canonicalises the inbound reference back to
        // the original local Far, so `===` is a sound test for "this is
        // me". We compare against `sessionRef.current.selfUser` (rather
        // than closing over `selfUser`) so that a future `joinRoom` call
        // with a fresh user-controller pair uses the new identity.
        const isSelf = candidate =>
          candidate === sessionRef.current.selfUser;

        const observer = Far('tui-observer', {
          'new-message': (_context, fromUser, message) => {
            if (isSelf(fromUser)) return;
            const text =
              typeof message === 'string'
                ? message
                : `<non-string message: ${formatError(message)}>`;
            dispatch({ type: 'message-received', user: fromUser, text });
            kickResolveName(fromUser);
          },
          'user-joined': user => {
            if (isSelf(user)) return;
            dispatch({ type: 'user-joined', user });
            kickResolveName(user);
          },
          'user-left': user => {
            if (isSelf(user)) return;
            dispatch({ type: 'user-left', user });
            kickResolveName(user);
          },
        });

        const subResult = await E(channel).subscribe(observer);
        const [status, unsubscribe] = Array.isArray(subResult)
          ? subResult
          : [subResult, undefined];
        if (status !== 'OK') {
          throw Error(`Unexpected subscribe status: ${formatError(status)}`);
        }
        sessionRef.current.unsubscribe = unsubscribe;

        try {
          const users = await E(channel)['list-users']();
          if (Array.isArray(users)) {
            // The chatroom roster includes us; filter ourselves out so
            // the panel reads as "everyone else who's already here".
            const others = users.filter(u => !isSelf(u));
            if (others.length > 0) {
              dispatch({ type: 'users-present', users: others });
              for (const u of others) kickResolveName(u);
            }
          }
        } catch (err) {
          logError(err, 'list-users');
        }

        dispatch({ type: 'set-phase', phase: 'chat' });
        dispatch({
          type: 'set-status',
          status: `connected as ${name}`,
        });
      } catch (err) {
        logError(err, 'joinRoom');
        dispatch({ type: 'set-status', status: 'connect failed — try again' });
        dispatch({ type: 'set-phase', phase: 'lobby' });
      }
    },
    [name, captpVersion, verbose, logSink, logError, logInfo, kickResolveName],
  );

  const sendMessage = useCallback(
    /** @param {string} text */
    async text => {
      await null;
      const { channel } = sessionRef.current;
      if (!channel) {
        logError(Error('no channel'));
        return;
      }
      try {
        await E(channel)['send-message'](text);
        dispatch({ type: 'message-sent', name, text });
      } catch (err) {
        logError(err, 'send-message');
      }
    },
    [name, logError],
  );

  const shutdown = useCallback(() => {
    const { client, channel, unsubscribe } = sessionRef.current;
    // Best-effort polite leave so the remote chatroom hears us go.
    // Each call is independently try/caught because any one failing
    // (e.g. the channel is already closed) shouldn't skip the others.
    if (unsubscribe) {
      try {
        E(unsubscribe)().catch(() => undefined);
      } catch (_) {
        // ignore
      }
    }
    if (channel) {
      try {
        E(channel)
          .leave()
          .catch(() => undefined);
      } catch (_) {
        // ignore
      }
    }
    if (client) {
      try {
        client.shutdown();
      } catch (err) {
        logError(err, 'shutdown');
      }
    }
  }, [logError]);

  // Install the polite-shutdown into the module-level handle so signal
  // handlers in the entrypoint can invoke the same teardown as the
  // in-app Ctrl+C path. Cleared on unmount so a stale closure can't
  // fire after React has torn the tree down.
  useEffect(() => {
    shutdownHandle.run = shutdown;
    return () => {
      shutdownHandle.run = () => undefined;
    };
  }, [shutdown]);

  return { state, joinRoom, sendMessage, shutdown };
};
