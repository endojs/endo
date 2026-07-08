# `@endo/exo-http-client`

An `HttpClient` exo with structural origin confinement, request rate and
response size limits, and an opt-in trust-on-first-bind policy adapter.

The host configures an origin allowlist and retains the `HttpClientControl`
facet. The guest receives only the `HttpClient` facet and can fetch only
URLs whose parsed origin is allowed or pinned by the selected TOFU policy.

## Usage

```js
import { makeHttpClientAndControl } from '@endo/exo-http-client';

const { client, control } = makeHttpClientAndControl({
  allowedOrigins: ['https://api.github.com'],
  maxRequestsPerMinute: 30,
  maxResponseBytes: 65536,
});

const response = await E(client).fetch('https://api.github.com/repos/endojs/endo');
const text = await E(response).text();

await E(control).setMaxRequestsPerMinute(10);
await E(control).revoke();
```

## Capability shape

```ts
interface HttpClient {
  fetch(url: string, options?: FetchOptions): Promise<HttpResponse>;
  allowedOrigins(): string[];
  help(): string;
}

interface HttpResponse {
  status(): number;
  statusText(): string;
  ok(): boolean;
  headers(): Record<string, string>;
  url(): string;
  truncated(): boolean;
  maxResponseBytes(): number;
  text(): Promise<string>;
  json(): Promise<unknown>;
  help(): string;
}

interface HttpClientControl {
  inspect(): HttpClientPolicy;
  setAllowedOrigins(origins: string[]): void;
  addAllowedOrigin(origin: string): void;
  removeAllowedOrigin(origin: string): void;
  setMaxRequestsPerMinute(n: number): void;
  setMaxResponseBytes(n: number): void;
  revoke(): void;
  isRevoked(): boolean;
  listBindings(): Binding[];
  revokeBinding(origin: string): void;
  unpin(origin: string): void;
  setPolicyMode(mode: PolicyMode): void;
  listAuditEntries(options?: { since?: number, limit?: number }): AuditEntry[];
  help(): string;
}
```

Allowed origins must be exact `http:` or `https:` origins such as
`https://api.example.com`, with no path, query, or fragment. Requests are
checked with `new URL(url).origin` before any fetch call is made.

Guest-supplied request fields are validated before they reach either the policy
authority or the transport. The `method` is normalized and must be one of the
standard HTTP verbs (`GET`, `HEAD`, `POST`, `PUT`, `DELETE`, `OPTIONS`,
`PATCH`); WHATWG-forbidden `CONNECT` and `TRACE` are rejected before rate
limiting, policy decisions, or transport work. An unrecognized method is
rejected rather than forwarded — this also keeps a guest from smuggling
free-form text into a human or LLM policy prompt. Header names must be RFC 7230
tokens and header values may not contain `CR`/`LF`, so a guest cannot inject
additional header lines. Only `method`, `headers`, and `body` are forwarded; the
client always sets `redirect: 'manual'` and never forwards other fetch options.

Request rate accounting is owned by the underlying HTTP confinement and runs
after any trust-on-first-bind decision. A denied origin, or a request still
waiting for a prompt decision, does not consume the rate budget. Prompt floods
are bounded by coalescing concurrent first requests for the same origin and by
the configured binding limit.

`HttpResponse.truncated()` reports whether the configured byte cap was reached.
For an exact-fill response, `truncated()` is therefore `true` even if no
additional byte was observed or dropped; the client cancels the upstream reader
as soon as the cap is full.

`removeAllowedOrigin(origin)` is intentionally conservative: it removes the
static allowlist entry and records a `Revoked` binding for that origin, so TOFU
modes will not immediately re-learn the same origin. Use `unpin(origin)` when
the intended operation is "forget this decision and ask again later".
