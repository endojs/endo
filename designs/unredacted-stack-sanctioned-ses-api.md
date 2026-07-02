# Sanctioned SES API for Unredacted Error Diagnostics

| | |
|---|---|
| **Created** | 2026-07-02 |
| **Updated** | 2026-07-02 |
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

### 2. Consume a sanctioned SES API, not the ses-ava symbol

Even at the worker throw site, the capture should call a **first-class, supported
SES export** for privileged unredacted rendering rather than the
`MAKE_CAUSAL_CONSOLE_…` symbol or `getStackString`. This design proposes that
`ses` grow (or bless) such an API — e.g. a start-compartment-only
`getErrorDiagnostic(err)` / public causal-console factory — and that both
`@endo/ses-ava` and this daemon consumer migrate onto it, retiring the shared
symbol hack.

That SES change is an **upstream endo issue to be filed** and is a **dependency
of the build**, not part of this fork's build.

### 3. Feature-test against the sanctioned API

The daemon keeps a narrow feature-test/fallback (to `err.stack`) but tests for
the *sanctioned* API, so the daemon no longer breaks when SES retires the ses-ava
symbol.

## The specific request for @erights

Whether the sanctioned-SES-API path above is the alternative you have in mind, or
whether unredacted capture should be structured differently — e.g. **never
leaving the worker at all** (the worker renders and stores; the daemon only ever
receives already-rendered text and never even feature-tests SES), which may be
cleaner if the daemon never needs to re-render.

## Open Questions

1. **SES API shape.** Exact signature of the sanctioned unredacted-diagnostic SES
   export — @erights to steer. This is the gating upstream dependency.
2. **Migration of `@endo/ses-ava`.** Whether `@endo/ses-ava` migrates onto the
   same sanctioned export in the same upstream change, so the shared symbol can be
   retired rather than merely paralleled.

## Relationship to CapTP error identification

This is a sibling cleanup to
[`captp-error-identification.md`](./captp-error-identification.md), split out per
the review so it can be reviewed on its own upstream-`ses`-dependent track. The
two share the error-diagnostics subsystem in `@endo/daemon` but are independent
changes: error *identification* (the side-channel id) does not depend on how
unredacted diagnostics are *rendered*, and vice versa.
