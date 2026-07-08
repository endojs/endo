# HTTP Confinement Core

| | |
|---|---|
| **Created** | 2026-07-08 |
| **Updated** | 2026-07-08 |
| **Author** | Codex |
| **Status** | Proposed |
| **Used by** | [endoclaw-network-fetch](endoclaw-network-fetch.md), [cli-http-client](cli-http-client.md) |

## Summary

`@endo/http-confine` is the low-level enforcement core for confined HTTP
capabilities. It contains only pure confinement primitives and an aggregate
pipeline. It does not define remotables, exos, CapTP surfaces, daemon storage,
or trust-on-first-bind policy. Hosts inject every external effect: `fetch`,
`now`, and request cancellation.

The package sits below both `@endo/exo-http-client` and the daemon HTTP client
track so both can share one implementation of origin, method, header, rate,
redirect, timeout, revocation, and response byte-cap enforcement.

## Export Surface

### Pure primitives

- `parseAllowedOrigins(entries: string[]): Set<string>`
  normalizes each entry through `new URL(entry).origin`.
  Malformed URLs and non-HTTP(S) schemes throw at configuration time.
- `checkOriginAllowed(url: string, origins: Set<string>): void`
  parses `url` and requires an exact, name-based origin match.
  It throws `OriginNotAllowedError`.
- `normalizeMethod(method?: string, opts?: { allowedMethods: Set<string> }): string`
  uppercases the method and validates it against a closed set.
  The primitive default is `GET` and `HEAD`; higher-level packages may pass a
  broader closed set.
- `assertHeadersSafe(headers?: Record<string, string>): void`
  rejects CR/LF request splitting, invalid field names, and forbidden request
  header names.
- `makeRateLimiter(opts: { maxPerMinute: number, now: () => number })`
  returns `{ take(): void, remaining(): number }`.
  It never reads an ambient clock. `take()` throws `RateLimitError`.
- `limitResponseBytes(source, opts: { maxBytes: number })`
  reads a stream only up to the configured cap, cancels upstream, and exposes
  `truncated(): boolean`.
  Truncation is enforced at read time so a lying `Content-Length` cannot bypass
  the cap.
  Exact-fill semantics are intentionally conservative: if a chunk reaches
  `maxBytes` exactly, `truncated()` is `true` and the upstream stream is
  cancelled because no extra byte may be read to prove end-of-stream.
- `resolveRedirect(response, origins: Set<string>): 'follow' | 'reject'`
  pairs with `redirect: 'manual'`.
  Redirects are followed only when their `Location` resolves to an allowlisted
  HTTP(S) origin.
- `makeRequestSignal(opts: { timeoutMs: number, cancellation?: Promise<never> })`
  returns `{ signal: AbortSignal, dispose(): void }`.

### Aggregate pipeline

`makeHttpConfinement(policy, seams: { fetch: FetchLike, now: () => number })`
returns:

```ts
{
  request,
  allowedOrigins,
  setAllowedOrigins,
  addAllowedOrigin,
  removeAllowedOrigin,
  setMaxRequestsPerMinute,
  setMaxResponseBytes,
  setTimeoutMs,
  revoke,
}
```

`request()` runs the implementation order:

1. rate `take()`
2. method and header normalization
3. origin allowlist check
4. `fetch` with `redirect: 'manual'`
5. manual redirect resolution
6. response byte cap

The aggregate returns a buffered, bounded response record for higher-level
packages to wrap in their own surface.

## Origin Authority Ownership

The aggregate supports two allowlist ownership modes.

In owned-array mode, `policy.allowedOrigins` is a `string[]`.
`makeHttpConfinement` normalizes the entries into an internal set and owns that
copy for the lifetime of the object.
The allowlist mutators `setAllowedOrigins`, `addAllowedOrigin`, and
`removeAllowedOrigin` update the internal set.

In injected-authority mode, `policy.allowedOrigins` is a `() => string[]`.
The caller owns the policy authority.
The aggregate resolves the thunk through `parseAllowedOrigins` at every
consultation point: the request-time origin check and the redirect-time
decision.
`allowedOrigins()` and `inspect()` report the current resolved set, and the
allowlist mutators throw because the confinement is not the owner.

Consumers must choose one shape.
They must not keep a separate authority, copy it into the confinement, and
resynchronize that copy before requests.
If a consumer has live policy state, it injects that state as the thunk so
origin and redirect checks observe the same current authority without a sync
step.

## Rate Accounting

The aggregate owns rate accounting.
`rateLimiter.take()` fires inside `request()` before method validation, header
validation, origin validation, fetch, redirect handling, and response byte-cap
enforcement.
Callers must not run another limiter in front of the aggregate requester.

## Errors and Types

Typed errors:

- `OriginNotAllowedError`
- `MethodNotAllowedError`
- `HeaderRejectedError`
- `RateLimitError`
- `RevokedError`

Types:

- `FetchLike`
- `HttpConfinementPolicy`
- `ConfinedRequest`
- `ConfinedResponse`

## Consumers

`@endo/exo-http-client` realizes the EndoClaw network-fetch capability by
layering exo facets and trust-on-first-bind policy over `@endo/http-confine`.
The TOFU adapter stays above the core because it is policy storage and decision
machinery, not transport confinement.

The daemon / `endo http` work described by
[cli-http-client](cli-http-client.md) should adopt the same core when that
track is next worked. This keeps the daemon and exo client from carrying
parallel copies of the same confinement logic.
