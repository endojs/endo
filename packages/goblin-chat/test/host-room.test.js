// @ts-check
/* eslint-disable import/no-unresolved */

/**
 * `hostRoom` end-to-end test.
 *
 * Stands up a hosted chatroom via `hostRoom`, parses the URI it hands
 * back, and resolves the chatroom from a fresh OCapN client over the
 * loopback websocket — i.e. exercises the exact path the TUI's
 * "Host a new chat" menu item drives. Covers:
 *
 *   - URI shape: parses cleanly via `parseOcapnUri`, has a sturdyref
 *     swissnum, and the websocket netlayer is reachable at the
 *     advertised `hints.url`.
 *   - Cap surface: a remote peer can fetch `self-proposed-name` and
 *     get back the room name we passed in.
 *   - Lifecycle: `shutdownAll()` reliably closes the underlying
 *     websocket server (so the event loop doesn't stay pinned open).
 */

import '@endo/init';

import test from '@endo/ses-ava/test.js';

import { E } from '@endo/eventual-send';
import { makeClient } from '@endo/ocapn';
import { makeWebSocketNetLayer } from '@endo/ocapn/src/netlayers/websocket.js';

import { hostRoom, hostRegistry } from '../src/host-room.js';
import { parseOcapnUri } from '../src/uri-parse.js';

// Match what the in-process interop test uses; the websocket loopback
// path through `makeClient`/`makeWebSocketNetLayer` is most-tested at
// this version.
const CAPTP_VERSION = 'goblins-0.16';

// Both tests in this file touch the module-level `hostRegistry`, so
// run them serially: a stray `shutdownAll()` from one would otherwise
// race-shut the other's host mid-handshake.
test.serial(
  'hostRoom builds a sturdyref URI a remote OCapN client can resolve',
  async t => {
    const hosted = await hostRoom({
      roomName: '#test-host',
      captpVersion: CAPTP_VERSION,
    });
    t.true(hosted.uri.startsWith('ocapn://'));
    t.regex(hosted.uri, /\/s\/[A-Za-z0-9_-]+/u);

    const parsed = parseOcapnUri(hosted.uri);
    t.is(parsed.kind, 'sturdyref');
    t.is(parsed.location.transport, 'websocket');
    t.truthy(parsed.swissNum);
    t.truthy(parsed.location.hints);
    if (parsed.location.hints && typeof parsed.location.hints === 'object') {
      t.regex(String(parsed.location.hints.url), /^ws:\/\/127\.0\.0\.1:\d+$/u);
    }

    const remote = makeClient({ captpVersion: CAPTP_VERSION });
    await remote.registerNetlayer(handlers =>
      makeWebSocketNetLayer({
        handlers,
        // tests run quietly; the netlayer logger only fires on
        // exceptional paths anyway.
        logger: { log: () => {}, info: () => {}, error: () => {} },
      }),
    );

    try {
      if (!parsed.swissNum) {
        throw Error('parsed sturdyref URI missing swissNum');
      }
      const sref = remote.makeSturdyRef(parsed.location, parsed.swissNum);
      const chatroom = await remote.enlivenSturdyRef(sref);
      const name = await E(chatroom)['self-proposed-name']();
      t.is(name, '#test-host');
    } finally {
      remote.shutdown();
      hosted.shutdown();
    }
  },
);

test.serial(
  'hostRoom honours publicUrl override (advertises a different URL than it binds)',
  async t => {
    // We don't actually run a reverse proxy here — just verify the
    // sturdyref URI's `hints.url` reflects the override rather than
    // the bind address. A peer trying to dial it would fail (the URL
    // points nowhere reachable), but the netlayer-level wiring is
    // what we care about for this test.
    const hosted = await hostRoom({
      roomName: '#proxied',
      captpVersion: CAPTP_VERSION,
      bindHostname: '127.0.0.1',
      bindPort: 0,
      publicUrl: 'wss://chat.example.invalid:443/proxy',
    });
    try {
      const parsed = parseOcapnUri(hosted.uri);
      t.truthy(parsed.location.hints);
      if (parsed.location.hints && typeof parsed.location.hints === 'object') {
        t.is(
          parsed.location.hints.url,
          'wss://chat.example.invalid:443/proxy',
          'hints.url should reflect publicUrl override, not the loopback bind',
        );
      }
    } finally {
      hosted.shutdown();
    }
  },
);

test.serial('hostRegistry.shutdownAll closes outstanding hosts', async t => {
  const a = await hostRoom({ roomName: '#a', captpVersion: CAPTP_VERSION });
  const b = await hostRoom({ roomName: '#b', captpVersion: CAPTP_VERSION });
  t.not(a.uri, b.uri);
  // Each call should be idempotent: registry-driven shutdown shouldn't
  // throw if the per-handle shutdown was already invoked, and vice
  // versa.
  hostRegistry.shutdownAll();
  t.notThrows(() => a.shutdown());
  t.notThrows(() => b.shutdown());
});
