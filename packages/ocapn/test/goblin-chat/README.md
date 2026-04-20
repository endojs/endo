# Goblin Chat interop utility

Interop harness for Endo <-> Guile Goblins chatroom tests.

- `interop-client.scm` — Guile-hosted side. Uses Spritely's existing
  `(goblin-chat backend)` implementation to host a room, registers it on the
  websocket netlayer, and prints a sturdyref for Endo to join.
- `index.js` — Endo client side. Accepts the Guile sturdyref URI, joins that
  room, and verifies bilateral message flow.
- `backend.js` — JavaScript port of `(goblin-chat backend)` used by the Endo
  side to produce a Goblins-compatible user-controller/client surface.
- `tui.js` — interactive [Ink](https://github.com/vadimdemedes/ink)
  client that joins a remote chatroom from a pasted sturdyref URI.

## Direction under test (current)

Current CI direction is:

1. **Guile hosts** the chatroom (existing Goblins backend).
2. Guile prints `sturdyref: ocapn://...`.
3. **Endo joins** that Guile-hosted sturdyref.
4. Both sides exchange one message and assert bilateral receive.

## Run Endo client against a Guile-hosted sturdyref

```bash
node ./packages/ocapn/test/goblin-chat/index.js "ocapn://.../s/..."
```

Environment knobs:

- `OCAPN_CAPTP_VERSION` (default: `goblins-0.16`)
- `OCAPN_INTEROP_GUILE_MESSAGE` (default: `hello from Guile CI`)
- `OCAPN_INTEROP_ENDO_MESSAGE` (default: `hello from Endo OCapN`)
- `OCAPN_TEST_PORT` (optional local Endo websocket bind; default ephemeral)

## Join a chatroom from the TUI

Run the Ink TUI to join an existing chatroom (hosted by Goblins or by the
Guile interop client) using the sturdyref URI it printed:

```bash
node ./packages/ocapn/test/goblin-chat/tui.js
```

The TUI takes over the terminal (alt screen) and shows a single input
box. Paste an `ocapn://…/s/<base64url-swiss>?url=ws://…` URI and press
Enter to connect, then type messages and press Enter to send them.
Errors and protocol diagnostics surface inline in the message log;
`Ctrl+C` exits and restores the terminal.

Environment overrides:

- `OCAPN_TUI_NAME` — `self-proposed-name` for the local user
  (default `endo-tui`).
- `OCAPN_CAPTP_VERSION` — handshake CapTP version; default
  `goblins-0.16` to interop with Spritely Goblins peers.

## App-layer surface (matches Guile implementation)

- `^chatroom`: `self-proposed-name`, `subscribe`.
- `^user`: `self-proposed-name`, `get-chat-sealed?`, `get-chat-unsealer`,
  `get-subscription-sealer`.
- `^user-controller`: `whoami`, `connect-client`, `join-room`.
- `^user-inbox` (public surface called by the chatroom): `new-message`,
  `user-joined`, `user-left`, `context`.
- `^user-messaging-channel`: `leave`, `send-message`, `list-users`.
- `^authenticated-channel` (local wrapper returned by `join-room`):
  `send-message`, `subscribe`, `leave`, `list-users`.

## Caveats

- The Guile backend gates `^user-inbox` controller-only methods behind a
  warden/incanter pair. The JS port keeps those methods off the wire
  entirely (held as closed-over functions on the controller side) instead
  of reifying the warden, which is equivalent for the interop surface.
- `ghash` and `seteq` are approximated with `Map` and `Set`.
- `<-np` fire-and-forget sends use `E.sendOnly` so promise GC matches
  Goblins' expectations.
