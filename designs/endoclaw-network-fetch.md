# EndoClaw: Network Fetch Capability

| | |
|---|---|
| **Created** | 2026-03-03 |
| **Updated** | 2026-07-08 |
| **Author** | Kris Kowal (prompted) |
| **Status** | In Progress |
| **Parent** | [endoclaw](endoclaw.md) |

## Status

The `HttpClient` / `HttpClientControl` capability shape specified here is
realized, but the daemon-side provisioning wiring that hands the capability to
agents is not yet built, so this design is In Progress.

PR #566 landed two packages on `llm`:

- [`@endo/http-confine`](http-confine.md) — the pure confinement core, enforcing
  origin, method, rate, redirect, timeout, and byte-cap limits with no exo or
  daemon dependency.
- `@endo/exo-http-client` — the `HttpClient` / `HttpClientControl` exo facets
  over that core (`makeHttpClientAndControl`), plus
  `makeTrustOnFirstBindPolicyAdapter`, the TOFU policy adapter described in
  [`trust-on-first-bind`](trust-on-first-bind.md).

What remains: the daemon `provideHttpClient` provisioning and the
`makeHttpTool` agent-tool binding that expose the capability to agents.
That wiring is tracked as the Network (HTTP) tier (Phase 3.6) in
[`daemon-agent-tools`](daemon-agent-tools.md).

The single-`HttpClient`-formula provisioning shape sketched below is superseded
in part by the controller-plus-client split decided in
[`cli-http-client`](cli-http-client.md); the capability facets themselves are
unchanged.

## Summary

An `HttpClient` capability lets an agent make HTTP requests to a
host-controlled allowlist of origins. Prevents data exfiltration to
attacker-controlled servers while enabling web research and API access.
Foundation for the OAuth capability and productivity integrations.

This capability is realized by `@endo/exo-http-client`, which layers exo facets
and optional trust-on-first-bind policy over the shared
[`@endo/http-confine`](http-confine.md) confinement core.

## Capability Shape

```ts
interface HttpClient {
  fetch(url: string, options?: FetchOptions): Promise<Response>;
  allowedOrigins(): string[];
  help(): string;
}

interface HttpClientControl {
  setAllowedOrigins(origins: string[]): void;
  setMaxRequestsPerMinute(n: number): void;
  setMaxResponseBytes(n: number): void;
  revoke(): void;
  help(): string;
}
```

## How It Works

1. Host creates an `HttpClient` / `HttpClientControl` pair with an
   origin allowlist (e.g., `['https://api.github.com', 'https://httpbin.org']`).
2. Agent calls `E(http).fetch('https://api.github.com/repos/endojs/endo')`.
3. The `HttpClient` exo parses the URL, checks the origin against the
   allowlist, enforces rate limits, makes the request, and returns the
   response (truncated to max response size).
4. Requests to disallowed origins throw immediately.

## Endo Idiom

**Origin allowlist is structural.** The agent cannot construct a URL
that reaches an origin not in the allowlist. There is no wildcard or
bypass — the exo parses the URL and checks the origin before making any
network call.

**Rate limiting and size limits.** The control facet sets per-minute
request caps and maximum response sizes. This prevents an agent from
using network access for denial-of-service or downloading large files.

**No ambient DNS or socket access.** The agent has no `net.connect` or
`dns.resolve` — only the `fetch` method on its granted `HttpClient`.
Protocols other than HTTP/HTTPS are not supported.

**Composable with OAuth.** The OAuth capability
([endoclaw-oauth](endoclaw-oauth.md)) wraps an `HttpClient` with token
injection and path restrictions, adding authentication as a layer on
top of network confinement.

## Depends On

- Node.js `fetch` (available in Node 22+) or `undici` for HTTP
- No other Endo designs required; standalone capability
