# Sanctioned SES API for Unredacted Error Diagnostics

| | |
|---|---|
| **Created** | 2026-07-02 |
| **Updated** | 2026-07-10 |
| **Author** | Kris Kowal (prompted) |
| **Status** | Draft — design only, no implementation |
| **Reviewer** | @erights (requested) |

> Split out of [`captp-error-identification.md`](./captp-error-identification.md)
> at kriskowal's request in review
> [4616479253](https://github.com/endojs/endo-but-for-bots/pull/595#pullrequestreview-4616479253)
> on #595: *"Let's post a separate design for this improvement and hand that to
> @erights for review."* This is that separate design. It is handed to @erights
> for review because the fix depends on an upstream `ses` API decision that is
> his to steer.
>
> Revised per kriskowal's review
> [4668891669](https://github.com/endojs/endo-but-for-bots/pull/595#pullrequestreview-4668891669)
> on #595 to reflect the API shape gaps: extract **structured** diagnostics
> rather than couple access to rendering, expose the several distinct
> unredaction methods a redacted error needs, and place the surface on the
> initial realm's `globalThis` — outside the SES permits.

## What is the Problem Being Solved?

`packages/daemon/src/unredacted-stack.js` renders unredacted error diagnostics
by tapping SES start-compartment internals that are not a supported public API:

- Line 53 taps `globalThis.getStackString`.
- The module also reaches
  `globalThis[Symbol.for('MAKE_CAUSAL_CONSOLE_FROM_LOGGER_KEY_FOR_SES_AVA')]` —
  the same undocumented SES start-compartment hooks `@endo/ses-ava` uses to
  surface unredacted causal traces.

Inline on `unredacted-stack.js:53`, kriskowal wrote, tagging @erights: *"This
should not be. We need an alternative."* The daemon should not depend on an
`@endo/ses-ava`-internal symbol and an undocumented global accessor to render
unredacted error diagnostics. Both are private contracts that can change without
notice, and neither is intended for third-party consumption.

This design proposes an alternative and names the upstream `ses` dependency it
requires. It is design-only; the build is a separate PR gated on the upstream
`ses` decision.

## Description of the Design

The final shape is @erights' call. The design intent below is the starting point
for that decision.

### 1. Capture at the throw site, not by reconstruction

The unredacted rendering is privileged information that belongs to the party that
*holds* the error — the worker where the error originated. Capture the unredacted
diagnostic **in the worker** at `marshalSaveError` time (in the trusted start
compartment, where the information is legitimately available) and ship the
**pre-rendered** text as the `TraceRecord` payload. The daemon aggregator then
stores rendered text and performs **no** SES-internal access of its own — the tap
disappears from the daemon entirely.

### 2. Extract structured diagnostics; do not couple rendering to access

Even at the worker throw site, the capture should call a **first-class, supported
SES export** for privileged unredacted diagnostics rather than the
`MAKE_CAUSAL_CONSOLE_…` symbol or `getStackString`. But the shape of that export
should **avoid coupling rendering to access**: extracting the privileged
diagnostics from a redacted error should produce a **structured result**, leaving
rendering to the consumer. Obtaining an unredacted stack **as a string** is a
reasonable convenience API as well — but it is a convenience layered over the
structured extraction, not the primary surface.

The reason to prefer structure is that a redacted error hides **several distinct
kinds** of diagnostic information, so we should expect to be compelled to provide
**more than one unredaction method**, not a single `getStackString`-shaped call.
The sanctioned surface should therefore expose (at least) these:

- **Get the original (unredacted) stack string** — the raw `err.stack` before
  redaction.
- **Get the annotations** — the `assert.note` annotations attached to the error.
- **Get the rendered causal stack as a string** — the fully rendered causal
  trace. This convenience does **not** obviate the value of a more opinionated
  renderer for a terminal or the web; such a renderer would consume the
  *structured* diagnostics above rather than this pre-rendered string.
- **Get the (serial or parallel) causes** — the error's causes. (These are not
  currently redacted, so this is completeness within the same diagnostic surface
  rather than an unredaction per se.)

Because there are several such methods, the **name** is no longer a single
`getErrorDiagnostic(err)` function but a **namespaced set of accessors**; the
exact names and grouping are @erights' to steer (see Open Questions). Both
`@endo/ses-ava` and this daemon consumer should migrate onto whatever surface is
blessed, retiring the shared symbol hack.

That SES change is an **upstream endo issue to be filed** and is a **dependency
of the build**, not part of this fork's build.

### 3. Placement: initial-realm `globalThis`, outside the permits

These diagnostic APIs should appear on the **initial realm's `globalThis`** (the
trusted start compartment) and should **not** appear in the SES **permits**.
Keeping them off the permits is deliberate: confined compartments never receive
them, so unredacted diagnostics remain a start-compartment privilege held only by
the trusted party that holds the error — access is not propagated by-construction
into guest code.

An **alternative worth considering** is to hang these methods off the **start
compartment's `Error`** object — which is *not* the `SharedError` that confined
compartments see. That path would entail **adding permits** for the new `Error`
members, a cost this design flags rather than resolves. It is still worth
considering precisely because we anticipate more than one unredaction method: a
durable, discoverable home for the set (whether a `globalThis` accessor object or
`Error` statics) may age better than a loose function. @erights to steer.

### 4. Feature-test against the sanctioned API

The daemon keeps a narrow feature-test/fallback (to `err.stack`) but tests for
the *sanctioned* API, so the daemon no longer breaks when SES retires the ses-ava
symbol.

## The specific request for @erights

Two things, on top of the general "is this the alternative you had in mind":

1. **The API shape and name.** The design now proposes a **namespaced set of
   structured-diagnostic accessors** on the initial realm's `globalThis`, outside
   the permits (§ Description, parts 2–3), rather than a single
   `getErrorDiagnostic`/`getStackString`-shaped call. The exact names, grouping,
   and whether the home is a `globalThis` accessor object or the start
   compartment's `Error` (with the permit cost that entails) are yours to steer.
2. **Where capture lives.** Whether unredacted capture should instead **never
   leave the worker at all** (the worker renders and stores; the daemon only ever
   receives already-rendered text and never even feature-tests SES), which may be
   cleaner if the daemon never needs to re-render — though it forecloses the
   daemon consuming *structured* diagnostics for its own rendering.

## Open Questions

1. **SES API shape and name.** Exact names and grouping of the sanctioned
   structured-diagnostic accessors (original stack string, annotations, rendered
   causal stack string, causes) — @erights to steer. This is the gating upstream
   dependency.
2. **`globalThis` vs. start-compartment `Error`.** Whether the surface lives on
   the initial realm's `globalThis` (no permit change) or on the start
   compartment's `Error` object (which entails adding permits). The design leans
   `globalThis`-outside-permits but flags the `Error`-object option as worth
   weighing.
3. **Migration of `@endo/ses-ava`.** Whether `@endo/ses-ava` migrates onto the
   same sanctioned surface in the same upstream change, so the shared symbol can be
   retired rather than merely paralleled.

## Relationship to CapTP error identification

This is a sibling cleanup to
[`captp-error-identification.md`](./captp-error-identification.md), split out per
the review so it can be reviewed on its own upstream-`ses`-dependent track. The
two share the error-diagnostics subsystem in `@endo/daemon` but are independent
changes: error *identification* (the side-channel id) does not depend on how
unredacted diagnostics are *rendered*, and vice versa.
