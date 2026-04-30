# Endo POSIX Sandbox — Fix The Tests

- follow up on `TADA/17_endo_posix_sandbox_test_fix.md` ; the "Recommended follow-ups" near the end
  - yes, let's separate the sandbox tests out into a separate job, at least the
    parts that actually run drivers, which for now podman and bwrap
  - separate script entry thru `package.json` and separate item in github action workflow
  - do the pre-pull for podman
  - [x] create follow-up `TODO/` tasks for all of this, do not actually do the work in this session

## Resolution

The grooming half is done; the implementation lives in two new TODO files:

- `TODO/19_sandbox_drivers_ci_job.md` — split bwrap + podman driver tests
  into a `test:drivers` script in `packages/sandbox/package.json` and a
  new `sandbox-drivers` job in `.github/workflows/ci.yml` that
  `apt-get install`s bubblewrap before running the script.
- `TODO/20_sandbox_drivers_ci_image_prepull.md` — pre-pull
  `docker.io/library/alpine:3.19` in that new job before the test step
  runs, so podman cases don't pay registry-pull latency / flake.

The third "Recommended follow-up" in TADA/17 (lowering ava cross-file
`concurrency: 1` for the sandbox package) was intentionally **not** turned
into a TODO — defer it until / unless the EAGAIN flake recurs in CI.
The retry-and-skip dispatch in `runInSlice` already prevents a hard
failure if it does, so this is a "tune later if needed" lever.
