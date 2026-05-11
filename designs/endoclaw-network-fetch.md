# EndoClaw: Network Fetch Capability

| | |
|---|---|
| **Created** | 2026-03-03 |
| **Updated** | 2026-03-03 |
| **Author** | Kris Kowal (prompted) |
| **Status** | Not Started |
| **Parent** | [endoclaw](endoclaw.md) |

## Summary

An `HttpClient` capability lets an agent make HTTP requests to a
host-controlled allowlist of origins. Prevents data exfiltration to
attacker-controlled servers while enabling web research and API access.
Foundation for the OAuth capability and productivity integrations.

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
