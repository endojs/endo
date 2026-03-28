# Endo OS ↔ QuickJS Coordination

Shared notes between the Endo OS agent (this repo) and the
QuickJS agent (../quickjs).

## Current State

### Endo OS side (this repo)

**What's working:**
- seL4 Microkit boots with QuickJS evaluating real JS
- Interactive Endo shell over serial UART (pet names, eval,
  compartments, capability objects)
- QuickJS version: 2024-01-13 (downloaded in Docker build)
- SES lockdown is a **stub** — not the real @endo/ses bundle
- `harden()` uses `Object.freeze` (shallow, not deep)
- `Compartment` uses raw `eval` (not isolated)
- `Object.freeze` + strict mode: QuickJS doesn't throw on
  assignment to frozen properties (silent fail), so the
  `harden()` verification test reports a false error

**What we need from QuickJS:**
1. **Real `Compartment` support** — isolated evaluation with
   controlled globals, no access to outer scope. This is the
   #1 blocker for real SES on seL4.
2. **Strict mode `Object.freeze` behavior** — assignment to
   frozen property should throw TypeError in strict mode
   (ES spec requires this).
3. **Proxy support** — needed for SES membrane/revocation.
   QuickJS already has Proxy but confirm it passes SES tests.
4. **Any missing ES features** that @endo/ses needs — the
   test suite will surface these.

**Build info:**
- QuickJS is compiled with: `-DEMSCRIPTEN -D_GNU_SOURCE
  -DNO_CONFIG_H -ffreestanding -nostdlib`
- Cross-compiled for AArch64 (aarch64-linux-gnu-gcc)
- Linked against our libc stubs (no real libc)
- Math functions are stubs (trig, log, etc. return 0) — fine
  for the shell, not for Math.* compliance

**Files of interest:**
- `sel4/build/Dockerfile` — builds QuickJS from source
- `sel4/Makefile` — compiles quickjs.c + our PD
- `sel4/src/libc_stubs.c` — minimal libc surface
- `src/js/ses-lockdown-quickjs.js` — SES stub to replace
- `src/js/bootstrap-sel4.js` — the Endo shell

### QuickJS side (../quickjs)

**Status:** (update this section when ready)
- Working on:
- Endo test suite status:
- Missing ES features found:
- Compartment support:
- Ready to pull: no

## How to coordinate

1. QuickJS agent: update the "QuickJS side" section above
   when you have progress to share.
2. Endo OS agent: update the "Endo OS side" section when
   requirements change.
3. When QuickJS is ready for integration, set "Ready to pull"
   to yes and note the commit hash or branch.
4. Endo OS agent will then update the Dockerfile to pull
   from ../quickjs instead of downloading upstream.

## Integration plan

When QuickJS has native Compartment + passes SES tests:

1. Replace `src/js/ses-lockdown-quickjs.js` stub with the
   real `@endo/ses` bundle
2. Update Dockerfile to `COPY` from `../quickjs` instead of
   downloading upstream tarball
3. Remove the `harden`/`Compartment`/`lockdown` stubs
4. The Endo shell should work unchanged — it already uses
   the standard `Compartment`/`harden` API
5. Test: `Object.freeze` strict throw, Proxy membranes,
   isolated compartment evaluation

## Open questions

- Should QuickJS Compartment match the SES Compartment API
  exactly, or is a subset enough for Phase 0?
- Do we need `lockdown()` to actually freeze intrinsics, or
  is Compartment isolation sufficient for the seL4 target?
  (seL4's PD isolation provides the outer boundary)
- What's the minimal @endo/ses bundle subset we should try
  to load first?
