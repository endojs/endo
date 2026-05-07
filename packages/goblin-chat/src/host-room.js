// @ts-check
/* eslint-disable import/no-unresolved */

/**
 * Hosting helper for the goblin-chat TUI.
 *
 * Stands up a `^chatroom` Far behind a websocket netlayer, registers
 * it under a freshly generated swissnum, and produces the corresponding
 * sturdyref URI. The host is owned by its own OCapN client — separate
 * from the participant client in `useGoblinChat` — so the user can join
 * their own hosted room over the loopback websocket and exercise the
 * exact code path a remote joiner would use.
 *
 * Two important things to know about the URI we hand back:
 *
 *   1. The websocket netlayer's `hints.url` defaults to
 *      `ws://127.0.0.1:<random-port>`, which is reachable only from the
 *      same machine. Sharing a hosted URI off-host requires the user to
 *      do their own port-forwarding / public-IP wiring — that's out of
 *      scope here.
 *
 *   2. Because the host advertises a fresh ephemeral port (and a fresh
 *      random swissnum) every session, the URI is single-use: it stops
 *      working the moment the TUI exits. Callers that record joined
 *      rooms in persistent history should treat self-hosted URIs as
 *      transient (see the `transient` flag on `useGoblinChat.joinRoom`).
 *
 * The module also keeps a process-wide `hostRegistry` so the entrypoint
 * can shut every host cleanly on process exit / SIGINT / SIGTERM. The
 * websocket server holds the event loop open, so missing this teardown
 * means a clean Ctrl+C from the menu wouldn't actually exit.
 */

import { randomBytes } from 'node:crypto';

import { makeOcapn } from '@endo/ocapn';
import { makeWebSocketNetLayer } from '@endo/ocapn/netlayer/ws';
import { syrupCodec } from '@endo/ocapn/syrup';

import { makeChatroom } from './backend.js';
import { encodeBase64Url } from './base64url.js';

/**
 * @typedef {import('./use-goblin-chat.js').LogSink} LogSink
 * @typedef {import('@endo/ocapn').OcapnLocation} OcapnLocation
 */

// 16 bytes of entropy → 22 base64url chars; enough that a directed
// guess across an ephemeral port is astronomically unlikely, short
// enough that the URI fits on one terminal line.
const SWISSNUM_BYTE_LENGTH = 16;

/**
 * Generate a fresh swissnum string. We use random bytes encoded as
 * URL-safe base64 (no padding), which guarantees an ASCII string —
 * the OCapN client's `decodeSwissnum` is strict ASCII, so a raw random
 * byte sequence (which would routinely contain non-ASCII bytes) can't
 * be used as a swissnum string directly.
 *
 * @returns {string}
 */
const makeFreshSwissString = () =>
  encodeBase64Url(Uint8Array.from(randomBytes(SWISSNUM_BYTE_LENGTH)));

/**
 * Build the `/s/<…>` segment of an OCapN sturdyref URI from a swissnum
 * string. Per the OCapN draft spec the path segment is
 * `base64url(swiss-bytes)` where `swiss-bytes` is the on-the-wire
 * bytestring representation of the swissnum. Endo represents that
 * bytestring as the ASCII bytes of the registered swissnum string —
 * see the `decodeSwissnum`/`encodeSwissnum` pair in
 * `@endo/ocapn/src/client/util.js` — so we re-encode those ASCII bytes
 * here.
 *
 * @param {string} swissStr
 * @returns {string}
 */
const swissStringToUriSegment = swissStr => {
  const bytes = new Uint8Array(swissStr.length);
  for (let i = 0; i < swissStr.length; i += 1) {
    bytes[i] = swissStr.charCodeAt(i);
  }
  return encodeBase64Url(bytes);
};

/**
 * Render a hints map onto an OCapN URI's query string. Keys are sorted
 * for byte-stable output — we don't care about hint ordering on the
 * wire, but a stable URI is friendlier to log/snapshot diffs and to
 * humans comparing two URIs by eye.
 *
 * @param {OcapnLocation['hints']} hints
 * @returns {string}
 */
const formatHintsQuery = hints => {
  if (!hints || typeof hints !== 'object') return '';
  const keys = Object.keys(hints).sort();
  if (keys.length === 0) return '';
  const params = new URLSearchParams();
  for (const key of keys) {
    params.append(key, String(hints[key]));
  }
  return `?${params.toString()}`;
};

/**
 * Format the user-facing sturdyref URI for a hosted chatroom from its
 * peer location and swissnum.
 *
 * @param {OcapnLocation} location
 * @param {string} swissStr
 * @returns {string}
 */
const formatLocator = (location, swissStr) => {
  const { designator, transport, hints } = location;
  const segment = swissStringToUriSegment(swissStr);
  return `ocapn://${designator}.${transport}/s/${segment}${formatHintsQuery(hints)}`;
};

/**
 * Wrap a `LogSink` into the `Logger` shape that `makeOcapn` /
 * `makeWebSocketNetLayer` expect. Each level forwards through to the
 * sink (when one is provided), tagged with `source` so the entrypoint
 * file log can distinguish host-side lines from participant-side lines.
 * A missing sink degrades gracefully to no-op.
 *
 * @param {string} source
 * @param {LogSink} [logSink]
 */
const makeForwardingLogger = (source, logSink) => {
  /** @param {'log' | 'info' | 'error'} level */
  const make =
    level =>
    /** @param {unknown[]} args */
    (...args) => {
      if (!logSink) return;
      // Mirror `useGoblinChat`'s `formatLogArg` shape: strings pass
      // through, errors render their message, everything else gets
      // JSON-stringified with a String() fallback.
      const text = args
        .map(value => {
          if (typeof value === 'string') return value;
          if (value instanceof Error) return value.message;
          try {
            return JSON.stringify(value);
          } catch (_) {
            try {
              return String(value);
            } catch (__) {
              return '<unprintable>';
            }
          }
        })
        .join(' ');
      try {
        logSink(level, source, text);
      } catch (_) {
        // never let a broken sink take down the host
      }
    };
  return harden({
    log: make('log'),
    info: make('info'),
    error: make('error'),
  });
};

/**
 * @typedef {object} HostHandle
 * @property {() => void} shutdown
 *   Synchronous teardown of the host's OCapN client (which in turn
 *   closes its websocket server and any active sockets). Safe to call
 *   multiple times.
 */

/** @type {Set<HostHandle>} */
const activeHosts = new Set();

/**
 * Process-wide registry of live hosts. The entrypoint installs a
 * signal handler that calls `shutdownAll()` on the way out so a Ctrl+C
 * from the menu actually exits — the websocket server otherwise keeps
 * the event loop pinned open.
 */
export const hostRegistry = harden({
  /** @param {HostHandle} handle */
  register(handle) {
    activeHosts.add(handle);
  },
  /** @param {HostHandle} handle */
  unregister(handle) {
    activeHosts.delete(handle);
  },
  shutdownAll() {
    for (const handle of activeHosts) {
      try {
        handle.shutdown();
      } catch (_) {
        // best-effort
      }
    }
    activeHosts.clear();
  },
});

/**
 * @typedef {object} HostRoomOptions
 * @property {string} roomName
 *   The chatroom's `self-proposed-name`. Returned to remote subscribers
 *   verbatim from the `'self-proposed-name'` selector.
 * @property {string} [captpVersion]
 *   Forwarded to `makeOcapn`. Defaults to the client's own default
 *   when omitted.
 * @property {LogSink} [logSink]
 *   Optional log sink for the host's `client` and `netlayer` logs (the
 *   TUI hands in its per-session file sink).
 * @property {string} [bindHostname='127.0.0.1']
 *   Network interface the websocket server should listen on. Defaults
 *   to loopback so a casual `Host a new chat` doesn't expose anything
 *   off-host. Set to `0.0.0.0` (or a specific public IP) when
 *   deploying as a server.
 * @property {number} [bindPort=0]
 *   TCP port the websocket server should listen on. `0` picks an
 *   ephemeral port (the default for ad-hoc local hosting); set to a
 *   stable number when running behind a firewall / forwarding rule
 *   so the advertised URI doesn't change between sessions.
 * @property {string} [publicUrl]
 *   The `ws://…` or `wss://…` URL that should appear in the
 *   sturdyref's `hints.url` (and therefore in the URI handed out to
 *   peers). When omitted, defaults to `ws://<bind-host>:<bind-port>`,
 *   which is what other peers will dial. Override this when the
 *   externally reachable URL differs from the bind address — e.g.
 *   running behind a reverse proxy that terminates TLS
 *   (`wss://chat.example.com`) or NAT'd to a public IP under a
 *   different port.
 *
 * @typedef {object} HostedRoom
 * @property {string} uri
 *   The full `ocapn://…/s/<base64url>?url=ws://…` sturdyref URI. Pass
 *   to a participant's `joinRoom` (or copy to the clipboard for a
 *   peer to paste).
 * @property {() => void} shutdown
 *   Polite teardown — closes the websocket server, terminates active
 *   sockets, removes the host from the process-wide registry. Safe to
 *   call multiple times.
 */

/**
 * Stand up a hosted chatroom. The returned handle owns the lifetime of
 * the underlying OCapN client + websocket server; the caller is
 * responsible for invoking `shutdown()` (or relying on
 * `hostRegistry.shutdownAll()` at process exit).
 *
 * @param {HostRoomOptions} options
 * @returns {Promise<HostedRoom>}
 */
export const hostRoom = async ({
  roomName,
  captpVersion,
  logSink,
  bindHostname = '127.0.0.1',
  bindPort = 0,
  publicUrl,
}) => {
  const swissStr = makeFreshSwissString();
  const chatroom = makeChatroom(roomName);

  // The NonceLocator is mutated below to register the chatroom under
  // its swissnum *after* makeOcapn returns; the new client API takes
  // the locator at construction time but holds a live reference, so
  // subsequent `locator.set` calls are visible to incoming
  // bootstrap.fetch lookups.
  const locator = new Map();
  /** @type {{ netlayer?: Awaited<ReturnType<typeof makeWebSocketNetLayer>> }} */
  const netlayerRef = {};

  const client = await makeOcapn({
    codec: syrupCodec,
    locator,
    verbose: true,
    ...(captpVersion ? { captpVersion } : {}),
    logger: makeForwardingLogger('host-client', logSink),
    network: handlers =>
      makeWebSocketNetLayer({
        handlers,
        logger: makeForwardingLogger('host-netlayer', logSink),
        specifiedHostname: bindHostname,
        specifiedPort: bindPort,
        ...(publicUrl ? { specifiedUrl: publicUrl } : {}),
      }).then(netlayer => {
        netlayerRef.netlayer = netlayer;
        return netlayer;
      }),
  });
  locator.set(swissStr, chatroom);

  if (!netlayerRef.netlayer) {
    throw Error('makeWebSocketNetLayer did not resolve a netlayer');
  }
  const netlayer = netlayerRef.netlayer;

  const uri = formatLocator(netlayer.location, swissStr);

  let shutDown = false;
  /** @type {HostHandle} */
  const handle = {
    shutdown: () => {
      if (shutDown) return;
      shutDown = true;
      try {
        client.shutdown();
      } catch (_) {
        // best-effort
      }
      hostRegistry.unregister(handle);
    },
  };
  hostRegistry.register(handle);

  return harden({
    uri,
    shutdown: handle.shutdown,
  });
};
