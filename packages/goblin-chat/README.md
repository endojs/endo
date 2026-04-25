# @endo/goblin-chat

OCapN chat protocol implementation and an [Ink](https://github.com/vadimdemedes/ink)-based
TUI client. Interoperable with Spritely's [`(goblin-chat backend)`](https://codeberg.org/spritely/goblin-chat/) — see the bit-for-bit notes in
[`src/backend.js`](./src/backend.js).

The package ships:

- **Chat protocol** — `^chatroom`, `^user`, `^user-controller`,
  `^user-inbox`, `^user-messaging-channel`, `^authenticated-channel`.
  A direct port of the Guile reference implementation, suitable for
  hosting a chatroom from JS or for talking to a Goblins-hosted one.
- **TUI client** — a full-screen Ink app with a main menu (join new /
  host new / join previous / set name), persistent settings, an
  optional diagnostic log panel, and per-session log file. The
  "Host a new chat" entry stands up an in-process chatroom on a
  loopback websocket and copies the freshly minted sturdyref URI to
  the system clipboard so it can be pasted to a peer.

## Quickstart — connect to a chatroom

```bash
node ./packages/goblin-chat
```

(or `node ./packages/goblin-chat/index.js`, or
`yarn workspace @endo/goblin-chat start`, or just `goblin-chat` if the
package is installed and on `PATH` via its `bin` entry).

The TUI takes over the terminal (alt screen) and opens on the main
menu. Keys:

| Key            | Effect                                                        |
| -------------- | ------------------------------------------------------------- |
| `↑` `↓`        | Move the menu / list cursor                                   |
| `Enter`        | Activate the highlighted item / submit the current input      |
| `1`–`5`        | Quick-pick the corresponding menu item                        |
| `Esc`          | Cancel name / URI / room-name input and return to the menu    |
| `d`            | (Recent-list) delete the highlighted entry                    |
| `Ctrl+L`       | Toggle the diagnostic log panel (hidden by default)           |
| `Ctrl+C`       | From chat: leave the room. From menu: quit.                   |

Pasting a sturdyref URI works in the URI input phase — most terminals
emit the whole pasted blob as a single keystroke event, including the
trailing newline, which the TUI treats as `Enter`.

## Hosting your own chat

Pick **Host a new chat** from the main menu, type a chatroom name, and
the TUI will:

1. Stand up a fresh `^chatroom` Far in a separate OCapN client.
2. Bind a websocket netlayer to a random port on `127.0.0.1`.
3. Build a sturdyref URI of the form
   `ocapn://<designator>.websocket/s/<base64url>?url=ws://127.0.0.1:<port>`
4. Copy that URI to the system clipboard (via `pbcopy` on macOS,
   `clip` on Windows, or `wl-copy`/`xclip`/`xsel` on Linux/BSD — the
   first one that runs wins; absence is non-fatal).
5. Auto-join you to your own chatroom over the loopback websocket so
   you're sitting in the room ready to receive participants.

The URI is also rendered into the chat events stream as an `info`
event, so you can read it without leaving the TUI even if the
clipboard write failed.

A few caveats:

- The URI is single-use: closing the TUI tears down the websocket
  server, and the next session generates a fresh ephemeral port and
  swissnum. Hosted joins are deliberately *not* added to the
  persistent recent-rooms list for that reason.
- The default `127.0.0.1:<random-port>` bind is reachable only from
  this machine. To share off-host, see "Hosting publicly" below.
- The host stays alive even after you `Ctrl+C` out of the chat back
  to the menu — only quitting the TUI shuts it down.

### Hosting publicly

When deploying as a server (or on a LAN box you want peers to dial
into), point the websocket netlayer at a real interface and tell it
the URL to advertise:

| Variable                  | Default            | Effect                                                                                                                                                              |
| ------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GOBLIN_CHAT_HOST_BIND`   | `127.0.0.1`        | Network interface the websocket server listens on. Set to `0.0.0.0` (or a specific NIC IP) to accept off-host connections.                                          |
| `GOBLIN_CHAT_HOST_PORT`   | `0` (ephemeral)    | TCP port the websocket server listens on. Pin to a stable number when running behind a firewall / port-forward so the URI doesn't change between restarts.          |
| `GOBLIN_CHAT_HOST_URL`    | `ws://<bind>:<port>` | URL announced to peers in the sturdyref's `hints.url`. Override when the externally reachable URL differs from the bind address — e.g. behind a TLS-terminating reverse proxy (`wss://chat.example.com`), or when the public hostname/port differs from the bind. |

Typical deployment shapes:

- **Bare public IP**, no proxy:

  ```bash
  GOBLIN_CHAT_HOST_BIND=0.0.0.0 \
  GOBLIN_CHAT_HOST_PORT=9000 \
  GOBLIN_CHAT_HOST_URL=ws://chat.example.com:9000 \
    goblin-chat
  ```

- **Behind an nginx/Caddy reverse proxy with TLS termination**:

  ```bash
  GOBLIN_CHAT_HOST_BIND=127.0.0.1 \
  GOBLIN_CHAT_HOST_PORT=9000 \
  GOBLIN_CHAT_HOST_URL=wss://chat.example.com \
    goblin-chat
  ```

  The proxy forwards `wss://chat.example.com` → `ws://127.0.0.1:9000`.

The host's designator (the long base32 string before `.websocket` in
the URI) is generated fresh each time the netlayer starts and is part
of the OCapN peer-auth handshake; nothing you set in env can pin it.
The swissnum (the `/s/<…>` segment) is likewise re-generated on every
"Host a new chat", so each chatroom hosted within a session gets its
own unguessable URI even if the netlayer's bind/URL is fixed.

## Persistent state

Settings persist between sessions in a small JSON file:

- `$XDG_CONFIG_HOME/goblin-chat/state.json` — when `XDG_CONFIG_HOME`
  is set (Linux/macOS users with explicit XDG configuration).
- `$APPDATA/goblin-chat/state.json` — Windows.
- `$HOME/.config/goblin-chat/state.json` — POSIX fallback.

The file stores:

```json
{
  "name": "your-display-name",
  "recentRooms": [
    {
      "uri": "ocapn://….websocket/s/<base64url>?url=ws://….",
      "displayName": "general",
      "lastJoinedAt": "2026-04-20T12:34:56.789Z"
    }
  ]
}
```

The list is bounded at 32 entries and writes are atomic
(`<file>.tmp` → `rename`). Override the path with
`GOBLIN_CHAT_STATE_FILE=/some/other/path.json` for tests or to keep
multiple personas separate.

## Diagnostic logs

The log panel is **hidden by default** so the chat view stays
uncluttered. Toggle it on with `Ctrl+L`. It collects:

- the OCapN client's `log`/`info`/`error` lines (handshake, session
  setup, connection close);
- the active netlayer's lines (websocket connect/disconnect, framing);
- TUI diagnostic lines (URI parse details, name-lookup failures,
  in-flight join errors).

These never go to the chat events stream — `parsed sturdyref URI: …`
and `failed to resolve user name: Connection closed during handshake.`
specifically belong here, not in the conversation log.

A per-session log file is also written to the current working
directory: `goblin-chat-YYYYMMDD-HHMMSS.log`. Override with
`GOBLIN_CHAT_LOG_FILE=/some/path.log`; pass an empty string to disable
file logging entirely.

## Environment knobs

| Variable                  | Default              | Effect                                                                       |
| ------------------------- | -------------------- | ---------------------------------------------------------------------------- |
| `GOBLIN_CHAT_NAME`        | `goblin-chatter`     | Initial display name (overridden by stored).                                 |
| `OCAPN_CAPTP_VERSION`     | `1.0`                | Handshake CapTP version.                                                     |
| `GOBLIN_CHAT_STATE_FILE`  | platform default     | Path to the persisted state JSON.                                            |
| `GOBLIN_CHAT_LOG_FILE`    | auto-named in CWD    | Path to per-session log; `''` disables.                                      |
| `GOBLIN_CHAT_HOST_BIND`   | `127.0.0.1`          | Hosted-chat websocket bind interface; set to `0.0.0.0` to listen publicly.   |
| `GOBLIN_CHAT_HOST_PORT`   | `0` (ephemeral)      | Hosted-chat websocket bind port; pin for stable, firewall-friendly URIs.     |
| `GOBLIN_CHAT_HOST_URL`    | `ws://<bind>:<port>` | URL announced in `hints.url`; override behind a TLS-terminating proxy/NAT.   |

See ["Hosting publicly"](#hosting-publicly) below for full details on
the host-side variables.

## Programmatic surface

```js
import { makeChatroom, makeUserControllerPair, parseOcapnUri } from '@endo/goblin-chat';
```

The same protocol pieces back the [Guile interop
harness](./test/guile-interop/) which connects an Endo client to a
Guile-hosted chatroom, alongside the all-JS
[`test/interop-self.test.js`](./test/interop-self.test.js).

Lower-level subpaths are also available for consumers that need them
directly:

- `@endo/goblin-chat/backend` — the protocol port (`makeChatroom`,
  `makeUserControllerPair`).
- `@endo/goblin-chat/uri-parse` — the OCapN URI parser.
- `@endo/goblin-chat/chat-state` — the pure reducer + typedefs.
- `@endo/goblin-chat/use-goblin-chat` — the React hook (requires
  `react`).
- `@endo/goblin-chat/state-store` — the JSON persistence helper.

## Module map

```
index.js                     runnable TUI entry (loads @endo/init, then renders)
api.js                       package main: pure re-exports (no side effects)
bin/
  goblin-chat.js             tiny shebang shim that imports ../index.js
src/
  backend.js                 ^chatroom / ^user / ^user-controller / ...
  uri-parse.js               ocapn:// URI parser
  chat-state.js              reducer, typedefs, pure helpers
  use-goblin-chat.js         React hook: OCapN session orchestration
  state-store.js             on-disk persistence (name + recent rooms)
  host-room.js               stand up a chatroom + websocket + sturdyref URI
  clipboard.js               best-effort pbcopy/clip/wl-copy/xclip/xsel writer
```

`index.js` deliberately includes `import '@endo/init';` — that
transitively performs SES lockdown, which `@endo/eventual-send` and
`@endo/marshal` need at module evaluation time. The library entry
`api.js` does *not* lock down on import, so embedders that already
manage their own SES initialisation can `import { ... } from
'@endo/goblin-chat'` without surprise side effects.

## Bit-for-bit interop

The chat backend mirrors quirks (and outright bugs) in the upstream
Guile implementation deliberately, so that a Goblins peer talking to
us, or vice versa, sees identical semantics. The notable ones, all
called out with `Bit-for-bit with Guile` / `Bug-for-bug with upstream`
comments in `src/backend.js`:

- `^user-messaging-channel.leave` `bcom`s the actor into a behaviour
  that returns `'CONNECTION-CLOSED'` for any further selector
  invocation.
- `^user-messaging-channel.list-users` resolves to unspecified —
  upstream uses `ghash-for-each` with a TODO comment about adding a
  `'keys` method.
- The `^unsubscribe` thunk handed back from `subscribe` reaches for
  an `'unsubscribe` selector that the controller-only methods table
  doesn't define, so calling it errors.
- `^finalize-subscription` backfill iterates over the subscribers
  *after* inserting the new user, so the joiner sees a
  `user-joined(self)` echo as the last item of the backfill.

The TUI's observer absorbs the self-echoes transparently.

## See also

- [`packages/ocapn`](../ocapn) — the underlying CapTP / OCapN client +
  netlayer.
- [`./test/guile-interop/`](./test/guile-interop) — bilateral interop
  test against a Guile-hosted chatroom; uses this package's
  `makeUserControllerPair` and `@endo/ocapn`'s websocket netlayer.
