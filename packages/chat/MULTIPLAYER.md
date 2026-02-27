# Multiplayer Demo: Cross-Node Chat

This guide walks through connecting two Endo daemons and exchanging
messages and capabilities between them using the chat UI.

## Overview

Each Endo daemon runs on a separate machine (or in a separate directory on
the same machine). After enabling networking on both daemons, one side
creates an invitation and the other accepts it. From that point on, both
sides can send messages, share values, and make requests across the
network.

Two network transports are available:

- **TCP** (`/network`): Direct TCP connections with netstring framing.
  Requires an open port. Best for same-network or same-machine setups.
- **libp2p** (`/network-libp2p`): Peer-to-peer via the IPFS network.
  No open ports needed — uses WebRTC with auto-discovered relays for NAT
  traversal. Best for cross-network connections.

Both use CapTP (Capability Transfer Protocol) for capability transport.
Object identity is preserved across the wire — capabilities sent in a
message can be adopted by the recipient and used as if they were local.

## Prerequisites

- Two running Endo daemons (see below for single-machine setup)
- The chat UI running against each daemon (`yarn dev` in `packages/chat`)
- The network module path on disk (TCP or libp2p)

### Single-Machine Setup

To run two daemons on one machine, start each with separate state
directories. Endo uses the XDG base directory variables and `ENDO_SOCK`
to locate its state, cache, ephemeral state, and Unix socket.

Define a helper for each persona to avoid repeating the env vars:

```bash
# Alice uses the system default (no env vars needed)
alias alice='yarn exec endo'

# Bob uses a separate state tree
alias bob='XDG_STATE_HOME=/tmp/endo-bob/state \
  XDG_RUNTIME_DIR=/tmp/endo-bob/run \
  XDG_CACHE_HOME=/tmp/endo-bob/cache \
  ENDO_SOCK=/tmp/endo-bob/endo.sock \
  ENDO_ADDR=127.0.0.1:8921 \
  yarn exec endo'
```

Create Bob's directories and start both daemons. Use `restart` rather
than `start` — `start` hangs if a daemon is already running on the same
socket:

```bash
mkdir -p /tmp/endo-bob/{state,run,cache}
alice restart
bob restart
```

Verify both are responsive:

```bash
alice ping   # prints "ok"
bob ping     # prints "ok"
```

Run a chat UI instance for each daemon. The Vite dev server uses the
system daemon by default; for a second instance, point the gateway at the
other daemon's socket and use a different port:

```bash
# Terminal 1 — Alice's chat (default port 5173)
yarn dev

# Terminal 2 — Bob's chat (port 5174)
ENDO_SOCK=/tmp/endo-bob/endo.sock VITE_PORT=5174 yarn dev
```

## Step 1: Enable TCP Networking

Both daemons need a TCP network transport before they can connect to each
other. The transport is an unconfined caplet that opens a TCP listener.

### Using the Chat UI

In each chat window, run:

```
/network
```

Fill in the fields:

- **Module**: The `file://` URL to the TCP network module.
  Typically `file:///path/to/endo/packages/daemon/src/networks/tcp-netstring.js`
  (auto-detected when running via `yarn dev`)
- **Host**: `127.0.0.1` (default)
- **Port**: `8940` (default; use `0` for an OS-assigned ephemeral port)

The command stores the listen address, installs the network module as an
unconfined caplet, and moves it to the `NETS/tcp` directory where the
daemon discovers it as an active transport.

### Using the CLI

```bash
# Store the listen address so the network module can find it
yarn exec endo store --text "127.0.0.1:8940" --name tcp-listen-addr

# Install the network as an unconfined module (needs Node.js access for `net`)
yarn exec endo make --UNCONFINED packages/daemon/src/networks/tcp-netstring.js --powers AGENT --name network-service

# Move to the networks directory
yarn exec endo mv network-service NETS.tcp
```

After this step, each daemon listens on an ephemeral TCP port and includes
its address in `getPeerInfo()`.

## Step 1b: Enable libp2p Networking (Alternative)

Instead of TCP, you can use libp2p for peer connections. libp2p requires
**no open ports and no self-hosted infrastructure** — it bootstraps into
the public IPFS network and discovers relay peers automatically via
Circuit Relay v2.

This is the recommended transport for connecting daemons across different
networks or behind NATs.

### Using the Chat UI

In each chat window, run:

```
/network-libp2p
```

Fill in the fields:

- **Module**: The `file://` URL to the libp2p network module.
  Typically `file:///path/to/endo/packages/daemon/src/networks/libp2p.js`

The module bootstraps into the IPFS Amino DHT, discovers relay peers, and
registers itself in the daemon's `NETS/libp2p` directory. No listen
address or relay configuration is needed.

### Using the CLI

```bash
# Install the libp2p network (self-configures via public DHT, registers at NETS/libp2p)
yarn exec endo run --UNCONFINED packages/daemon/src/networks/setup-libp2p.js --powers HOST
```

After this step, each daemon has a libp2p peer ID and is reachable via
circuit relay addresses on the public IPFS network. The `endo://`
invitation locator will include these addresses alongside any TCP
addresses.

### Using Both TCP and libp2p

You can enable both transports on the same daemon. Invitation locators
will include addresses for all active networks. When the accepting daemon
connects, it tries each address in order and uses the first one that
succeeds.

## Step 2: Create and Accept an Invitation

One side creates an invitation; the other accepts it. This establishes a
CapTP session and registers each side's host handle in the other's pet
store.

### Alice Creates the Invitation

In Alice's chat:

```
/invite
```

Fill in the **Guest name** field with the local name for the remote peer —
for example, `bob`. The command prints an `endo://` locator URL. Copy it.

The locator looks like:

```
endo://abc123?id=42&from=7&at=tcp%2Bnetstring%2Bjson%2Bcaptp0%3A%2F%2F127.0.0.1%3A54321
```

### Bob Accepts the Invitation

In Bob's chat:

```
/accept
```

Fill in:

- **Invitation**: Paste the `endo://` locator URL from Alice
- **Save as**: The local name for Alice — for example, `alice`

After acceptance, Alice's pet store has `bob` pointing to Bob's host
handle, and Bob's pet store has `alice` pointing to Alice's host handle.

### CLI Equivalent

Using the `alice` and `bob` aliases from the setup section:

```bash
alice invite bob
# (prints locator URL)

echo "endo://..." | bob accept alice
```

## Step 3: Send Messages

With the connection established, both sides can send messages with
attached capabilities.

### Sending a Message

In Alice's chat, type a message to Bob using the `@` reference syntax:

```
@bob Hello from Alice!
```

Press Enter to send. Bob's inbox will show the message.

### Sending a Message with Attached Values

First, create a value to share. In Alice's chat:

```
/js 'Hello, World!'
```

Save the result as `greeting` when prompted, or use:

```
/js
```

with source `'Hello, World!'` and save the result name as `greeting`.

Then send it:

```
@bob Here is a greeting @greeting
```

The `@greeting` reference attaches the value's formula ID to the message.
Bob receives both the text and a reference to the value.

### Adopting Values from Messages

When Bob receives a message with attached values, he can adopt them into
his own pet store.

In Bob's chat:

```
/adopt
```

Fill in:

- **Message #**: The message number (shown in the inbox)
- **Edge**: The edge name from the message (e.g., `greeting`)
- **Save as**: A local pet name (e.g., `bobs-greeting`)

Bob can now use `bobs-greeting` as a local name. Looking it up resolves
the value through the peer connection:

```
/show bobs-greeting
```

This displays `'Hello, World!'` — fetched from Alice's daemon.

## Step 4: Requests and Replies

### Making a Request

Alice can request something from Bob:

```
/request
```

Fill in:

- **From**: `bob`
- **Description**: `Please share a number`
- **Save as**: `bobs-number` (where the resolved value will appear)

Bob sees the request in his inbox.

### Resolving a Request

Bob creates a value and resolves the request:

```
/js 42
```

Save as `answer`, then:

```
/resolve
```

Fill in:

- **Message #**: The request message number
- **Value**: `answer`

Alice's `bobs-number` now resolves to `42`.

### Replying to Messages

When Bob sees a message from Alice, he can reply directly. Select the
message in the inbox and use the reply action, or compose a new message to
`@alice`.

## How It Works

### Connection Lifecycle

1. **TCP Transport**: Each daemon runs a TCP listener via the
   `tcp-netstring.js` network module
2. **Invitation URL**: Encodes the inviter's node ID, host handle ID, and
   TCP address
3. **Accept**: The acceptor registers the inviter's peer info, resolves
   the remote invitation formula, and exchanges host handle IDs
4. **CapTP Session**: A persistent CapTP session carries all subsequent
   E() calls between the daemons

### Formula IDs Across Nodes

Every value in Endo has a formula identifier that encodes both a formula
number and a node number. When Alice sends a value to Bob, the message
carries Alice's formula ID. When Bob adopts it, Bob's pet store records
the remote formula ID as a string. When Bob looks up the value, the daemon
detects the foreign node number, connects to Alice's daemon via the peer
gateway, and calls `E(gateway).provide(id)` to fetch the value.

### Reconnection

If the TCP connection drops, the network transport cancels the peer
formula context, which evicts the stale controller from the daemon's
cache. The next `provide()` call for any value on the remote node triggers
a fresh connection through the RemoteControl state machine (which resets
to its `start` state on disconnection). Persistent formula graph entries,
pet store entries, and message records are all strings that survive the
reconnection.

Old CapTP `Far` references (live object proxies) are invalidated by a
connection drop and must be re-resolved via `provide(formulaId)`.

## Troubleshooting

### "Cannot connect to peer: no supported addresses"

The daemon has no network transport installed. Run `/network` to set one
up.

### Invitation locator doesn't work

- Verify both daemons have networking enabled (TCP or libp2p)
- For TCP: check that the address in the locator is reachable from the
  accepting machine (use `127.0.0.1` only for same-machine setups)
- For libp2p: ensure both daemons have internet access (needed for DHT
  bootstrap and relay discovery)
- Ensure the inviting daemon is still running

### Adopted value hangs on lookup

The remote daemon may be unreachable. Check that:

- The remote daemon is running
- For TCP: the TCP port is accessible and no firewall is blocking it
- For libp2p: both daemons have internet access; relay addresses may
  change if the relay peer disconnects (re-run `/invite` to get a fresh
  locator)

### Messages not appearing

- Check that the invitation was accepted on both sides
- Verify the recipient name matches the pet name from invite/accept
- Use `/ls` to confirm the peer name exists in the inventory

## Chat Commands Reference

| Command | Description |
|---------|-------------|
| `/network` | Enable TCP networking (module path + listen address) |
| `/network-libp2p` | Enable libp2p networking (no open ports needed) |
| `/invite` | Create an invitation for a peer (prints `endo://` locator) |
| `/accept` | Accept an invitation locator and name the peer |
| `/adopt` | Adopt a value from a received message |
| `/request` | Send a request to a peer |
| `/resolve` | Resolve a pending request with a value |
| `/reject` | Reject a pending request |
| `/show` | Inspect a value (works for remote values too) |
| `/ls` | List names in inventory |
