# EndoClaw: OAuth / Credential Capability

| | |
|---|---|
| **Created** | 2026-03-03 |
| **Updated** | 2026-03-03 |
| **Author** | Kris Kowal (prompted) |
| **Status** | Not Started |
| **Parent** | [endoclaw](endoclaw.md) |

## Summary

An `OAuth` capability lets an agent make authenticated HTTP requests to
a third-party API without ever seeing the credential. The host performs
the OAuth flow, stores the token, and grants the agent an `OAuth` exo
that proxies requests with the token injected. The agent calls
`E(gmail).fetch('/messages')` — the credential is structurally
inaccessible.

## Capability Shape

```ts
interface OAuth {
  fetch(path: string, options?: FetchOptions): Promise<Response>;
  baseUrl(): string;
  scopes(): string[];
  help(): string;
}

interface OAuthControl {
  setScopes(scopes: string[]): void;
  setAllowedPaths(patterns: string[]): void;
  setReadOnly(flag: boolean): void;  // restricts to GET/HEAD
  refresh(): Promise<void>;  // force token refresh
  revoke(): void;
  help(): string;
}

type FetchOptions = {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
};

type Response = {
  status: number;
  headers: Record<string, string>;
  text(): Promise<string>;
  json(): Promise<unknown>;
};
```

## How It Works

1. Host initiates OAuth flow (browser redirect or device code grant)
   and stores the access/refresh token in the daemon's formula store.
2. Host creates an `OAuth` / `OAuthControl` pair bound to the stored
   token and a base URL (e.g., `https://gmail.googleapis.com`).
3. Host grants the `OAuth` facet to an agent via pet name (`gmail`).
4. Agent calls `E(gmail).fetch('/gmail/v1/users/me/messages')`.
5. The `OAuth` exo:
   - Prepends the base URL to the path.
   - Validates the path against allowed patterns.
   - Checks method against read-only restrictions.
   - Injects the `Authorization: Bearer <token>` header.
   - Makes the HTTP request and returns the response.
6. Token refresh is handled transparently by the exo.

## Endo Idiom

**The agent never sees the token.** The `OAuth` interface has no method
that returns the credential. The agent can *use* the service but cannot
extract the token to forward it elsewhere or use it on a different
endpoint. This is the canonical ocap pattern: authority to use, not
authority to delegate outside the capability graph.

**Path restrictions.** `OAuthControl.setAllowedPaths(['/gmail/v1/users/me/messages*'])` limits the agent to specific API endpoints. An agent with Gmail read access cannot call the Calendar API on the same Google domain.

**Read-only mode.** `setReadOnly(true)` restricts to GET and HEAD
methods. The agent can read emails but not send them, read calendar
events but not create them.

**Caretaker revocation.** Revoking the capability invalidates the exo
and optionally revokes the OAuth token with the provider.

## Use Cases

- Gmail: read emails, draft responses, label messages
- Google Calendar: read events, create events
- Notion: read/write pages and databases
- Todoist: read/create tasks
- Any OAuth2-compatible API

## Depends On

- [endoclaw-network-fetch](endoclaw-network-fetch.md) — underlying HTTP
  capability for making requests
- OAuth2 client library for token management (or minimal implementation)
- Daemon formula store for durable token persistence
