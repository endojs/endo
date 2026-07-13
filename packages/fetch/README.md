# @endo/fetch

An unconfined Endo plugin that provisions **confined outbound HTTP**. A fetch
service hands a guest a bounded `HttpClient` — origin allowlist, request-rate and
response-byte caps, manual redirect resolution, and trust-on-first-bind pins —
and retains the `HttpClientControl` for the integration. It is the provisioning,
persistence, and restart-revival half of the M3 "confined outbound HTTP"
capability; the capability itself is
[`@endo/exo-http-client`](../exo-http-client) over
[`@endo/http-confine`](../http-confine) and is untouched here.

It follows the [`@endo/reminder`](../reminder) unconfined-plugin pattern
([design](../../designs/endo-fetch.md)): the plugin is unconfined because
something must hold the real `fetch` power; the capability it mints is confined.

## What it is

- **An unconfined plugin, not a daemon formula.** The module exports the standard
  unconfined-caplet maker `make(powers, context, { env })`, provisioned through
  the daemon's generic `makeUnconfined` pathway. There is no new formula type.
- **Persistence is a virtual-file-system capability, backing-agnostic.** The
  plugin depends only on the reconciled writable-tree verbs of
  [`@endo/platform/fs/extended`](../platform) (`lookup`, `write`, `move`), so the
  backing may be a host directory, an in-memory tree, a daemon mount, or a
  database — a backend swap, not a plugin change. There is no `node:fs` and no
  daemon `filePowers`.
- **The confined capability is `@endo/exo-http-client`'s.** The plugin composes
  `makeHttpClientAndControl`; it re-implements neither the client nor the
  confinement core. The only capability-package change it needs is a persistence
  seam (`initialBindings` + `onPolicyChange`), so request-time trust-on-first-bind
  pins survive restart.

## Provisioning

`make` resolves everything it needs by name through the agent-shaped `powers`
granted at provisioning; it holds no ambient authority beyond the Node worker it
runs in.

- `E(powers).lookup('fetch-store')` → a writable virtual-file-system
  **directory** backing the durable store.
- `E(powers).lookup('fetch-policy-authority')` (**optional**) → the referral
  target for trust-on-first-bind decisions (`tofu-prompt` / `tofu-attenuator`
  modes). When the lookup fails, the plugin runs without one: those modes are
  unavailable and unknown origins fail closed (strict behavior). It is resolved
  once at `make()`.

Initial `allowedOrigins` (comma-separated), `maxRequestsPerMinute`,
`maxResponseBytes`, and `policyMode` arrive via the `env` option of
`makeUnconfined`; thereafter `HttpClientControl` adjusts them and the durable
store persists them, so the **store — not `env` — is authoritative** across
restarts.

```
E(host).makeUnconfined(workerName, '@endo/fetch', {
  powersName,                     // a guest granting fetch-store (+ optional fetch-policy-authority)
  resultName: ['@pins', 'fetch'], // pin it so it wakes on restart (see below)
})
```

## The `@pins` recipe (wake-on-restart)

A plugin caplet wakes on daemon restart **if and only if something retains its
identifier in a reviving collection.** The daemon eagerly revives exactly one
collection at boot — the `@pins` directory (`revivePins()`) — and everything else
revives lazily on demand. So retention is integration-owned and, for now,
user-driven:

1. **Pin the fetch service** when you provision it: pass
   `resultName: ['@pins', 'fetch']` to `makeUnconfined` (or `storeIdentifier` the
   result into `@pins` afterward).
2. On the next boot, `revivePins()` provides the identifier, the worker
   incarnates the plugin, and `make()` reconstitutes the pair from
   `config.json` + `bindings.json` with **identical policy and pins** — the
   allowlist, the byte/rate/mode limits, the trust-on-first-bind bindings, and
   the revoked flag.
3. **Unpinning decommissions.** Remove the pin and the service does not wake next
   boot; its durable store remains until you delete it. A revoked service revives
   revoked.

The Familiar app and the online Gateway are candidate future owners of this
retention; daemon core gains no fetch-specific revival logic either way.

## Facets

`make()` returns a `FetchService` exo that hands out the two facets, mirroring
`ReminderService`:

- **`HttpClient`** (guest-facing), via `E(service).client()` — the only thing a
  confined agent ever holds:
  - `fetch(url, options?)` → a bounded `HttpResponse`
  - `allowedOrigins()`, `help()`
- **`HttpClientControl`** (integration-facing), via `E(service).control()` —
  retained by whoever provisioned the service:
  - `inspect()`, the allowlist mutators, `setMaxRequestsPerMinute` /
    `setMaxResponseBytes`, `setPolicyMode`, `revoke` / `isRevoked`, the
    trust-on-first-bind surface `listBindings` / `revokeBinding` / `unpin`, and
    `listAuditEntries`.

A guest granted `client()` can reach only allowlisted or pinned origins, under
rate and byte caps, and never sees the plugin, the store, or ambient `fetch`.

## The store

The store is a writable directory on the platform virtual file system:

```
fetch-store/
  config.json    # { allowedOrigins, maxRequestsPerMinute, maxResponseBytes,
                 #   policyMode, revoked }
  bindings.json  # the trust-on-first-bind binding table
```

Writes are write-then-`move` within the store directory, serialized so
overlapping operations cannot interleave partial documents; atomic
within-directory `move` is **required of the backing** as a store contract. Not
persisted, by design: the sliding rate-limit window (resets on restart, at worst
briefly generous) and the `listAuditEntries` ring buffer (bounded in-memory
observability, not a durable log).

## The agent-tool binding

The `makeHttpTool` half of
[daemon-agent-tools](../../designs/daemon-agent-tools.md) Phase 3.6 binds
whatever `HttpClient` a guest was granted (a `ToolRecord` plus wire schema,
mirroring `makeGitTool` / `makeShellTool`); bounds come entirely from the
capability, and the network tool group is absent from the catalog unless the
agent holds the `HttpClient`. This plugin provisions that client; only the
superseded daemon-formula provisioning half of that phase is replaced.

## Bugs

See https://github.com/endojs/endo/issues.
