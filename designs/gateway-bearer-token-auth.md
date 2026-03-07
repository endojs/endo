# Gateway Remote Access

| | |
|---|---|
| **Created** | 2026-03-02 |
| **Updated** | 2026-03-06 |
| **Author** | Kris Kowal (prompted) |
| **Status** | Implemented |

## What is the Problem Being Solved?

The Endo daemon gateway currently accepts connections only from localhost.
The gateway checks the remote IP address and rejects any connection that
does not originate from `127.0.0.1` or `::1`. This makes the gateway
unsuitable for remote access — a self-hosted daemon on a VPS cannot be
controlled from a user's local machine.

The specific requirement is: a user self-hosting a daemon with Docker can
open `https://my-daemon.example.com/#agent=<root-agent-id>` in their
browser, and the Chat UI establishes an authenticated session as that
agent's profile.

## Authentication Model

Authentication is already implemented via CapTP. The `GatewayBootstrap`
exo exposes a single method:

```js
fetch(token) → agent powers
```

The `token` is the agent's formula identifier — a 256-bit hex string (64
characters). Knowing the identifier grants full control of that agent's
profile, the same authority model as SSH keys or API tokens.

The Chat UI already receives the agent ID via URL fragment
(`#gateway=<host>&agent=<id>`). The fragment is never sent to the server
in HTTP requests (per RFC 3986). The client extracts the agent ID from
`window.location.hash` and passes it to `GatewayBootstrap.fetch()` over
the CapTP WebSocket connection.

No additional JSON auth handshake is needed — CapTP provides the
authenticated channel, and `fetch(token)` is the gate.

## Design

### Remote mode

Remote mode is controlled by the `ENDO_GATEWAY` environment variable:

```js
const allowRemote = env.ENDO_GATEWAY === 'remote';
```

| Configuration | Mode | Auth |
|---|---|---|
| `ENDO_GATEWAY` unset or `local` (default) | Local | Localhost IP check |
| `ENDO_GATEWAY=remote` | Remote | Bearer token via CapTP |

Remote mode must be set explicitly alongside `ENDO_ADDR`. Binding to
`0.0.0.0` without `ENDO_GATEWAY=remote` will accept connections on all
interfaces but still reject non-localhost IPs — the operator must
opt in to remote access.

`ENDO_GATEWAY_ALLOWED_CIDRS` can also be used to allow specific IP
ranges without fully disabling the address check.

### Rate limiting

Failed `fetch()` attempts are rate-limited per IP to prevent online
brute force. The state per IP is a single value: the earliest
`Date.now()` at which the next fetch attempt will be accepted.

- **Rate:** 1-second penalty per failed attempt per IP, accruing.
- On a fetch attempt: if `Date.now() < nextAllowedTime`, reject with
  `"Rate limited"`.
- On a failed fetch: advance `nextAllowedTime` by 1 second from
  whichever is later — the current deadline or now. Consecutive
  failures stack: 2 rapid failures impose a 2-second wait, 10 impose
  10 seconds, etc.
- On a successful fetch: no state change.
- **Collection:** An entry is stale 10 seconds after the last failure
  (10× the penalty interval). Stale entries are collected via lazy sweep
  on subsequent `check()` calls.

Only failed attempts impose a penalty. Successful fetches don't affect
rate limit state.

### TLS warning

When remote mode is active, the gateway logs a warning at startup:

```
[Gateway] Remote mode active. Ensure TLS termination (reverse proxy)
is configured — bearer tokens are transmitted over the WebSocket connection.
```

The Docker design addresses TLS termination via reverse proxy.

## Security Considerations

1. **Token secrecy.** The agent ID is a 256-bit random hex string.
   Brute-forcing is infeasible. The primary risk is token leakage
   through browser history (URL fragments may appear there) or shared
   links. Users should treat the URL as sensitive.

2. **TLS required.** In remote mode, the WebSocket carries the bearer
   token. Without TLS, the token is visible to network observers. The
   gateway warns at startup if remote mode is active.

3. **Rate limiting.** Per-IP rate limiting on failed `fetch()` attempts
   prevents online brute force (1 attempt per second after a failure).

4. **No session tokens.** Each WebSocket connection authenticates
   independently via CapTP `fetch(token)`. No session cookies or JWTs.

5. **Localhost bypass.** In local mode, the localhost IP check remains
   the authentication mechanism. This preserves backward compatibility.

## Files Modified

| File | Change |
|---|---|
| `packages/daemon/src/web-server-node.js` | `ENDO_GATEWAY=remote` mode, per-IP rate limiter on `fetch()`, TLS warning |

## Design Decisions

1. **No separate auth handshake.** CapTP already provides an
   authenticated channel. The `GatewayBootstrap.fetch(token)` method is
   the authentication gate — adding a JSON auth message protocol would
   duplicate what CapTP provides.

2. **Agent ID as bearer token.** Reuses the existing 256-bit formula
   identifier rather than introducing a separate credential. The agent
   ID already represents full authority over the profile.

3. **URL fragment, not query parameter.** The fragment is never sent to
   the server in HTTP requests, reducing accidental logging.

4. **No OAuth/OIDC.** Even in a multi-tenant scenario, the bearer token
   for the user's capabilities is sufficient and does not require
   validation from a third-party authenticator. OAuth adds redirect
   flows, token refresh, and IdP configuration with no additional
   security benefit — the formula identifier already scopes authority
   to the holder.

5. **Explicit opt-in.** Remote mode requires `ENDO_GATEWAY=remote` —
   binding to `0.0.0.0` alone does not imply remote access. This avoids
   surprises when an operator binds to all interfaces for LAN use
   without intending full remote access.

## Related Designs

- [daemon-docker-selfhost](daemon-docker-selfhost.md) — Docker image
  for self-hosting; depends on this design for remote access.
- [familiar-gateway-migration](familiar-gateway-migration.md) — the
  gateway architecture that this design extends.
