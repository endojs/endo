# @endo/relay-server

WebSocket relay server for Endo daemon peer-to-peer connections. Allows daemons behind NATs or firewalls to discover and communicate with each other through a shared relay.

There is an instance running at https://endo-relay.fly.dev/ maintained by @kumavis

## How it works

The relay server is a binary frame router. It authenticates connecting daemons via an Ed25519 challenge-response handshake, maintains a table of connected peers, and bridges multiplexed channels between them. The relay never interprets the data flowing through channels -- CapTP runs end-to-end between the two daemons.

```
Daemon A ──WS──► Relay ◄──WS── Daemon B
                  │
          auth + channel mux
                  │
         DATA frames forwarded
           opaquely between
          bridged channels
```

## Running the relay server

```sh
node packages/relay-server/src/index.js --port 8943 --domain relay.example.com
```

Options:
- `--port` -- port to listen on (default: `8943`)
- `--domain` -- domain name bound into challenge signatures (default: `localhost`)

The `--domain` must match what connecting daemons are configured with, since it's included in the signed challenge data to prevent cross-relay replay attacks.

A health endpoint is available at `GET /health`:
```json
{ "status": "ok", "peers": 2, "connections": 3 }
```

TLS can be handled by a reverse proxy (nginx, caddy) in front of the relay.

## Connecting a daemon

### Using the chat UI

Use the `/network-ws-relay` slash command:

- **Relay URL**: `wss://relay.example.com` (or `ws://localhost:8943` for local dev)
- **Relay Domain**: derived from the URL if omitted
- **Module**: auto-detected in development

### Using the CLI

```sh
# Install the network caplet (uses the default relay wss://endo-relay.fly.dev).
# --powers HOST is required because the setup script calls makeUnconfined().
endo run --UNCONFINED packages/daemon/src/networks/setup-ws-relay.js --powers HOST
```

### Programmatically

```js
const specifier = new URL('ws-relay.js', import.meta.url).href;
await E(powers).makeUnconfined(undefined, specifier, {
  powersName: 'AGENT',
  resultName: 'network-service-ws-relay',
  env: {
    WS_RELAY_URL: 'wss://relay.example.com',
    WS_RELAY_DOMAIN: 'relay.example.com',
  },
});
await E(powers).move(['network-service-ws-relay'], ['NETS', 'ws-relay']);
```

## Wire protocol

Binary WebSocket frames with a 1-byte type prefix.

### Authentication

| Byte | Name      | Direction | Payload                         |
| ---- | --------- | --------- | ------------------------------- |
| 0x01 | HELLO     | C→S       | nodeId (32B Ed25519 public key) |
| 0x02 | CHALLENGE | S→C       | nonce (32B random)              |
| 0x03 | RESPONSE  | C→S       | signature (64B Ed25519)         |
| 0x04 | AUTH_OK   | S→C       | (empty)                         |
| 0x05 | AUTH_FAIL | S→C       | reason (UTF-8)                  |

The client signs `UTF8(domain) || nonce`, binding the signature to this specific relay and session.

### Multiplexed channels

| Byte | Name        | Direction | Payload                              |
| ---- | ----------- | --------- | ------------------------------------ |
| 0x10 | OPEN        | C→S       | channelId (4B) + targetNodeId (32B)  |
| 0x11 | INCOMING    | S→C       | channelId (4B) + fromNodeId (32B)    |
| 0x12 | OPENED      | S→C       | channelId (4B)                       |
| 0x13 | OPEN_FAILED | S→C       | channelId (4B) + reason (UTF-8)      |
| 0x14 | DATA        | bidi      | channelId (4B) + payload (opaque)    |
| 0x15 | CLOSE       | bidi      | channelId (4B)                       |
| 0x16 | PEER_GONE   | S→C       | channelId (4B)                       |

Keepalive: WebSocket-level ping/pong (30s interval, 10s timeout).

## Deploying to fly.io

### Prerequisites

```sh
brew install flyctl   # or: curl -L https://fly.io/install.sh | sh
fly auth login
```

### First-time setup

```sh
cd packages/relay-server

# Create the app on fly.io (skips the auto-deploy prompt)
fly launch --no-deploy

# Set the domain — must match the hostname clients will connect to
fly secrets set RELAY_DOMAIN=endo-relay.fly.dev
```

Edit `fly.toml` if you want a different app name or region, then deploy:

```sh
./scripts/deploy.sh
```

### Subsequent deploys

```sh
./scripts/deploy.sh
```

### Verifying

```sh
fly status
curl https://endo-relay.fly.dev/health
fly logs
```

### Configuration notes

- `auto_stop_machines = false` and `min_machines_running = 1` keep the machine
  always on. The relay holds peer state in memory, so it must not be stopped
  between connections.
- `RELAY_DOMAIN` must equal the hostname used in client connection URLs. It is
  included in the challenge that peers sign, so a mismatch causes auth failure.
- WebSockets work natively on fly.io — the proxy forwards the `Upgrade` header
  without any special config.

## Address format

Daemons advertise relay-based addresses as:

```
ws-relay+captp0://<nodeIdHex>?relay=wss://relay.example.com
```

- `nodeIdHex` is the 64-character hex Ed25519 public key (the daemon's node ID)
- `relay` query parameter specifies which relay server to use
