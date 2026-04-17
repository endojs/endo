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
  `tcp-testing-only` netlayer.

## Host a chatroom

```bash
node ./packages/ocapn/test/goblin-chat/index.js [room-name]
```

The script prints both a peer locator and the chatroom sturdyref:

```
*** Peer locator: ocapn://0000.tcp-testing-only?host=127.0.0.1&port=22047
*** Serving chatroom "#endo-interop" at sturdyref: ocapn://goblinChatRoomSwissnumForInteropTests0001.tcp-testing-only?host=127.0.0.1&port=22047
```

Override the port with `OCAPN_TEST_PORT=<n>`.

## Drive it from Goblins

Goblins ships an onion netlayer by default. To use the TCP testing netlayer
against this server you need a build of goblin-chat wired up with the
tcp-testing-only netlayer instead of (or alongside) the onion one. See
`../python-test-suite/README.md` for the analogous flow against the Python
conformance runner.

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
