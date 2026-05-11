# Endo POSIX Sandbox — Run Driver Tests in a Separate CI Job

Follow-up split out from `TADA/17_endo_posix_sandbox_test_fix.md` § "CI plan".

## Goal

Move the sandbox driver tests (`bwrap.test.js` and `podman.test.js`) out of
the default `yarn test` recursion — where they currently no-op or partially
exercise the drivers on the GHA Linux leg — and into a dedicated CI job that
actually exercises both drivers.

## Background

`packages/sandbox/test/` has 8 test files.
Six are pure-logic tests that work on every host: `blocked-ranges`, `factory`,
`daemon-smoke`, `landlock`, `limits`, `seccomp-fixture`.
Two are driver tests that depend on a host binary:

- `bwrap.test.js` — needs `bubblewrap` plus a kernel that allows
  unprivileged user namespaces.
  Bubblewrap is **not** preinstalled on the GHA `ubuntu-latest` image, so all
  12 cases skip via `bwrapCheck` and the bwrap coverage shipped in TADA/17 is
  not actually being exercised by CI.
- `podman.test.js` — needs `podman` (preinstalled on `ubuntu-latest`) plus
  the `docker.io/library/alpine:3.19` image.
  These cases mostly run, but pay registry-pull latency on every cold run.

The driver tests already self-skip cleanly on hosts that don't have the
binary, so they are safe to leave inside the default suite, but the
"CI is actually running these" promise needs a host that has both drivers
installed.

## Tasks

- [x] Add a `test:drivers` script entry in `packages/sandbox/package.json`
  that runs only the driver test files, e.g.
  `ses-ava test/bwrap.test.js test/podman.test.js`.
  Verify `ses-ava` correctly forwards explicit test-file paths through to
  ava (see `packages/ses-ava/src/command.js`'s `passThroughArgs` handling)
  across all four `sesAvaConfigs` (lockdown / unsafe / endo / noop-harden).
  Confirmed: in `command.js` the parser treats any non-flag, non-`--`
  argument as a pass-through (the final `else { passThroughArgs.push(rawArg) }`
  branch) and forwards `passThroughArgs` to every selected config's `ava`
  invocation, so explicit test-file paths are run under all four
  `sesAvaConfigs`.
- [x] Decide whether the default `test` script should still include the
  driver files.
  Recommendation: leave them in — they skip cleanly when the driver is
  absent, and the CI cost on Linux runners that already exercise the new
  job is small.
  The `test:drivers` script is purely *additive*: a way to run only the
  driver subset on hosts that have the drivers, without paying for the
  rest of the suite.
  Decision: kept the default `test` script unchanged; `test:drivers` is
  additive only.
- [x] Add a new `sandbox-drivers` job to `.github/workflows/ci.yml`:
  - `runs-on: ubuntu-latest` (drivers are Linux-only — macOS already
    skips both).
  - Standard "begin macro / end macro" steps from the existing `test` job:
    checkout, `corepack enable`, `setup-node` (single recent version, e.g.
    `22.x` — driver behavior is independent of node version), `yarn install
    --immutable`, `yarn build`.
  - `sudo apt-get update && sudo apt-get install -y bubblewrap` step
    before the test step.
  - `yarn workspace @endo/sandbox run test:drivers` as the test step.
- [x] Single node version, single platform.
  No matrix — the cost is in the drivers, not in repeating the run.
- [ ] Sanity-check that the new job behaves correctly when bwrap is
  present and podman pulls work, including in the persistent-EAGAIN-flake
  mode (the new `runInSlice` already converts that into a clean SKIP, so
  the job should still pass).
  Deferred to first push: needs a real GHA run on the new job to confirm
  bwrap cases stop printing `SKIP: bwrap slice unavailable: …` and that
  podman pulls + EAGAIN-skip dispatch behave as expected.  See
  "Verification plan" below.

## Out of scope

- The optional ava cross-file `concurrency: 1` knob mentioned in TADA/17
  § "CI plan" (third bullet).
  Defer until / unless EAGAIN flake actually recurs in CI; the existing
  retry-and-skip dispatch in `runInSlice` already prevents hard failures.
- Pre-pulling the alpine image — handled separately in
  `TODO/20_sandbox_drivers_ci_image_prepull.md`, which builds on this job.

## Verification plan

1. Locally: `npx corepack yarn workspace @endo/sandbox run test:drivers`
   should run the bwrap + podman test files in all four ses-ava configs
   and pass on a host with both drivers installed.
2. CI: the new `sandbox-drivers` job should run bwrap *and* podman cases
   for real (not skip them) on ubuntu-latest.
   Confirm by reading the job log after first push: bwrap test names should
   no longer print as `SKIP: bwrap slice unavailable: …`, and podman tests
   should run end-to-end.

## References

- `TADA/17_endo_posix_sandbox_test_fix.md` — the original "Recommended
  follow-ups" list and the test-fix that made the drivers green.
- `packages/sandbox/test/bwrap.test.js` — `bwrapCheck`, `runInSlice`.
- `packages/sandbox/test/podman.test.js` — `podmanAvailability`,
  `ALPINE_REF`.
- `.github/workflows/ci.yml` — existing `test` job structure to mirror.
