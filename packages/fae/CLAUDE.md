# Fae Agent Development Guide

## Architecture

Fae is an AI agent manager (same pattern as lal) that runs as an unconfined guest caplet. It adds tool discovery on top of the base agent loop.

### Setup script (`setup.js`)

Same pattern as lal — see `packages/lal/CLAUDE.md` for shared conventions on `introducedNames`, `provideGuest` idempotency, and restart guards.

### Tool discovery (`initializeIntroducedTools`)

On startup, fae scans all names in its namespace looking for objects that implement the FaeTool interface (`schema()`, `execute()`, `help()`). It moves discovered tools into a `tools/` subdirectory.

When scanning, skip names that match the special name pattern (`/^[A-Z][A-Z0-9-]{0,127}$/`) — these are builtins (`AGENT`, `SELF`, `HOST`, `KEYPAIR`, `MAIL`) that don't implement FaeTool and probing them with `.schema()` generates noisy CapTP errors.

Note: `isSpecialName` from `@endo/daemon/src/pet-name.js` is not available via the daemon's `exports` map, so the pattern must be inlined.

## Common Pitfalls

See `packages/lal/CLAUDE.md` — fae shares the same guest provisioning model and the same pitfalls around `introducedNames`, handle vs guest, message types, and `Object.create(null)`.
