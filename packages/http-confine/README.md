# `@endo/http-confine`

Pure HTTP confinement primitives for packages that need fetch-like network
access without depending on remotables, exos, CapTP, or daemon state.

The package validates HTTP(S) origins, methods, and headers, enforces an
injected-clock rate limit, performs manual-redirect checks, creates request
abort signals, and reads response streams only up to a configured byte cap.
All external effects are injected through `fetch`, `now`, and cancellation.

`limitResponseBytes()` truncates at read time. If a chunk exactly fills
`maxBytes`, the returned `truncated()` flag is `true` and the upstream reader is
cancelled, because the reader reached the configured cap and no further bytes
are permitted.

`makeHttpConfinement(policy, { fetch, now })` composes the primitive checks in
the implementation request order:

1. rate slot
2. method and header validation
3. origin allowlist check
4. `fetch(url, { redirect: 'manual', ... })`
5. manual redirect decision
6. response byte cap

The aggregate object also exposes control methods for mutating the allowlist and
limits, plus revocation.

Origin policy has exactly one owner.
If `policy.allowedOrigins` is an array, the confinement owns an internal
allowlist copy and the allowlist mutators update that copy.
If `policy.allowedOrigins` is a thunk, the caller owns the authority: the
confinement reparses the thunk result for request-time origin checks and
redirect decisions, `allowedOrigins()` and `inspect()` report the live resolved
set, and the allowlist mutators throw.
Do not keep a second copy and sync it into the confinement.

Rate accounting belongs inside `request()`.
Callers must not run their own limiter before calling the confined requester;
the aggregate consumes a rate slot before method, header, origin, fetch,
redirect, and byte-cap enforcement.
