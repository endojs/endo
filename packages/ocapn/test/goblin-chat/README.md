# Goblin Chat interop utility

A test utility that implements the core of the Guile Goblins
[`goblin-chat`](https://codeberg.org/spritely/goblin-chat) backend in
JavaScript so an Endo OCapN peer can participate in interop exercises
against Goblins (or any other OCapN implementation that speaks the same
app-layer protocol).

- `backend.js` — direct port of `(goblin-chat backend)`: `^chatroom`,
  `spawn-user-controller-pair`, plus a small sealer-triplet helper. Method
  names are kebab-case so that Goblins' CapTP selector symbols dispatch
  directly.
- `index.js` — runnable host that advertises a chatroom sturdyref on the
  `websocket` netlayer.
- `uri-parse.js` — pure parser for `ocapn://…` peer / sturdyref URIs as
  defined by `draft-specifications/Locators.md`. Sturdyrefs use the
  `/s/<base64url-swiss>` path form (matching Spritely Goblins'
  `string->ocapn-id` in `goblins/ocapn/ids.scm`).
- `tui.js` — interactive [Ink](https://github.com/vadimdemedes/ink)
  client that joins a remote chatroom from a pasted sturdyref URI.

## Host a chatroom

```bash
node ./packages/ocapn/test/goblin-chat/index.js [room-name]
```

The script prints both a peer locator and the chatroom sturdyref:

```
*** Peer locator: ocapn://<base32-ed25519-public-key>.websocket?url=ws%3A%2F%2F127.0.0.1%3A22047
*** Serving chatroom "#endo-interop" at sturdyref: ocapn://<base32-ed25519-public-key>.websocket/s/<base64url-swiss>?url=ws%3A%2F%2F127.0.0.1%3A22047
```

Override the port with `OCAPN_TEST_PORT=<n>`.

## Join a chatroom from the TUI

Run the Ink TUI to join an existing chatroom (hosted by Goblins or by the
script above) using the sturdyref URI it printed:

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

## Drive it from Goblins

Goblins ships an existing websocket netlayer, which this interop harness uses
directly. The Guile interop client in this directory imports
`(goblins ocapn netlayer websocket)` and runs with `#:encrypted? #f` against
the local `ws://` endpoint emitted by `index.js`.

From the client side, a Goblins user-controller would:

1. `enliven` the chatroom sturdyref above → live chatroom ref.
2. `(<- user-controller 'join-room chatroom)` — the controller calls
   `(<- chatroom 'subscribe user)`, which:
   - asks the user for its `get-subscription-sealer`,
   - spawns a finalizer, has the sealer seal it, and returns the handle;
   - the controller unseals with its own `subscription-unsealer`, calls
     the finalizer with its `user-inbox`, and gets back a
     `user-messaging-channel`.
3. Send messages with `(<- channel 'send-message …)` (the controller's
   authenticated-channel wrapper seals the contents first).

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
