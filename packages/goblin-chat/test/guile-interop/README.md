# Goblin Chat interop utility

Interop harness for Endo ↔ Guile Goblins chatroom tests.

The user-facing chatroom client (Ink TUI) and the JS port of the
Goblins `(goblin-chat backend)` module live in this same package
(`@endo/goblin-chat`). This directory contains only the **interop
harness** that drives the Endo client against a Guile-hosted
sturdyref under CI. Its all-JS counterpart lives in
[`../interop-self.test.js`](../interop-self.test.js).

- `interop-client.scm` — Guile-hosted side. Uses Spritely's existing
  `(goblin-chat backend)` implementation to host a room, registers it on
  the websocket netlayer, and prints a sturdyref for Endo to join.
- `index.js` — Endo client side. Accepts the Guile sturdyref URI, joins
  that room (using `makeUserControllerPair` from `@endo/goblin-chat`),
  and verifies bilateral message flow.

## Direction under test (current)

Current CI direction is:

1. **Guile hosts** the chatroom (existing Goblins backend).
2. Guile prints `sturdyref: ocapn://...`.
3. **Endo joins** that Guile-hosted sturdyref.
4. Both sides exchange one message and assert bilateral receive.

## Run Endo client against a Guile-hosted sturdyref

```bash
node ./packages/goblin-chat/test/guile-interop/index.js "ocapn://.../s/..."
```

Environment knobs:

- `OCAPN_CAPTP_VERSION` (default: `1.0`)
- `OCAPN_INTEROP_GUILE_MESSAGE` (default: `hello from Guile CI`)
- `OCAPN_INTEROP_ENDO_MESSAGE` (default: `hello from Endo OCapN`)
- `OCAPN_TEST_PORT` (optional local Endo websocket bind; default ephemeral)

## Interactive client (TUI)

For the human-driven TUI client (main menu, persistent settings,
log panel, recent rooms), use the dedicated package:

```bash
node ./packages/goblin-chat/bin/goblin-chat.js
```

See the package [`README.md`](../../README.md) for keys and
configuration.

## App-layer surface (matches Guile implementation)

These are reproduced bit-for-bit by the JS port that lives in
[`../../src/backend.js`](../../src/backend.js):

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
