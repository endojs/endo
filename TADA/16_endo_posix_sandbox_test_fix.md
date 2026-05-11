# Endo POSIX Sandbox — Fix The Tests

The sandbox bwrap tests have a few failures for me since git commit `c80786068`.

For some reason I see that they pass inside your workspace tho, so we've got
some unmanaged inconsistency between your workspace and mine.

Remember that we run the tests with this command:
```bash
npx corepack yarn workspace @endo/sandbox run test
```

Take a look at my failures, and see if you can fix or at least update the tests to provide better debugging output when they fail like this.

## Diagnosis

All seven failing tests share a single root cause that the existing test
output buries.
The smoking gun is in the only test that happens to assert on stderr —
`read-only mount rejects writes from inside the slice` — where the
captured stderr is:

```
bwrap: Creating new namespace failed: Resource temporarily unavailable
```

This is `EAGAIN` from `clone(CLONE_NEWUSER)`.
Bubblewrap is installed and `bwrap --version` works (so the probe and
`listBackends` tests pass), but the kernel refuses to let the calling
user create a new user namespace.
On Ubuntu 23.10+ that is most often the AppArmor restriction
controlled by `/proc/sys/kernel/apparmor_restrict_unprivileged_userns`
without an unconfined profile attached to the `bwrap` binary; it can
also come from running inside a nested rootless container, from
`kernel.unprivileged_userns_clone=0`, or from a hit on
`/proc/sys/user/max_user_namespaces`.
None of those are repo-managed state, which is why my workspace
(unrestricted host) is green and yours is red — the inconsistency lives
in the host kernel / LSM policy, not in the source tree.

Once the slice can't be created, every test that tries to spawn
something inside it shows the same surface symptom (`exit code 1` with
stderr silently discarded), so the operator can't tell that the
failures are all the same problem, much less what that problem is.

## What I changed

`packages/sandbox/test/bwrap.test.js`:

1. Added a `probeBwrapUserns` smoke test that runs once in the
   `test.serial.before` hook.
   It executes the same minimal `--unshare-all` invocation every slice
   uses (`bwrap … -- /bin/true`), captures stderr, and feeds the result
   into a new `bwrapAvailability.sliceAvailable` flag.
   When it fails, the captured stderr (e.g. the `Creating new namespace
   failed` line above) becomes the skip reason for every slice test —
   one clean SKIP per test instead of seven look-alike exit-code-1
   failures.
2. Split `bwrapAvailability` into `versionAvailable` (gates the probe /
   `listBackends` tests) and `sliceAvailable` (gates everything that
   actually spawns inside a slice), so a host that has bwrap but can't
   use it still exercises the probe paths.
3. Added a `runInSlice(handle, argv)` helper that always drains both
   stdout and stderr, returning `{ exit, stdout, stderr }` as strings.
   Every slice-spawning test now uses it.
4. Added a `failOnBwrapError(t, result, where)` helper that detects a
   `bwrap: …` line in stderr and fails the test with that message.
   This surfaces a mid-test bwrap-policy failure as the actual reason
   instead of "exit code 1".
5. Threaded a `formatCapture('stdout', …) formatCapture('stderr', …)`
   suffix into every assertion message in the slice tests, so any
   surviving failure quotes both streams in-line — no more
   `[object Object]` with no clue what the slice produced.

## Expected effect on your workspace

- All seven previous failures should turn into PASSes-via-skip with a
  reason like `bwrap slice unavailable: bwrap user-namespace smoke
  test exit 1: bwrap: Creating new namespace failed: Resource
  temporarily unavailable`.
- The probe / listBackends tests still run and pass (they only need
  `bwrap --version`).
- If you fix the host policy and the userns probe starts succeeding,
  any future failure will quote stdout + stderr in the assertion
  message, and any in-test bwrap failure will be surfaced as the
  bwrap stderr line rather than a bare exit code.

## Verification

`npx corepack yarn workspace @endo/sandbox run test` — 58 / 58 pass on
my workspace across all four ses-ava configs (`lockdown`, `unsafe`,
`endo`, `noop-harden`).
`yarn lint` clean in `packages/sandbox`.

## Test failure output from my workspace

```
[ses-ava] config: lockdown
  ⚠ Using configuration from /home/jcorbin/endo/ava-endo-lockdown.config.mjs

  ✔ blocked-ranges › private-egress.nft references every documented PRIVATE_BLOCKED_RANGES CIDR
  ✔ blocked-ranges › PRIVATE_BLOCKED_RANGES covers the four address-family classes
  ✔ blocked-ranges › HOST_LOOPBACK_ALLOWED_RANGES is restricted to loopback CIDRs
  ✔ blocked-ranges › HOST_LAN_ALLOWED_RANGES extends loopback with RFC 1918 / link-local
  ✔ limits › DEFAULT_LIMITS is hardened and exposes the expected knobs
  ✔ limits › PRLIMIT_FLAGS maps every documented limit to a long flag
  ✔ limits › resolveLimits merges overrides on top of defaults
  ✔ limits › resolveLimits with no overrides returns the defaults
  ✔ limits › assemblePrlimitArgv emits a prlimit prefix in deterministic order
  ✔ limits › assemblePrlimitArgv returns [] when no caps are set
  ✔ limits › assemblePrlimitArgv skips negative / NaN entries
  ✔ limits › makeCgroup2Probe reports unavailable when /proc/self/cgroup is missing
  ✔ limits › makeCgroup2Probe reports unavailable when not in a v2 hierarchy
  ✔ limits › makeCgroup2Probe reports missing controllers when delegation is partial
  ✔ limits › makeCgroup2Probe reports available when all controllers are delegated
  ✔ landlock › reports unavailable when /sys/kernel/security/lsm is missing
  ✔ landlock › reports unavailable when landlock is not in the LSM list
  ✔ landlock › reports available when landlock appears in the LSM list
  ✔ landlock › reports unavailable on other read errors with a structured reason
  ✔ seccomp-fixture › default.json matches the checked-in fixture hash
  ✔ seccomp-fixture › default.json parses as valid JSON with the expected top-level shape
  ✔ seccomp-fixture › default.json includes io_uring_* (Phase 1.5 podman-defaults rebase)
  ✔ seccomp-fixture › default.json.md documents the snapshot provenance
  ✔ factory › SandboxFactory interface advertises the expected method names
  ✔ factory › NetworkProfileShape accepts the documented profiles and rejects others
  ✔ factory › __getMethodNames__() round-trips the documented capability surface
  ✔ factory › listBackends returns an empty array when no drivers are registered
  ✔ factory › listBackends reports a registered driver as available
  ✔ factory › listBackends catches driver probe failures
  ✔ factory › factory.help() returns descriptive text
  ✔ factory › make() throws a structured "no backend available" error in Phase 0
  ✔ factory › make() reports the requested backend selector in its error
  ✔ daemon-smoke › agent.js make() loads and returns a factory matching the documented shape
  ✔ bwrap › bwrap probe reports available with a version
  ✔ bwrap › listBackends() reports bwrap available via the factory
  ✘ [fail]: bwrap › host-bind slice spawns /bin/echo hello exit code 0, got 1
    ℹ REJECTED from ava test.serial("host-bind slice spawns /bin/echo hello"): (TestFailure#1)
    ℹ TestFailure#1: The test has failed
    ℹ   at packages/sandbox/test/bwrap.test.js:200:5

  ✘ [fail]: bwrap › read-only mount rejects writes from inside the slice stderr should mention read-only
    ℹ REJECTED from ava test.serial("read-only mount rejects writes from inside the slice"): (TestFailure#2)
    ℹ TestFailure#2: The test has failed
    ℹ   at packages/sandbox/test/bwrap.test.js:249:5

  ✘ [fail]: bwrap › network: none blocks loopback reach connect to external host should fail
    ℹ REJECTED from ava test.serial("network: none blocks loopback reach"): (TestFailure#3)
    ℹ TestFailure#3: The test has failed
    ℹ   at packages/sandbox/test/bwrap.test.js:313:5

  ✔ bwrap › private network profile is accepted but pasta wiring is Phase 1.5
  ✘ [fail]: bwrap › host-net profile shares the host net namespace (Phase 1.5) cat /proc/net/dev should succeed
    ℹ REJECTED from ava test.serial("host-net profile shares the host net namespace (Phase 1.5)"): (TestFailure#4)
    ℹ TestFailure#4: The test has failed
    ℹ   at packages/sandbox/test/bwrap.test.js:412:7

  ✘ [fail]: bwrap › host-loopback profile is accepted host-loopback slice spawns successfully
    ℹ REJECTED from ava test.serial("host-loopback profile is accepted"): (TestFailure#5)
    ℹ TestFailure#5: The test has failed
    ℹ   at packages/sandbox/test/bwrap.test.js:464:5

  ✘ [fail]: bwrap › host-lan profile is accepted host-lan slice spawns successfully
    ℹ REJECTED from ava test.serial("host-lan profile is accepted"): (TestFailure#6)
    ℹ TestFailure#6: The test has failed
    ℹ   at packages/sandbox/test/bwrap.test.js:496:5

  ✔ bwrap › slice.help() reports the Landlock and prlimit hardening layers
  ✘ [fail]: bwrap › prlimit nproc cap is enforced inside the slice ulimit -u exit code 0 (got 1)
    ℹ REJECTED from ava test.serial("prlimit nproc cap is enforced inside the slice"): (TestFailure#7)
    ℹ TestFailure#7: The test has failed
    ℹ   at packages/sandbox/test/bwrap.test.js:600:7

  ✔ bwrap › fork() throws notImplemented before Phase 3
  ✔ daemon-smoke › agent.js handles missing options gracefully (958ms)
  ✔ daemon-smoke › listBackends() round-trips the registered backends (970ms)
  ✔ podman › podman probe reports rootless availability + version (923ms)
  ✔ podman › listBackends() reports podman available via the factory (931ms)
  ✔ podman › alpine OCI slice spawns /bin/echo hello
  ✔ podman › read-only mount rejects writes from inside the alpine slice
  ✔ podman › network: none blocks external reach in alpine slice
  ✔ podman › network: private mounts a routable interface other than lo
  ✔ podman › apk update succeeds inside a private alpine slice
  ✔ podman › orphan reap sweeps stale endo-sandbox- containers
  ✔ podman › podman driver rejects non-OCI rootfs at slice construction
  ✔ podman › slice.help() reports the rootless and rootless-net layers
  ✔ podman › fork() throws notImplemented before Phase 3
  ─

  bwrap › host-bind slice spawns /bin/echo hello
  exit code 0, got 1

  Difference (- actual, + expected):

  - 1
  + 0

  [object Object]
    at packages/sandbox/test/bwrap.test.js:200:5



  bwrap › read-only mount rejects writes from inside the slice
  stderr should mention read-only

  Value must match expression:

  `bwrap: Creating new namespace failed: Resource temporarily unavailable␊
  `

  Regular expression:

  /Read-only file system|Permission denied|read-only/i

  [object Object]
    at packages/sandbox/test/bwrap.test.js:249:5



  bwrap › network: none blocks loopback reach
  connect to external host should fail

  Value must match expression:

  ''

  Regular expression:

  /blocked/

  [object Object]
    at packages/sandbox/test/bwrap.test.js:313:5



  bwrap › host-net profile shares the host net namespace (Phase 1.5)
  cat /proc/net/dev should succeed

  Difference (- actual, + expected):

  - 1
  + 0

  [object Object]
    at packages/sandbox/test/bwrap.test.js:412:7



  bwrap › host-loopback profile is accepted
  host-loopback slice spawns successfully

  Difference (- actual, + expected):

  - 1
  + 0

  [object Object]
    at packages/sandbox/test/bwrap.test.js:464:5



  bwrap › host-lan profile is accepted
  host-lan slice spawns successfully

  Difference (- actual, + expected):

  - 1
  + 0

  [object Object]
    at packages/sandbox/test/bwrap.test.js:496:5



  bwrap › prlimit nproc cap is enforced inside the slice
  ulimit -u exit code 0 (got 1)

  Difference (- actual, + expected):

  - 1
  + 0

  [object Object]
    at packages/sandbox/test/bwrap.test.js:600:7

  ─

  7 tests failed
[ses-ava] config: unsafe
  ⚠ Using configuration from /home/jcorbin/endo/ava-endo-lockdown-unsafe.config.mjs

  ✔ blocked-ranges › private-egress.nft references every documented PRIVATE_BLOCKED_RANGES CIDR
  ✔ blocked-ranges › PRIVATE_BLOCKED_RANGES covers the four address-family classes
  ✔ blocked-ranges › HOST_LOOPBACK_ALLOWED_RANGES is restricted to loopback CIDRs
  ✔ blocked-ranges › HOST_LAN_ALLOWED_RANGES extends loopback with RFC 1918 / link-local
  ✔ landlock › reports unavailable when /sys/kernel/security/lsm is missing
  ✔ landlock › reports unavailable when landlock is not in the LSM list
  ✔ landlock › reports available when landlock appears in the LSM list
  ✔ landlock › reports unavailable on other read errors with a structured reason
  ✔ limits › DEFAULT_LIMITS is hardened and exposes the expected knobs
  ✔ limits › PRLIMIT_FLAGS maps every documented limit to a long flag
  ✔ limits › resolveLimits merges overrides on top of defaults
  ✔ limits › resolveLimits with no overrides returns the defaults
  ✔ limits › assemblePrlimitArgv emits a prlimit prefix in deterministic order
  ✔ limits › assemblePrlimitArgv returns [] when no caps are set
  ✔ limits › assemblePrlimitArgv skips negative / NaN entries
  ✔ limits › makeCgroup2Probe reports unavailable when /proc/self/cgroup is missing
  ✔ limits › makeCgroup2Probe reports unavailable when not in a v2 hierarchy
  ✔ limits › makeCgroup2Probe reports missing controllers when delegation is partial
  ✔ limits › makeCgroup2Probe reports available when all controllers are delegated
  ✔ bwrap › bwrap probe reports available with a version
  ✔ seccomp-fixture › default.json matches the checked-in fixture hash
  ✔ seccomp-fixture › default.json parses as valid JSON with the expected top-level shape
  ✔ seccomp-fixture › default.json includes io_uring_* (Phase 1.5 podman-defaults rebase)
  ✔ seccomp-fixture › default.json.md documents the snapshot provenance
  ✔ bwrap › listBackends() reports bwrap available via the factory
  ✔ factory › SandboxFactory interface advertises the expected method names
  ✔ factory › NetworkProfileShape accepts the documented profiles and rejects others
  ✔ factory › __getMethodNames__() round-trips the documented capability surface
  ✔ factory › listBackends returns an empty array when no drivers are registered
  ✔ factory › listBackends reports a registered driver as available
  ✔ factory › listBackends catches driver probe failures
  ✔ factory › make() throws a structured "no backend available" error in Phase 0
  ✔ factory › make() reports the requested backend selector in its error
  ✔ factory › factory.help() returns descriptive text
  ✘ [fail]: bwrap › host-bind slice spawns /bin/echo hello exit code 0, got 1
    ℹ REJECTED from ava test.serial("host-bind slice spawns /bin/echo hello"): (TestFailure#1)
    ℹ TestFailure#1: The test has failed
    ℹ   at packages/sandbox/test/bwrap.test.js:200:5

  ✔ daemon-smoke › agent.js make() loads and returns a factory matching the documented shape
  ✘ [fail]: bwrap › read-only mount rejects writes from inside the slice stderr should mention read-only
    ℹ REJECTED from ava test.serial("read-only mount rejects writes from inside the slice"): (TestFailure#2)
    ℹ TestFailure#2: The test has failed
    ℹ   at packages/sandbox/test/bwrap.test.js:249:5

  ✘ [fail]: bwrap › network: none blocks loopback reach connect to external host should fail
    ℹ REJECTED from ava test.serial("network: none blocks loopback reach"): (TestFailure#3)
    ℹ TestFailure#3: The test has failed
    ℹ   at packages/sandbox/test/bwrap.test.js:313:5

  ✔ bwrap › private network profile is accepted but pasta wiring is Phase 1.5
  ✘ [fail]: bwrap › host-net profile shares the host net namespace (Phase 1.5) cat /proc/net/dev should succeed
    ℹ REJECTED from ava test.serial("host-net profile shares the host net namespace (Phase 1.5)"): (TestFailure#4)
    ℹ TestFailure#4: The test has failed
    ℹ   at packages/sandbox/test/bwrap.test.js:412:7

  ✘ [fail]: bwrap › host-loopback profile is accepted host-loopback slice spawns successfully
    ℹ REJECTED from ava test.serial("host-loopback profile is accepted"): (TestFailure#5)
    ℹ TestFailure#5: The test has failed
    ℹ   at packages/sandbox/test/bwrap.test.js:464:5

  ✘ [fail]: bwrap › host-lan profile is accepted host-lan slice spawns successfully
    ℹ REJECTED from ava test.serial("host-lan profile is accepted"): (TestFailure#6)
    ℹ TestFailure#6: The test has failed
    ℹ   at packages/sandbox/test/bwrap.test.js:496:5

  ✔ bwrap › slice.help() reports the Landlock and prlimit hardening layers
  ✘ [fail]: bwrap › prlimit nproc cap is enforced inside the slice ulimit -u exit code 0 (got 1)
    ℹ REJECTED from ava test.serial("prlimit nproc cap is enforced inside the slice"): (TestFailure#7)
    ℹ TestFailure#7: The test has failed
    ℹ   at packages/sandbox/test/bwrap.test.js:600:7

  ✔ bwrap › fork() throws notImplemented before Phase 3
  ✔ daemon-smoke › agent.js handles missing options gracefully (1s)
  ✔ daemon-smoke › listBackends() round-trips the registered backends (1s)
  ✔ podman › podman probe reports rootless availability + version (927ms)
  ✔ podman › listBackends() reports podman available via the factory (954ms)
  ✔ podman › alpine OCI slice spawns /bin/echo hello
  ✔ podman › read-only mount rejects writes from inside the alpine slice
  ✔ podman › network: none blocks external reach in alpine slice
  ✔ podman › network: private mounts a routable interface other than lo
  ✔ podman › apk update succeeds inside a private alpine slice
  ✔ podman › orphan reap sweeps stale endo-sandbox- containers
  ✔ podman › podman driver rejects non-OCI rootfs at slice construction
  ✔ podman › slice.help() reports the rootless and rootless-net layers
  ✔ podman › fork() throws notImplemented before Phase 3
  ─

  bwrap › host-bind slice spawns /bin/echo hello
  exit code 0, got 1

  Difference (- actual, + expected):

  - 1
  + 0

  [object Object]
    at packages/sandbox/test/bwrap.test.js:200:5



  bwrap › read-only mount rejects writes from inside the slice
  stderr should mention read-only

  Value must match expression:

  `bwrap: Creating new namespace failed: Resource temporarily unavailable␊
  `

  Regular expression:

  /Read-only file system|Permission denied|read-only/i

  [object Object]
    at packages/sandbox/test/bwrap.test.js:249:5



  bwrap › network: none blocks loopback reach
  connect to external host should fail

  Value must match expression:

  ''

  Regular expression:

  /blocked/

  [object Object]
    at packages/sandbox/test/bwrap.test.js:313:5



  bwrap › host-net profile shares the host net namespace (Phase 1.5)
  cat /proc/net/dev should succeed

  Difference (- actual, + expected):

  - 1
  + 0

  [object Object]
    at packages/sandbox/test/bwrap.test.js:412:7



  bwrap › host-loopback profile is accepted
  host-loopback slice spawns successfully

  Difference (- actual, + expected):

  - 1
  + 0

  [object Object]
    at packages/sandbox/test/bwrap.test.js:464:5



  bwrap › host-lan profile is accepted
  host-lan slice spawns successfully

  Difference (- actual, + expected):

  - 1
  + 0

  [object Object]
    at packages/sandbox/test/bwrap.test.js:496:5



  bwrap › prlimit nproc cap is enforced inside the slice
  ulimit -u exit code 0 (got 1)

  Difference (- actual, + expected):

  - 1
  + 0

  [object Object]
    at packages/sandbox/test/bwrap.test.js:600:7

  ─

  7 tests failed
[ses-ava] config: endo
  ⚠ Using configuration from /home/jcorbin/endo/ava-endo-shims-only.config.mjs

  ✔ landlock › reports unavailable when /sys/kernel/security/lsm is missing
  ✔ landlock › reports unavailable when landlock is not in the LSM list
  ✔ landlock › reports available when landlock appears in the LSM list
  ✔ landlock › reports unavailable on other read errors with a structured reason
  ✔ limits › DEFAULT_LIMITS is hardened and exposes the expected knobs
  ✔ limits › PRLIMIT_FLAGS maps every documented limit to a long flag
  ✔ limits › resolveLimits merges overrides on top of defaults
  ✔ limits › resolveLimits with no overrides returns the defaults
  ✔ limits › assemblePrlimitArgv emits a prlimit prefix in deterministic order
  ✔ limits › assemblePrlimitArgv returns [] when no caps are set
  ✔ limits › assemblePrlimitArgv skips negative / NaN entries
  ✔ blocked-ranges › private-egress.nft references every documented PRIVATE_BLOCKED_RANGES CIDR
  ✔ blocked-ranges › PRIVATE_BLOCKED_RANGES covers the four address-family classes
  ✔ blocked-ranges › HOST_LOOPBACK_ALLOWED_RANGES is restricted to loopback CIDRs
  ✔ blocked-ranges › HOST_LAN_ALLOWED_RANGES extends loopback with RFC 1918 / link-local
  ✔ limits › makeCgroup2Probe reports unavailable when /proc/self/cgroup is missing
  ✔ limits › makeCgroup2Probe reports unavailable when not in a v2 hierarchy
  ✔ limits › makeCgroup2Probe reports missing controllers when delegation is partial
  ✔ limits › makeCgroup2Probe reports available when all controllers are delegated
  ✔ seccomp-fixture › default.json matches the checked-in fixture hash
  ✔ seccomp-fixture › default.json parses as valid JSON with the expected top-level shape
  ✔ seccomp-fixture › default.json includes io_uring_* (Phase 1.5 podman-defaults rebase)
  ✔ seccomp-fixture › default.json.md documents the snapshot provenance
  ✔ factory › SandboxFactory interface advertises the expected method names
  ✔ factory › NetworkProfileShape accepts the documented profiles and rejects others
  ✔ factory › __getMethodNames__() round-trips the documented capability surface
  ✔ factory › listBackends returns an empty array when no drivers are registered
  ✔ factory › listBackends reports a registered driver as available
  ✔ factory › listBackends catches driver probe failures
  ✔ factory › factory.help() returns descriptive text
  ✔ factory › make() throws a structured "no backend available" error in Phase 0
  ✔ factory › make() reports the requested backend selector in its error
  ✔ daemon-smoke › agent.js make() loads and returns a factory matching the documented shape
  ✔ bwrap › bwrap probe reports available with a version
  ✔ bwrap › listBackends() reports bwrap available via the factory
  ✘ [fail]: bwrap › host-bind slice spawns /bin/echo hello exit code 0, got 1
    ℹ REJECTED from ava test.serial("host-bind slice spawns /bin/echo hello"): (TestFailure#1)
    ℹ TestFailure#1: The test has failed
    ℹ   at packages/sandbox/test/bwrap.test.js:200:5

  ✘ [fail]: bwrap › read-only mount rejects writes from inside the slice stderr should mention read-only
    ℹ REJECTED from ava test.serial("read-only mount rejects writes from inside the slice"): (TestFailure#2)
    ℹ TestFailure#2: The test has failed
    ℹ   at packages/sandbox/test/bwrap.test.js:249:5

  ✘ [fail]: bwrap › network: none blocks loopback reach connect to external host should fail
    ℹ REJECTED from ava test.serial("network: none blocks loopback reach"): (TestFailure#3)
    ℹ TestFailure#3: The test has failed
    ℹ   at packages/sandbox/test/bwrap.test.js:313:5

  ✔ bwrap › private network profile is accepted but pasta wiring is Phase 1.5
  ✘ [fail]: bwrap › host-net profile shares the host net namespace (Phase 1.5) cat /proc/net/dev should succeed
    ℹ REJECTED from ava test.serial("host-net profile shares the host net namespace (Phase 1.5)"): (TestFailure#4)
    ℹ TestFailure#4: The test has failed
    ℹ   at packages/sandbox/test/bwrap.test.js:412:7

  ✘ [fail]: bwrap › host-loopback profile is accepted host-loopback slice spawns successfully
    ℹ REJECTED from ava test.serial("host-loopback profile is accepted"): (TestFailure#5)
    ℹ TestFailure#5: The test has failed
    ℹ   at packages/sandbox/test/bwrap.test.js:464:5

  ✘ [fail]: bwrap › host-lan profile is accepted host-lan slice spawns successfully
    ℹ REJECTED from ava test.serial("host-lan profile is accepted"): (TestFailure#6)
    ℹ TestFailure#6: The test has failed
    ℹ   at packages/sandbox/test/bwrap.test.js:496:5

  ✔ bwrap › slice.help() reports the Landlock and prlimit hardening layers
  ✘ [fail]: bwrap › prlimit nproc cap is enforced inside the slice ulimit -u exit code 0 (got 1)
    ℹ REJECTED from ava test.serial("prlimit nproc cap is enforced inside the slice"): (TestFailure#7)
    ℹ TestFailure#7: The test has failed
    ℹ   at packages/sandbox/test/bwrap.test.js:600:7

  ✔ bwrap › fork() throws notImplemented before Phase 3
  ✔ daemon-smoke › listBackends() round-trips the registered backends (1s)
  ✔ daemon-smoke › agent.js handles missing options gracefully (1s)
  ✔ podman › podman probe reports rootless availability + version (923ms)
  ✔ podman › listBackends() reports podman available via the factory (940ms)
  ✔ podman › alpine OCI slice spawns /bin/echo hello
  ✔ podman › read-only mount rejects writes from inside the alpine slice
  ✔ podman › network: none blocks external reach in alpine slice
  ✔ podman › network: private mounts a routable interface other than lo
  ✔ podman › apk update succeeds inside a private alpine slice
  ✔ podman › orphan reap sweeps stale endo-sandbox- containers
  ✔ podman › podman driver rejects non-OCI rootfs at slice construction
  ✔ podman › slice.help() reports the rootless and rootless-net layers
  ✔ podman › fork() throws notImplemented before Phase 3
  ─

  bwrap › host-bind slice spawns /bin/echo hello
  exit code 0, got 1

  Difference (- actual, + expected):

  - 1
  + 0

  [object Object]
    at packages/sandbox/test/bwrap.test.js:200:5



  bwrap › read-only mount rejects writes from inside the slice
  stderr should mention read-only

  Value must match expression:

  `bwrap: Creating new namespace failed: Resource temporarily unavailable␊
  `

  Regular expression:

  /Read-only file system|Permission denied|read-only/i

  [object Object]
    at packages/sandbox/test/bwrap.test.js:249:5



  bwrap › network: none blocks loopback reach
  connect to external host should fail

  Value must match expression:

  ''

  Regular expression:

  /blocked/

  [object Object]
    at packages/sandbox/test/bwrap.test.js:313:5



  bwrap › host-net profile shares the host net namespace (Phase 1.5)
  cat /proc/net/dev should succeed

  Difference (- actual, + expected):

  - 1
  + 0

  [object Object]
    at packages/sandbox/test/bwrap.test.js:412:7



  bwrap › host-loopback profile is accepted
  host-loopback slice spawns successfully

  Difference (- actual, + expected):

  - 1
  + 0

  [object Object]
    at packages/sandbox/test/bwrap.test.js:464:5



  bwrap › host-lan profile is accepted
  host-lan slice spawns successfully

  Difference (- actual, + expected):

  - 1
  + 0

  [object Object]
    at packages/sandbox/test/bwrap.test.js:496:5



  bwrap › prlimit nproc cap is enforced inside the slice
  ulimit -u exit code 0 (got 1)

  Difference (- actual, + expected):

  - 1
  + 0

  [object Object]
    at packages/sandbox/test/bwrap.test.js:600:7

  ─

  7 tests failed
[ses-ava] config: noop-harden
  ⚠ Using configuration from /home/jcorbin/endo/ava-base.config.mjs

  ✔ seccomp-fixture › default.json matches the checked-in fixture hash
  ✔ seccomp-fixture › default.json parses as valid JSON with the expected top-level shape
  ✔ seccomp-fixture › default.json includes io_uring_* (Phase 1.5 podman-defaults rebase)
  ✔ seccomp-fixture › default.json.md documents the snapshot provenance
  ✔ blocked-ranges › private-egress.nft references every documented PRIVATE_BLOCKED_RANGES CIDR
  ✔ blocked-ranges › PRIVATE_BLOCKED_RANGES covers the four address-family classes
  ✔ blocked-ranges › HOST_LOOPBACK_ALLOWED_RANGES is restricted to loopback CIDRs
  ✔ blocked-ranges › HOST_LAN_ALLOWED_RANGES extends loopback with RFC 1918 / link-local
  ✔ limits › DEFAULT_LIMITS is hardened and exposes the expected knobs
  ✔ limits › PRLIMIT_FLAGS maps every documented limit to a long flag
  ✔ limits › resolveLimits merges overrides on top of defaults
  ✔ limits › resolveLimits with no overrides returns the defaults
  ✔ limits › assemblePrlimitArgv emits a prlimit prefix in deterministic order
  ✔ limits › assemblePrlimitArgv returns [] when no caps are set
  ✔ limits › assemblePrlimitArgv skips negative / NaN entries
  ✔ limits › makeCgroup2Probe reports unavailable when /proc/self/cgroup is missing
  ✔ limits › makeCgroup2Probe reports unavailable when not in a v2 hierarchy
  ✔ limits › makeCgroup2Probe reports missing controllers when delegation is partial
  ✔ limits › makeCgroup2Probe reports available when all controllers are delegated
  ✔ landlock › reports unavailable when /sys/kernel/security/lsm is missing
  ✔ landlock › reports unavailable when landlock is not in the LSM list
  ✔ landlock › reports available when landlock appears in the LSM list
  ✔ landlock › reports unavailable on other read errors with a structured reason
  ✔ factory › SandboxFactory interface advertises the expected method names
  ✔ factory › NetworkProfileShape accepts the documented profiles and rejects others
  ✔ factory › __getMethodNames__() round-trips the documented capability surface
  ✔ factory › listBackends returns an empty array when no drivers are registered
  ✔ factory › listBackends reports a registered driver as available
  ✔ factory › listBackends catches driver probe failures
  ✔ factory › factory.help() returns descriptive text
  ✔ factory › make() throws a structured "no backend available" error in Phase 0
  ✔ factory › make() reports the requested backend selector in its error
  ✔ bwrap › bwrap probe reports available with a version
  ✔ bwrap › listBackends() reports bwrap available via the factory
  ✘ [fail]: bwrap › host-bind slice spawns /bin/echo hello exit code 0, got 1
    ℹ REJECTED from ava test.serial("host-bind slice spawns /bin/echo hello"): (TestFailure#1)
    ℹ TestFailure#1: The test has failed
    ℹ   at packages/sandbox/test/bwrap.test.js:200:5

  ✘ [fail]: bwrap › read-only mount rejects writes from inside the slice stderr should mention read-only
    ℹ REJECTED from ava test.serial("read-only mount rejects writes from inside the slice"): (TestFailure#2)
    ℹ TestFailure#2: The test has failed
    ℹ   at packages/sandbox/test/bwrap.test.js:249:5

  ✔ daemon-smoke › agent.js make() loads and returns a factory matching the documented shape
  ✘ [fail]: bwrap › network: none blocks loopback reach connect to external host should fail
    ℹ REJECTED from ava test.serial("network: none blocks loopback reach"): (TestFailure#3)
    ℹ TestFailure#3: The test has failed
    ℹ   at packages/sandbox/test/bwrap.test.js:313:5

  ✔ bwrap › private network profile is accepted but pasta wiring is Phase 1.5
  ✘ [fail]: bwrap › host-net profile shares the host net namespace (Phase 1.5) cat /proc/net/dev should succeed
    ℹ REJECTED from ava test.serial("host-net profile shares the host net namespace (Phase 1.5)"): (TestFailure#4)
    ℹ TestFailure#4: The test has failed
    ℹ   at packages/sandbox/test/bwrap.test.js:412:7

  ✘ [fail]: bwrap › host-loopback profile is accepted host-loopback slice spawns successfully
    ℹ REJECTED from ava test.serial("host-loopback profile is accepted"): (TestFailure#5)
    ℹ TestFailure#5: The test has failed
    ℹ   at packages/sandbox/test/bwrap.test.js:464:5

  ✘ [fail]: bwrap › host-lan profile is accepted host-lan slice spawns successfully
    ℹ REJECTED from ava test.serial("host-lan profile is accepted"): (TestFailure#6)
    ℹ TestFailure#6: The test has failed
    ℹ   at packages/sandbox/test/bwrap.test.js:496:5

  ✔ bwrap › slice.help() reports the Landlock and prlimit hardening layers
  ✘ [fail]: bwrap › prlimit nproc cap is enforced inside the slice ulimit -u exit code 0 (got 1)
    ℹ REJECTED from ava test.serial("prlimit nproc cap is enforced inside the slice"): (TestFailure#7)
    ℹ TestFailure#7: The test has failed
    ℹ   at packages/sandbox/test/bwrap.test.js:600:7

  ✔ bwrap › fork() throws notImplemented before Phase 3
  ✔ daemon-smoke › listBackends() round-trips the registered backends (1s)
  ✔ daemon-smoke › agent.js handles missing options gracefully (1s)
  ✔ podman › podman probe reports rootless availability + version (942ms)
  ✔ podman › listBackends() reports podman available via the factory (914ms)
  ✔ podman › alpine OCI slice spawns /bin/echo hello
  ✔ podman › read-only mount rejects writes from inside the alpine slice
  ✔ podman › network: none blocks external reach in alpine slice
  ✔ podman › network: private mounts a routable interface other than lo
  ✔ podman › apk update succeeds inside a private alpine slice
  ✔ podman › orphan reap sweeps stale endo-sandbox- containers
  ✔ podman › podman driver rejects non-OCI rootfs at slice construction
  ✔ podman › slice.help() reports the rootless and rootless-net layers
  ✔ podman › fork() throws notImplemented before Phase 3
  ─

  bwrap › host-bind slice spawns /bin/echo hello
  exit code 0, got 1

  Difference (- actual, + expected):

  - 1
  + 0

  [object Object]
    at packages/sandbox/test/bwrap.test.js:200:5



  bwrap › read-only mount rejects writes from inside the slice
  stderr should mention read-only

  Value must match expression:

  `bwrap: Creating new namespace failed: Resource temporarily unavailable␊
  `

  Regular expression:

  /Read-only file system|Permission denied|read-only/i

  [object Object]
    at packages/sandbox/test/bwrap.test.js:249:5



  bwrap › network: none blocks loopback reach
  connect to external host should fail

  Value must match expression:

  ''

  Regular expression:

  /blocked/

  [object Object]
    at packages/sandbox/test/bwrap.test.js:313:5



  bwrap › host-net profile shares the host net namespace (Phase 1.5)
  cat /proc/net/dev should succeed

  Difference (- actual, + expected):

  - 1
  + 0

  [object Object]
    at packages/sandbox/test/bwrap.test.js:412:7



  bwrap › host-loopback profile is accepted
  host-loopback slice spawns successfully

  Difference (- actual, + expected):

  - 1
  + 0

  [object Object]
    at packages/sandbox/test/bwrap.test.js:464:5



  bwrap › host-lan profile is accepted
  host-lan slice spawns successfully

  Difference (- actual, + expected):

  - 1
  + 0

  [object Object]
    at packages/sandbox/test/bwrap.test.js:496:5



  bwrap › prlimit nproc cap is enforced inside the slice
  ulimit -u exit code 0 (got 1)

  Difference (- actual, + expected):

  - 1
  + 0

  [object Object]
    at packages/sandbox/test/bwrap.test.js:600:7

  ─

  7 tests failed
```
