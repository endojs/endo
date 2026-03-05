# Gateway Bearer Token Authentication

| | |
|---|---|
| **Created** | 2026-03-02 |
| **Updated** | 2026-03-02 |
| **Author** | Kris Kowal (prompted) |
| **Status** | Not Started |

## What is the Problem Being Solved?

The Endo daemon gateway currently accepts connections only from localhost.
The gateway checks the remote IP address and rejects any connection that
does not originate from `127.0.0.1` or `::1`. This makes the gateway
unsuitable for remote access — a self-hosted daemon on a VPS cannot be
controlled from a user's local machine.

The Chat UI already receives the agent ID via URL fragment
(`#gateway=<host>&agent=<id>`), but this is used only for local gateway
connections where the localhost check provides authentication. For remote
access, the agent ID in the URL fragment must serve as a bearer token,
presented over WebSocket to authenticate the connection.

The specific requirement is: a user self-hosting a daemon with Docker can
open `https://my-daemon.example.com/#agent=<root-agent-id>` in their
browser, and the Chat UI establishes an authenticated session as that
agent's profile.

## Design

### Authentication model

The agent's formula identifier (256-bit hex string) serves as the bearer
token. This is the same identifier that `endo inbox` and `endo send`
use to select an agent. Knowing the identifier grants full control of
that agent's profile — the same authority model as SSH keys or API
tokens.

The URL fragment (`#agent=<id>`) is never sent to the server in HTTP
requests (per RFC 3986). The Chat UI extracts the agent ID from
`window.location.hash` and sends it over the WebSocket connection during
the handshake phase.

### WebSocket handshake

Currently, the Chat UI opens a WebSocket to the gateway and immediately
begins sending commands. The new flow adds an authentication step:

1. **Client connects** to `wss://host:port/ws`.
2. **Client sends auth message:**
   ```json
   { "type": "auth", "agentId": "<256-bit-hex>" }
   ```
3. **Gateway validates:**
   - Looks up the agent ID in the formula store.
   - If valid, binds the WebSocket session to that agent's profile.
   - Sends `{ "type": "auth-ok", "agentName": "<pet-name>" }`.
   - If invalid, sends `{ "type": "auth-error", "message": "..." }` and
     closes the connection.
4. **Session proceeds** — all subsequent messages operate in the context
   of the authenticated agent.

For localhost connections (the existing case), the auth step is optional.
If the gateway is in local mode and no auth message is sent, it falls
back to the current behavior of binding to the default agent.

### Gateway modes

The gateway operates in one of two modes, controlled by configuration:

| Mode | Binding | Auth required | Default |
|------|---------|---------------|---------|
| `local` | `127.0.0.1` | No (localhost check) | Yes |
| `remote` | `0.0.0.0` | Yes (bearer token) | No |

Remote mode is enabled by:
- Environment variable: `ENDO_GATEWAY_REMOTE=true`
- CLI flag: `--remote`
- Configuration in state directory

In remote mode, the gateway:
- Binds to `0.0.0.0` (all interfaces)
- Requires the `auth` message on every WebSocket connection
- Rejects connections that do not authenticate within a timeout (5s)
- Does NOT serve the gateway on plain HTTP without TLS (warns if no
  reverse proxy detected)

### Chat UI changes

The Chat UI needs minimal changes:

1. **Extract agent ID from hash:** Already done (`#agent=<id>`).
2. **Send auth message on connect:** After WebSocket `open` event, send
   the auth message before any other traffic.
3. **Handle auth response:** Wait for `auth-ok` before rendering the
   inbox. Show an error screen on `auth-error`.
4. **Reconnection:** On WebSocket reconnect, re-send the auth message.

```js
ws.addEventListener('open', () => {
  const agentId = new URLSearchParams(
    window.location.hash.slice(1),
  ).get('agent');
  if (agentId) {
    ws.send(JSON.stringify({ type: 'auth', agentId }));
  }
});

ws.addEventListener('message', event => {
  const msg = JSON.parse(event.data);
  if (msg.type === 'auth-ok') {
    // Proceed with normal operation
    renderInbox();
  } else if (msg.type === 'auth-error') {
    showError(msg.message);
    ws.close();
  }
  // ... handle other message types
});
```

### Security considerations

1. **Token secrecy.** The agent ID is a 256-bit random hex string (64
   characters). Brute-forcing is infeasible. The primary risk is token
   leakage through:
   - Browser history: URL fragments are not typically logged by servers
     but may appear in browser history. Users should treat the URL as
     sensitive.
   - Referrer headers: Fragments are not included in Referrer headers.
   - Shared links: Users must not share the URL with the fragment.

2. **TLS required.** In remote mode, the WebSocket carries the bearer
   token. Without TLS, the token is visible to network observers. The
   gateway should warn (log) if operating in remote mode without TLS
   termination. The Docker design delegates TLS to a reverse proxy.

3. **Rate limiting.** The gateway rate-limits failed auth attempts per
   IP to prevent online brute force (e.g., 10 attempts per minute).

4. **No session tokens.** Each WebSocket connection authenticates
   independently using the agent ID. There are no session cookies or
   JWTs. This simplifies the implementation and avoids token refresh
   complexity.

5. **Localhost bypass.** In local mode, the localhost IP check remains
   the authentication mechanism. This preserves backward compatibility
   and avoids requiring a token for local development.

### CLI remote access

The CLI can also connect to a remote gateway:

```bash
endo --gateway https://my-daemon.example.com --agent <id> inbox
```

The CLI opens a WebSocket, sends the auth message, and proceeds. The
`--gateway` and `--agent` flags override the default localhost connection.

## Files Modified

| File | Change |
|------|--------|
| `packages/daemon/src/gateway.js` | Add auth message handling, remote mode, rate limiting |
| `packages/daemon/src/daemon-node.js` | Add `--remote` flag, `ENDO_GATEWAY_REMOTE` env var |
| `packages/chat/chat-component.js` | Send auth message on WebSocket connect, handle auth response |
| `packages/chat/connection-manager.js` | Auth handshake in reconnection logic |
| `packages/cli/src/endo.js` | Add `--gateway` and `--agent` global flags |
| `packages/cli/src/connection.js` | WebSocket auth handshake for remote connections |

## Design Decisions

1. **Agent ID as bearer token.** Reuses the existing 256-bit identifier
   rather than introducing a separate authentication credential. The
   agent ID already represents full authority over the profile. Adding a
   separate auth token would create two secrets to manage with no
   additional security benefit.

2. **URL fragment, not query parameter.** The fragment is never sent to
   the server in HTTP requests, reducing accidental logging. The Chat UI
   reads it client-side and sends it only over the authenticated
   WebSocket.

3. **No OAuth/OIDC.** The daemon is a personal server, not a multi-tenant
   service. OAuth adds complexity (redirect flows, token refresh, IdP
   configuration) without benefit for the single-user self-hosting case.

4. **WebSocket-first auth.** The auth message is sent over the WebSocket
   after connection, not as an HTTP header during the upgrade request.
   This avoids complexities with HTTP header manipulation in browser
   WebSocket APIs (which don't support custom headers on `new
   WebSocket()`).

## Related Designs

- [daemon-docker-selfhost](daemon-docker-selfhost.md) — Docker image
  for self-hosting; depends on this design for remote access.
- [familiar-gateway-migration](familiar-gateway-migration.md) — the
  gateway architecture that this design extends.
