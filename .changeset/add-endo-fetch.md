---
'@endo/fetch': minor
'@endo/exo-http-client': minor
---

Add `@endo/fetch`, an unconfined Endo plugin that provisions confined outbound
HTTP per `designs/endo-fetch.md`. A fetch service hands a guest a bounded
`HttpClient` (origin allowlist, request-rate and response-byte caps, manual
redirect resolution, trust-on-first-bind pins) and retains the
`HttpClientControl` for the integration — the provisioning, persistence, and
restart-revival half of the M3 "confined outbound HTTP" capability, repackaged as
an unconfined caplet (`make(powers, context, { env })`, provisioned via the
generic `make-unconfined` pathway) rather than a daemon formula. It composes the
merged `makeHttpClientAndControl` of `@endo/exo-http-client` and re-implements
neither the client nor the `@endo/http-confine` core.

Durable policy (`config.json`) and trust-on-first-bind pins (`bindings.json`)
live on the platform virtual file system (`@endo/platform/fs/extended`),
backing-agnostic (host directory, in-memory, daemon mount, or database) with
write-then-`move` atomic replacement — no `node:fs`, no daemon `filePowers`. The
store, not the `env` initials, is authoritative across restarts. Wake-on-restart
is integration-owned retention of a live reference via the `@pins` recipe
documented in the package README; a service reconstitutes with identical policy
and pins, and a revoked service revives revoked.

`@endo/exo-http-client`'s `makeHttpClientAndControl` and
`makeTrustOnFirstBindPolicyAdapter` gain two backward-compatible persistence
seams so a request-time pin can survive a restart: an `initialBindings` argument
that reconstitutes the trust-on-first-bind table, and an `onPolicyChange(snapshot)`
callback invoked synchronously after any durable policy or binding mutation with
the persistable snapshot. The package stays platform-pure — the callback is an
ordinary function and the virtual file system never enters it.
