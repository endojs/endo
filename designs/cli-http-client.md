# CLI HTTP Client: Controller + Client Pair under `endo http`

| | |
|---|---|
| **Created** | 2026-05-09 |
| **Updated** | 2026-05-10 |
| **Author** | Kris Kowal (prompted) |
| **Status** | Proposed |
| **Source** | PR #144 review id 4256844646 (`CHANGES_REQUESTED`) |
| **Supersedes (in part)** | [endoclaw-network-fetch](endoclaw-network-fetch.md) |

## What is the Problem Being Solved?

Self-hosted Endo agents need a way to make outbound HTTP requests
against a host-curated origin allowlist, with rate, size, and timing
guards strong enough to keep an unattended agent from being turned into
a denial-of-service amplifier or an SSRF stepping-stone.

PR #144 attempted this as a single `HttpClient` formula with a paired
control facet returned at construction.
The reviewer (kriskowal) rejected the surface: a single capability
conflates the policy-bearing authority (which the host retains) with
the use-the-policy authority (which is what gets handed to a guest),
and the CLI surface (`endo http-client --name <petname> --origins
<urls>`) leaves no room to revise policy after the client is created
without re-creating it.

This design replaces that shape with a controller + client pair,
exposed through a single `endo http` subcommand tree.
Construction (`endo http mk`) yields the pair under one or two related
names; subsequent `endo http <verb>` commands operate on the named
controller to mutate the client's policy or revoke it.

## Scope

In scope:

- The CLI subcommand tree (`endo http mk`, `endo http allow`, `endo
  http deny`, `endo http revoke`, `endo http inspect`, etc.).
- The controller / client cap split, including which methods sit on
  which facet.
- Origin allowlist semantics carried over from PR #144: structural
  parse + `URL.origin` match, scheme restricted to `http:` / `https:`.
- Per-request timeout, sliding-window rate limit, and streaming
  byte-cap defenses, also carried over from PR #144.
- Comparison to the single-formula shape from PR #144 and rationale
  for the split.
- Cross-link to the trust-on-first-bind addendum (see
  [Trust model](#trust-model)).

Out of scope (separate dispatches in flight or to follow):

- Identifier names for the formula type, the controller exo, the
  client exo, the formula-id field, the CLI subcommand verbs, and the
  CLI option flags.
  These are deferred to a namer dispatch already in flight against PR
  #144.
  Identifiers used in this document are placeholders; final names land
  in a follow-up edit once the namer's recommendation is in.
- The trust-on-first-bind policy mode that would let the client learn
  the upstream host's TLS pin or redirect target on first contact.
  A separate designer dispatch is in flight; this document
  forward-links the addendum once its PR opens.
- The shared origin-allowlist parsing helper between this design and
  PR #106 (browser exo).
  PR #144 already noted this as future consolidation work; nothing
  here changes it.

## Design

### Cap surface: controller and client

The host's `make` call returns a kit of two facets:

- **The controller cap.**
  Holds the policy-attenuated authority: the allowlist set, the rate
  limit, the byte cap, the per-request timeout, and the live-or-revoked
  bit.
  The controller is what the host retains; it has no `fetch` method.
  Mutating methods on the controller change the policy that the
  paired client enforces on every subsequent call.
  Revoking the controller flips every method on the paired client to a
  clean rejection.
- **The client cap.**
  Holds only the use-the-policy authority: a `fetch(url, options)`
  method and a small inspection method (`getAllowedOrigins()` or the
  equivalent named primitive).
  The client is what the host hands to a guest agent.
  The client cannot adjust its own policy.
  The client cannot construct or unwrap the controller from itself.

The two facets share private state (the policy struct, the rate
window, the revoked flag) but expose disjoint method sets.
A guest in possession of the client cannot widen the allowlist; a host
in possession of the controller can mutate or revoke without the
guest's cooperation.

### `endo http` subcommand tree

The user-facing CLI is a single `http` subcommand tree, with the
make-the-pair operation as one verb among siblings:

```text
endo http mk        <name>  <origins...>      [policy options]
endo http allow     <name>  <origin>
endo http deny      <name>  <origin>
endo http set-rate  <name>  <max-per-minute>
endo http set-bytes <name>  <max-bytes>
endo http set-time  <name>  <timeout-ms>
endo http revoke    <name>
endo http inspect   <name>
```

(Verb names above are placeholder; final names land via the namer
dispatch.)

`endo http mk` produces the controller / client pair under a single
user-facing name, or under two paired names if the namer recommends
that shape (e.g., `<name>` for the controller and `<name>.client` or
`<name>-client` for the client).
The remaining verbs all take the controller's pet name and operate on
it; the client's name is needed only when granting it to a guest
agent or piping it into another tool.

This shape gives the host a stable handle to the policy capability
that survives across CLI invocations.
Compared to PR #144's `endo http-client --name <petname> --origins
<urls>` (one-shot create, no follow-up), the host can:

- Tighten or loosen the allowlist after the fact, in response to the
  guest's actual usage.
- Revoke the client without the daemon needing to re-derive its
  formula identifier from the original origin list.
- Inspect the live policy (current allowlist, current rate-limit
  window state) without round-tripping through the client's surface.

### Method placement

| Method | Facet | Notes |
|---|---|---|
| `request(req, cancellation)` | client | The use-the-policy authority. |
| `allowedOrigins()` | client | Inspection of own bounds. |
| `help()` | both | Each describes its own surface. |
| `inspect()` | controller | Read the current policy. |
| `setAllowedOrigins(origins)` | controller | Replaces the set. |
| `addAllowedOrigin(origin)` | controller | Convenience. |
| `removeAllowedOrigin(origin)` | controller | Convenience. |
| `setMaxRequestsPerMinute(n)` | controller | |
| `setMaxResponseBytes(n)` | controller | |
| `setTimeoutMs(n)` | controller | |
| `revoke()` | controller | Idempotent; flips the shared bit. |

(Method names above are placeholder; final names land via the namer
dispatch.)
The concrete `M.interface(...)` declarations for both facets,
including the request and response shapes, the cancellation
parameter, and the kit-mint signature, are in the
[Exo interfaces](#exo-interfaces) section below.

The `add` / `remove` convenience methods on the controller are what
back the `endo http allow` / `endo http deny` CLI verbs; without them
the CLI would have to read the current set, mutate, and write back,
which races against any concurrent host-side mutation.

### Exo interfaces

The two facets are `makeExo`-built remotables.
Their `M.interface(...)` declarations sit alongside the other daemon
interfaces in `packages/daemon/src/interfaces.js`; the implementation
file lives at `packages/daemon/src/http-client.js` (per the kebab-case
convention for module specifiers).
Identifier names are placeholders pending the namer dispatch.

The shape adopts three local idioms documented in the
[Local idioms cited](#local-idioms-cited) section below: bodies are
modeled as `ReadableBlob`-like remotables (already exposed by
`packages/platform/src/fs/interfaces.js`), long-running calls take a
`cancellation: Promise<never>` argument (the existing convention used
by `waitForExitOrCancel`, `WorkerFacetForDaemon.evaluate`, the
gateway / network primitives, and the daemon `Context` type), and
the controller mints the kit from a single host call.

#### `HttpClientInterface` (the client facet)

```js
import { M } from '@endo/patterns';
import { ReadableBlobInterface } from '@endo/platform/fs/interfaces.js';

const RequestShape = M.splitRecord(
  // Required:
  { url: M.string() },
  // Optional:
  {
    method: M.string(),
    headers: M.recordOf(M.string(), M.string()),
    // The request body is a ReadableBlob remotable.
    // The client reads it once via streamBase64() (or text()/json()
    // if the implementation prefers a buffered path for small bodies).
    // Omit the field for verbs without a body (GET, HEAD).
    body: M.remotable('ReadableBlob'),
  },
);

const ResponseShape = M.splitRecord(
  {
    status: M.number(),
    statusText: M.string(),
    ok: M.boolean(),
    headers: M.recordOf(M.string(), M.string()),
    // The response body is itself a ReadableBlob remotable.
    // The caller pulls it on demand; the daemon enforces the
    // byte cap during the underlying read, so even an unread
    // body is bounded by the rate limiter slot's lifetime.
    body: M.remotable('ReadableBlob'),
    // True when the underlying read hit `maxResponseBytes` and
    // aborted the upstream stream.  The `body` ReadableBlob still
    // resolves; its content is the truncated prefix.
    truncated: M.boolean(),
    maxResponseBytes: M.number(),
  },
  {},
);

export const HttpClientInterface = M.interface('EndoHttpClient', {
  // The use-the-policy authority.  `cancellation` is a Promise<never>
  // that the caller rejects (or never resolves) to abort an in-flight
  // request; the daemon plumbs the rejection into the underlying
  // AbortController.  See "Cancellation and AbortController
  // equivalence" below.
  request: M.call(RequestShape, M.promise()).returns(M.promise()),
  // Inspection of own bounds.  Returns a frozen array of origin
  // strings.
  allowedOrigins: M.call().returns(M.arrayOf(M.string())),
  help: M.call().optional(M.string()).returns(M.string()),
});
harden(HttpClientInterface);
```

The `request` result is a `Promise<Response>` where `Response.body` is
a `ReadableBlob` remotable.
The caller chooses how to consume the body: `E(response.body).text()`
for the buffered-text shape PR #144 returned, `E(response.body).json()`
for the parsed shape, or
`E(response.body).streamBase64()` for the streaming shape.
The daemon's rate-limiter slot is held until the body remotable is
released (or the daemon's own deadline fires); the controller can
reclaim slots by issuing `revoke()` on its facet.

#### `HttpControllerInterface` (the controller facet)

```js
import { M } from '@endo/patterns';

const OriginShape = M.string();
const OriginsShape = M.arrayOf(OriginShape);
const PolicyShape = M.splitRecord(
  {
    allowedOrigins: OriginsShape,
    maxRequestsPerMinute: M.number(),
    maxResponseBytes: M.number(),
    timeoutMs: M.number(),
    revoked: M.boolean(),
  },
  {},
);

export const HttpControllerInterface = M.interface('EndoHttpController', {
  // Read the current policy as a frozen record.  Cheap; no
  // side-effects on the rate window.
  inspect: M.call().returns(PolicyShape),

  // Allowlist mutators.  Each rejects entries that do not parse
  // with `new URL(...)` or whose `.origin` uses a scheme outside
  // {http:, https:}; rejection is at configuration time so the
  // failure surfaces on the host's CLI invocation, not on a future
  // guest fetch.
  setAllowedOrigins: M.call(OriginsShape).returns(M.undefined()),
  addAllowedOrigin: M.call(OriginShape).returns(M.undefined()),
  removeAllowedOrigin: M.call(OriginShape).returns(M.undefined()),

  // Defense knobs.  Each is validated to a positive number.
  setMaxRequestsPerMinute: M.call(M.number()).returns(M.undefined()),
  setMaxResponseBytes: M.call(M.number()).returns(M.undefined()),
  setTimeoutMs: M.call(M.number()).returns(M.undefined()),

  // Idempotent.  Flips the shared revoked bit; every method on the
  // paired client (including in-flight `request` calls awaiting a
  // body) rejects with a structured "revoked" error.
  revoke: M.call().returns(M.undefined()),

  help: M.call().optional(M.string()).returns(M.string()),
});
harden(HttpControllerInterface);
```

#### Mint signature

The host's call that produces the pair lives on `EndoHost`; the
candidate signature is:

```js
makeHttpClient: M
  .call(NameShape, OriginsShape)
  .optional(PolicyShape)
  .returns(M.promise()),
```

Resolving to a kit (`{ controller, client }`) under whatever pet-name
shape the namer dispatch lands.

### Cancellation and AbortController equivalence

The `cancellation: Promise<never>` parameter on `request` is the
existing daemon convention (compare `waitForExitOrCancel(proc,
cancelled)` in `packages/platform/src/proc.js`,
`WorkerFacetForDaemon.evaluate(..., cancelled)` in
`packages/daemon/src/interfaces.js`,
`SocketPowers.servePort({ cancelled })` in
`packages/daemon/src/types.d.ts`, and the daemon `Context.cancelled`
field that propagates value-graph cancellation).
A platform-neutral caller never sees `AbortController`; it only
sees the promise.

At the platform boundary inside the http-client implementation, the
daemon constructs an `AbortController` per `request` call and
attaches the `cancellation` rejection to it:

```js
// Sketch (implementation lives in the builder PR, not this design):
const controller = new AbortController();
cancellation.catch(reason => controller.abort(reason));
const timeoutId = setTimeout(
  () => controller.abort(new Error('timeout')),
  currentTimeoutMs,
);
const response = await fetchFn(url, {
  method,
  headers,
  signal: controller.signal,
  redirect: 'manual',
  body: bodyBytes, // pulled from request.body via streamBase64()
});
```

The mapping is one-way: a platform-side `AbortSignal.aborted` from the
host's environment fires the controller, which terminates the request;
the platform-neutral interface exposes only the promise.
A guest can compose its own cancellation by passing
`Promise.reject(new Error('user-aborted'))` or by deriving the
promise from a parent context's `cancelled`.

The controller's `revoke()` is the host-side cancellation channel
(every in-flight request rejects); the per-request `cancellation`
promise is the caller-side cancellation channel (one specific
in-flight request rejects).
The two channels are independent on purpose: the host can revoke
without coordinating with the guest, and the guest can abort an
individual slow request without giving up the whole client.

### Local idioms cited

The interfaces above adopt the following established conventions
rather than inventing new shapes:

| Idiom | Cited example | Adopted in |
|---|---|---|
| `ReadableBlob` remotable for byte content | `packages/platform/src/fs/interfaces.js` `ReadableBlobInterface`, `packages/platform/src/fs-node/local-blob.js` `makeLocalBlob` | `RequestShape.body`, `ResponseShape.body` |
| `cancellation: Promise<never>` for in-flight cancellation | `packages/platform/src/proc.js` `waitForExitOrCancel`, `packages/daemon/src/interfaces.js` `WorkerFacetForDaemon.evaluate`, `packages/daemon/src/types.d.ts` `SocketPowers.servePort`, `Context.cancelled` | `HttpClientInterface.request` second argument |
| `makeExo(name, IFace, methods)` with `M.interface(...)` boundary check | every interface in `packages/daemon/src/interfaces.js` | `HttpClientInterface`, `HttpControllerInterface` |
| Async-iterator chunk shape (`AsyncIterator<Uint8Array>`) for streamed bytes | `packages/platform/src/fs/types.js` `ReadableStream` typedef, `packages/daemon/src/mount.js` `writeBytes` | The `streamBase64()` method on each body reads from the same iterator-of-`Uint8Array` shape, base64-encoded for CapTP transit |

### Forward compatibility with `exo-stream`

When `exo-stream` lands (the unfinished refactor that lifts the
ad-hoc async-iterator-of-`Uint8Array` shape into a first-class
remotable stream type), the body parameter and result type migrate
from `M.remotable('ReadableBlob')` to `M.remotable('ExoStream')` (or
the chosen name).
The change is non-breaking for callers that consume bodies through
`text()` / `json()` / `streamBase64()`: those methods are the same
on `ReadableBlob` and on the future `ExoStream` because `ReadableBlob`
is the explicit forward-compatible shim.
Callers that already treat the body as an opaque remotable do not
change at all.

The implementation surface inside the daemon does change: the
`fetchFn`-to-`ReadableBlob` adapter (the wrapper around the
underlying `Response.body` `ReadableStream`) becomes a thin
identity once the platform exposes a native `ReadableStream` to
`ExoStream` adapter.
That adapter is out of scope for this design; the design's
contribution is to choose the body shape so that the future lift is
a non-breaking refactor.

### Origin allowlist (carried over from PR #144)

Allowlist entries are parsed with `new URL(entry).origin` at construction
and on every `setAllowedOrigins` / `addAllowedOrigin` call.
Entries that do not parse, or that parse to a scheme other than
`http:` or `https:`, are rejected with a structured error at
configuration time, not at first `fetch`.

A request URL passes the allowlist iff `new URL(requestUrl).origin`
is `===` to a member of the set.
This is name-based: a hostname whose A record resolves to a private
or loopback address still passes if the hostname is allowlisted.
The trust-on-first-bind addendum (see [Trust model](#trust-model))
will offer an opt-in that pins the resolved IP at first contact and
refuses any later A-record drift.

### Defenses against malicious origins

PR #144's panel review surfaced three SSRF vectors.
The revised design retains PR #144's mitigations and clarifies which
facet owns each knob:

1. **Redirect-following.**
   `fetch` is invoked with `redirect: 'manual'` so a `302 Location`
   from an allowlisted origin to an unallowed one (instance-metadata,
   RFC1918) is never followed by the daemon.
   The client surfaces the `Location` to the caller; the caller may
   re-issue against the new URL, which goes through the allowlist
   again.
2. **Slow-loris.**
   Each `fetch` is wrapped in an `AbortController` with a wall-clock
   timeout (default 30 seconds; mutable via the controller's
   `setTimeoutMs`).
   The controller owns the knob; the client owns the per-call wiring.
3. **Response flooding.**
   The streaming reader from PR #144 is preserved unchanged: chunks
   are accumulated until the byte cap is reached, then the upstream
   stream is aborted and the truncated prefix is returned with a
   `truncated: true` flag.
   The cap survives a `Content-Length` lie because truncation runs at
   read time.

### Trust model

The host trusts the controller it minted; the guest trusts the client
the host hands it; nothing else is trusted by default.

The unresolved question of how to handle "this client may need to
talk to a peer whose certificate / origin we have not seen before,
and we want to learn it on first contact" is addressed in a separate
sibling design.
A `trust-on-first-bind` addendum is being authored in parallel; this
design forward-links to it from this section once the addendum's PR
opens.

> Forward link to addendum: pending PR for `designs/http-client-trust-on-first-bind.md` (slug placeholder pending the parallel designer dispatch).

The addendum will own the policy-mode question; this design's
allowlist remains the strict-by-default mode.

## Comparison: PR #144's single-formula shape vs the controller + client split

PR #144 shipped a single `formulateHttpClient` whose
`makeHttpClientKit` returned `{ client, control }` at construction
time, with the host retaining `control` and granting `client`.
Mechanically this is close to what this design proposes; the
difference is in how the kit is named, surfaced, and mutated:

| Concern | PR #144 shape | Revised shape |
|---|---|---|
| Names | One pet name (`name`) for the client; the control has no pet name and is held only by the host's transient closure. | Pet names for both facets; the controller is addressable across CLI invocations. |
| Policy revision | Re-create the client to change anything about it. | `endo http allow` / `endo http set-rate` etc. on the named controller. |
| Revocation | The host has to remember the in-process control reference. | `endo http revoke <name>` from anywhere with shell access. |
| CLI surface | `endo http-client` (single verb at top level). | `endo http <verb>` (subcommand tree, room to grow). |
| Cap discipline | Same: client has no policy methods, control has no `fetch`. | Same. |

The split is a strict generalization: anything PR #144 could express,
the revised shape can express by making one `mk` call and never
mutating.
The added cost is one extra pet name and a slightly larger CLI
surface; the added value is that the policy capability is a
first-class addressable thing, not a transient closure variable.

## Alternatives Considered

### Alt A: Keep PR #144's single-formula shape; add per-policy CLI commands that re-create the client in place.

Mutate-by-recreate: `endo http allow <name> <origin>` would read the
current client's allowlist, append, and rebuild the formula under the
same pet name.

Rejected: the rebuild would invalidate any guest reference to the old
client, which is the opposite of what the host typically wants when
adding to the allowlist (the existing guest should keep its grant
and gain the additional origin).
Also forces the rate-limit window and any in-flight requests to reset
on every policy edit.

### Alt B: Single facet with a method-level cap split (host calls policy methods, guest calls `fetch`, both share the object reference).

A single exo whose `fetch` is granted to the guest as an attenuated
forwarder, while the host retains the unattenuated reference for
policy edits.

Rejected: this is what `Far` + manual attenuation looks like in
practice; it sidesteps the makeExo / `M.interface` boundary check and
creates two interface contracts on one object that have to be kept
mutually consistent by hand.
The two-facet kit is the idiomatic Endo expression of this attenuation.

### Alt C: Three-way split (controller, client, inspector).

Add a third facet with read-only inspection methods that the host
can hand to a monitoring guest without granting policy-edit
authority.

Deferred: the inspection surface is small (`getAllowedOrigins`,
maybe a rate-limit window read).
For now it lives on the client; a later split into a separate
inspector cap is a non-breaking change because no method moves off
the client, only onto a new third facet.
The trust-on-first-bind addendum may surface a need for a
distinct audit facet, in which case the addendum can carve it.

## Test plan

The implementation builder's plan should cover:

- Controller methods land mutations that subsequent client calls
  observe (new allowlist, new rate, new byte cap, new timeout).
- Revoking the controller flips client methods to a structured
  rejection on the next call and on any in-flight call.
- The client cannot reach the controller through any method, including
  `help()` and the inspection method.
- All defenses from PR #144's test suite (origin allowlist enforcement,
  protocol rejection, sliding-window rate limit, streaming
  truncation, abort-on-cap, redirect-manual, timeout) port unchanged
  to the new shape.
- A `cancellation` promise rejected mid-request causes the in-flight
  `request` call to reject with the same error and frees the
  rate-limit slot.
  A `cancellation` promise that never resolves does not leak (the
  per-request timer still fires, and the daemon `Context.cancelled`
  for the formula propagates on tear-down).
- Request bodies pass through the `ReadableBlob` body field: a small
  `text()`-backed body, a streamed `streamBase64()`-backed body, and
  the omitted-body case (GET, HEAD).
  Response bodies are consumed through `text()`, `json()`, and
  `streamBase64()` paths, including the streaming path that observes
  `truncated: true`.
- CLI integration: `endo http mk` followed by `endo http allow`
  followed by a guest-side `fetch` to the new origin succeeds; the
  same `fetch` issued before the `allow` fails with the
  structured "not in allowlist" error.
- CLI integration: `endo http revoke` causes a subsequent guest
  `fetch` to fail with the structured "revoked" error.
- Re-running `endo http mk` against an existing controller name fails
  cleanly (not silently re-creating with new identity).

## Open questions

- **Single name or paired names for the kit?**
  `endo http mk myhttp https://api.example.com` could land both facets
  under one user-facing name (with the daemon synthesizing a
  `myhttp.client` for the client side), or could require the user to
  pass two names.
  The namer should choose; the builder enforces.

- **Should `endo http inspect` show the live rate-limit window state
  or only the policy?**
  Showing the window state turns the controller into a rate
  oracle that may itself be useful for a coordinating guest;
  hiding it keeps the controller stateless from the user's
  perspective.
  Default: show only policy; a `--window` flag reveals the state.

- **What is the host's recourse if `endo http mk` is invoked against
  an existing name?**
  Default: error.
  Option: `--force` re-creates with a new formula identity, breaking
  existing guest grants.
  This is the same question every other `mk`-style CLI verb has and
  should follow whatever convention the project settles on for the
  CLI verb taxonomy.

- **Should `request`'s `cancellation` parameter be required or
  optional?**
  The cited daemon precedents (`waitForExitOrCancel`, `evaluate`,
  `servePort`) all take `cancelled` as a required parameter; the
  caller passes a non-resolving promise to opt out.
  This document proposes the same: required.
  An optional variant would let a caller drop the second argument
  for fire-and-forget calls, at the cost of a special case in the
  client implementation.

- **Should the response `body` `ReadableBlob` carry a `sha256()`
  method (i.e., be a `SnapshotBlob` rather than a plain
  `ReadableBlob`)?**
  Useful for caching and audit; out of scope for the strict-by-default
  client and folded into the trust-on-first-bind addendum if it
  surfaces as a need there.

## Identifier conventions

**Identifiers TBD pending namer dispatch.**
A separate namer dispatch is in flight against PR #144; the recommended
names for the formula type, the two exos, the formula-id fields, the
CLI subcommand verbs, and the CLI option flags will land there.
This document is structured so that the names can be substituted in
without reshuffling sections; placeholders are used in code blocks and
tables and called out where they appear.

## Out of scope, future work

- Trust-on-first-bind policy mode: separate design (sibling, in
  flight).
- Shared origin-allowlist parser between this design and PR #106
  (browser exo): noted in PR #144's body as future consolidation
  work; remains future work.
- Per-request header injection by the controller (e.g., a host-set
  `User-Agent` or auth header): natural extension once the
  controller has a stable identity, but out of scope for this
  revision.
- Audit log of every `fetch` (URL, status, byte count) emitted by the
  controller as a notification stream: useful for monitoring guests
  but out of scope for this revision.

## Dependencies

| Design | Relationship |
|---|---|
| [endoclaw-network-fetch](endoclaw-network-fetch.md) | Parent; this design replaces its CLI surface and cap-split section. |
| [daemon-agent-tools](daemon-agent-tools.md) | Sibling agent-capability design; the http client is one such tool. |
| `designs/http-client-trust-on-first-bind.md` (forthcoming) | Sibling; owns the trust-mode question deferred from this design. |

## Prompt

Inline review comment on
[`packages/cli/src/endo.js:568`](https://github.com/endojs/endo-but-for-bots/pull/144#discussion_r3212481648):

> Another approach would be to have an `http` subcommand, with a `mk`
> command therein that produces a controller and client pair.
> Then, the user can use other subcommands to adjust the client's
> policy, through the named controller.

Reinforced by review id 4256844646
([CHANGES_REQUESTED](https://github.com/endojs/endo-but-for-bots/pull/144#pullrequestreview-4256844646)):

> Let's take this back to design based on my comments here.
> Please open a PR that revises the design.
