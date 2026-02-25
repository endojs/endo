# Daemon OS Sandbox Plugin

| | |
|---|---|
| **Date** | 2026-02-15 |
| **Author** | Kris Kowal (prompted) |
| **Status** | Not Started |

## What is the Problem Being Solved?

Endo provides strong confinement for JavaScript code through hardened
Compartments, but has no mechanism for sandboxing _native_ programs.
Users who want to run arbitrary executables (compilers, linters, data
pipelines, language runtimes) under Endo's capability discipline today
must either trust the program with full OS access or manually configure
platform-specific sandboxing outside of Endo.

A plugin that can describe a set of OS-level endowments (filesystem paths,
network access, device access, IPC) and then execute programs within a
sandbox enforcing exactly those endowments would let Endo extend its
principle of least authority to native processes.  macOS provides
`sandbox-exec` with SBPL profiles, and Linux provides `bubblewrap`
(combining namespaces, bind mounts, and seccomp-bpf).  Both can be driven
programmatically by generating configuration and spawning a child process.

## Description of the Design

### Overview

The plugin is an unconfined caplet (`makeUnconfined`) that exports a
`SandboxMaker` capability.  A holder of `SandboxMaker` can describe a set
of endowments and receive back a `Sandbox` capability scoped to exactly
those endowments.  The `Sandbox` can then execute programs, returning
their stdout, stderr, and exit code.

The plugin detects the host platform at startup and delegates to a
platform-specific backend (SBPL on macOS, bubblewrap on Linux).

### Capability flow

```
HOST
 └─ makeUnconfined("sandbox-worker", "./sandbox-plugin.js")
     └─ SandboxMaker                        (held by host or granted to guests)
         │
         ├─ describe({ fs, net, exec, env })
         │   └─ Sandbox                     (scoped to declared endowments)
         │       ├─ run(command, args, opts)
         │       │   └─ { stdout, stderr, exitCode }
         │       ├─ help()
         │       └─ getEndowments()
         │
         └─ help()
```

Guests never receive `SandboxMaker` directly unless the host explicitly
grants it.  More commonly the host creates a `Sandbox` with a specific
endowment set and passes only that `Sandbox` to the guest, preventing the
guest from escalating its own OS-level authority.

### Endowment descriptor

The endowment descriptor is a plain hardened record that declaratively
lists the resources a sandbox should provide:

```js
/** @typedef {object} SandboxEndowments
 * @property {Array<FsEndowment>} [fs] - Filesystem access grants
 * @property {NetEndowment} [net] - Network access grants
 * @property {ExecEndowment} [exec] - Process execution grants
 * @property {Record<string, string>} [env] - Environment variables
 * @property {DeviceEndowment} [devices] - Device access grants
 */

/** @typedef {object} FsEndowment
 * @property {string} path - Host path to expose
 * @property {'read' | 'read-write'} mode
 * @property {string} [mountAt] - Guest-visible path (Linux only; macOS
 *   exposes the host path directly)
 */

/** @typedef {object} NetEndowment
 * @property {boolean} [outbound] - Allow outgoing connections
 * @property {boolean} [inbound] - Allow incoming connections
 * @property {Array<string>} [allowHosts] - Restrict outbound to these
 *   hosts/CIDRs (macOS SBPL: ip filter; Linux: not enforceable by
 *   bubblewrap alone, noted in limitations)
 * @property {Array<number>} [allowPorts] - Restrict to these ports
 */

/** @typedef {object} ExecEndowment
 * @property {Array<string>} allowPaths - Directories from which
 *   executables may be run
 */

/** @typedef {object} DeviceEndowment
 * @property {boolean} [camera] - Allow camera access (macOS only)
 * @property {boolean} [microphone] - Allow microphone access (macOS only)
 */
```

### Interface guards

Guards should be specific enough that an LLM inspecting them can
construct valid calls without guessing.  In particular, the endowment
descriptor passed to `describe()` and the options passed to `run()` use
`M.splitRecord` with named fields rather than an opaque `M.record()`.

```js
const FsEndowmentShape = M.splitRecord(
  { path: M.string(), mode: M.or(M.literal('read'), M.literal('read-write')) },
  { mountAt: M.string() },
);

const NetEndowmentShape = M.splitRecord(
  {},
  {
    outbound: M.boolean(),
    inbound: M.boolean(),
    allowHosts: M.arrayOf(M.string()),
    allowPorts: M.arrayOf(M.number()),
  },
);

const ExecEndowmentShape = M.splitRecord({
  allowPaths: M.arrayOf(M.string()),
});

const DeviceEndowmentShape = M.splitRecord(
  {},
  { camera: M.boolean(), microphone: M.boolean() },
);

const EndowmentDescriptorShape = M.splitRecord(
  {},
  {
    fs: M.arrayOf(FsEndowmentShape),
    net: NetEndowmentShape,
    exec: ExecEndowmentShape,
    env: M.mapOf(M.string(), M.string()),
    devices: DeviceEndowmentShape,
  },
);

const RunOptionsShape = M.splitRecord(
  {},
  { timeout: M.number(), cwd: M.string() },
);

const RunResultShape = M.splitRecord(
  { exitCode: M.number() },
  { stdout: M.string(), stderr: M.string() },
);

const SandboxMakerI = M.interface('SandboxMaker', {
  describe: M.call(EndowmentDescriptorShape).returns(M.remotable('Sandbox')),
  help: M.call().returns(M.string()),
});

const SandboxI = M.interface('Sandbox', {
  run: M.call(M.string(), M.arrayOf(M.string()))
    .optional(RunOptionsShape)
    .returns(M.promise(RunResultShape)),
  getEndowments: M.call().returns(EndowmentDescriptorShape),
  help: M.call().returns(M.string()),
});
```

### LLM discoverability

It is critical that an LLM agent can discover how to use this plugin
without out-of-band documentation.  An LLM driving Endo on behalf of a
user prompt will typically receive a capability reference and need to
figure out what it does and how to call it using only the object's own
self-description.  Two mechanisms make this possible:

1. **`help()` methods must be comprehensive.**  Every Exo in this plugin
   exposes a `help()` method that returns a natural-language description
   of the object's purpose _and_ a usage guide including the shape of
   arguments it expects and the values it returns.  `help()` text should
   be written as if the reader is an LLM that has never seen the plugin
   before: explain what the capability does, enumerate every method with
   its parameters and return type in prose, and give a concrete example
   invocation.

2. **Interface guards must be maximally specific.**  The `M.interface()`
   patterns are the machine-readable schema an LLM can inspect (via
   Endo's interface introspection) to understand method signatures.
   Guards must use precise pattern shapes — named record fields,
   enumerations, and descriptive remotable tags — rather than opaque
   `M.record()` or `M.any()`.  The more structure the guards expose, the
   less the LLM must guess.

Together, `help()` provides the narrative a language model can reason
over, and the interface guards provide the structural contract it can
use to construct valid calls.  If either is vague, the LLM will be
unable to use the capability reliably.

The `help()` text and interface guards shown below in the plugin entry
point reflect this requirement.

### Platform backends

#### macOS backend (SBPL)

The macOS backend generates an SBPL profile string from the endowment
descriptor and invokes `sandbox-exec -p <profile> <command>`.

Mapping from endowments to SBPL operations:

| Endowment | SBPL rules |
|---|---|
| `fs[].mode === 'read'` | `(allow file-read* (subpath "<path>"))` |
| `fs[].mode === 'read-write'` | `(allow file-read* file-write* (subpath "<path>"))` |
| `net.outbound` | `(allow network-outbound)` with optional ip/port filters |
| `net.inbound` | `(allow network-inbound network-bind)` |
| `exec.allowPaths` | `(allow process-exec (subpath "<path>"))` plus `(allow process-fork)` |
| `devices.camera` | `(allow device-camera)` |
| `devices.microphone` | `(allow device-microphone)` |

A baseline set of rules is always included: reading system libraries
(`/usr/lib`, `/System/Library`), executing the shell, and accessing
`/dev/null`, `/dev/urandom`.  The default policy is `(deny default)`.

Example generated profile for a read-only `/tmp/data` sandbox with
network denied:

```scheme
(version 1)
(deny default)
(allow file-read* (subpath "/usr/lib"))
(allow file-read* (subpath "/System/Library"))
(allow file-read* (literal "/dev/null"))
(allow file-read* (literal "/dev/urandom"))
(allow process-exec (subpath "/usr/bin"))
(allow process-fork)
(allow file-read* (subpath "/tmp/data"))
```

Note: `sandbox-exec` is marked deprecated by Apple but remains functional
and is still used internally by Apple (e.g. BlastDoor).  The SBPL engine
is actively maintained as a private interface.  Should Apple remove it in
a future release, the macOS backend can be updated to use the Endpoint
Security framework or a user-space FUSE-based approach.

#### Linux backend (bubblewrap + seccomp)

The Linux backend builds a `bwrap` command line from the endowment
descriptor.

Mapping from endowments to bwrap flags:

| Endowment | bwrap flags |
|---|---|
| `fs[].mode === 'read'` | `--ro-bind <path> <mountAt>` |
| `fs[].mode === 'read-write'` | `--bind <path> <mountAt>` |
| `net.outbound \|\| net.inbound` | `--share-net` (default is `--unshare-net`) |
| `exec.allowPaths` | Included via bind mounts; no additional flag |
| `env` | `--setenv <key> <value>` for each entry; `--clearenv` first |

The baseline `bwrap` invocation always includes:

```bash
bwrap \
  --unshare-all \
  --die-with-parent \
  --dev /dev \
  --proc /proc \
  --tmpfs /tmp \
  --ro-bind /usr /usr \
  --ro-bind /lib /lib \
  --ro-bind /lib64 /lib64 \
  --symlink usr/bin /bin \
  --symlink usr/sbin /sbin \
  --clearenv \
  ...
```

An optional seccomp filter (compiled via a bundled BPF generator or an
exported filter file) can further restrict dangerous syscalls (`ptrace`,
`mount`, `unshare`, `bpf`, `io_uring_setup`).

### Plugin entry point

```js
// @ts-check
/// <reference types="ses" />

/** @import { FarRef } from '@endo/far' */

import { makeExo } from '@endo/exo';
import { M } from '@endo/patterns';
import { Far } from '@endo/far';
import { E } from '@endo/far';
import { makeError, X, q } from '@endo/errors';
import { execFile } from 'node:child_process';
import { platform } from 'node:os';

const makeSandbox = (endowments, backend) => {
  harden(endowments);
  return makeExo('Sandbox', SandboxI, {
    async run(command, args, opts = {}) {
      const { timeout = 30_000, cwd } = opts;
      const argv = backend.buildArgv(endowments, command, args, { cwd });
      return backend.exec(argv, { timeout });
    },
    getEndowments() {
      return endowments;
    },
    help() {
      return `\
A Sandbox runs native programs with restricted OS endowments.

Methods:
  run(command, args, opts?) - Execute a program inside the sandbox.
    command: string - Absolute path to the executable.
    args: string[] - Command-line arguments.
    opts?: { timeout?: number (ms, default 30000), cwd?: string }
    Returns: { exitCode: number, stdout: string, stderr: string }
    Example: run("/usr/bin/grep", ["-r", "TODO", "/data"], { timeout: 10000 })

  getEndowments() - Returns the endowment descriptor this sandbox was
    created with, showing which filesystem paths, network access, and
    other resources are available.

  help() - Returns this description.`;
    },
  });
};
harden(makeSandbox);

export const make = (_powers, _context, _options) => {
  const os = platform();
  const backend = os === 'darwin'
    ? makeSbplBackend()
    : makeLinuxBackend();

  return makeExo('SandboxMaker', SandboxMakerI, {
    describe(endowmentDescriptor) {
      return makeSandbox(endowmentDescriptor, backend);
    },
    help() {
      return `\
SandboxMaker creates OS-level sandboxes for running native programs
with restricted endowments (currently using the ${os} backend).

Methods:
  describe(endowments) - Create a Sandbox with the given endowments.
    endowments: {
      fs?: Array<{ path: string, mode: 'read' | 'read-write', mountAt?: string }>
        Filesystem paths to expose inside the sandbox.
      net?: { outbound?: boolean, inbound?: boolean,
              allowHosts?: string[], allowPorts?: number[] }
        Network access grants. Default is no network.
      exec?: { allowPaths: string[] }
        Directories from which executables may be run.
      env?: Record<string, string>
        Environment variables for the sandboxed process.
      devices?: { camera?: boolean, microphone?: boolean }
        Device access (macOS only).
    }
    Returns: a Sandbox capability. Call help() on it for usage.
    Example: describe({ fs: [{ path: "/tmp/data", mode: "read" }],
                         exec: { allowPaths: ["/usr/bin"] } })

  help() - Returns this description.`;
    },
  });
};
harden(make);
```

### Affected Packages

- **`packages/daemon`** — New plugin source under
  `packages/daemon/lib/sandbox-plugin/` with platform backends.
- **`packages/daemon`** — Integration tests exercising the plugin with
  trivial commands under sandbox.
- **`packages/cli`** — Optional convenience command (`endo sandbox`) for
  creating sandboxes from the CLI.

### Dependencies

- bubblewrap (`bwrap`) must be installed on Linux hosts.
- `sandbox-exec` must be available on macOS hosts (ships with macOS).
- No dependency on other design work items.

## Security Considerations

- **Profile generation is security-critical.**  The SBPL and bwrap
  argument generators must be carefully audited to prevent injection.
  Paths in endowment descriptors must be validated and canonicalized
  before interpolation into SBPL strings or command arguments.
- **The plugin itself is unconfined** (it needs `child_process` access).
  Only the host should hold `SandboxMaker`; guests should receive
  pre-scoped `Sandbox` objects.
- **Sandbox escapes.**  Both `sandbox-exec` and `bwrap` have known
  limitations.  `sandbox-exec` is a process-level MAC policy that can be
  circumvented by kernel exploits.  `bwrap` depends on user namespace
  support and may be restricted on some kernels.  The plugin provides
  defense-in-depth, not absolute isolation.
- **Path traversal.**  The endowment descriptor must reject paths
  containing `..` segments or symlinks that resolve outside the declared
  scope.  On macOS, SBPL `subpath` handles this at the kernel level; on
  Linux, `bwrap` bind mounts achieve the same effect.
- **Network filtering granularity.**  macOS SBPL can filter outbound
  connections by host/port.  Linux `bwrap` can only toggle network
  namespace sharing (all-or-nothing); finer-grained network filtering on
  Linux would require additional tooling (e.g., nftables rules in the
  network namespace) and is out of scope for the initial implementation.
- **`sandbox-exec` deprecation.**  Apple has marked `sandbox-exec` as
  deprecated.  The design isolates the macOS backend so it can be
  replaced without affecting the capability interface.

## Scaling Considerations

- Each `run()` call spawns a child process.  Concurrent sandbox
  invocations are bounded by OS process limits and available memory.
- SBPL profile generation and bwrap argument construction are
  lightweight string operations with negligible overhead.
- Long-running sandboxed processes should be managed with timeouts
  (configurable per `run()` call) to prevent resource exhaustion.

## Test Plan

- Unit tests for SBPL profile generation: verify correct SBPL output for
  each endowment type and combination.
- Unit tests for bwrap argument generation: verify correct flag sequences.
- Unit tests for path validation: reject `..`, symlinks, non-absolute
  paths.
- Integration test (macOS): sandbox a command that attempts to read a
  file outside the allowed paths; verify it is denied.
- Integration test (macOS): sandbox a command with network denied; verify
  it cannot connect.
- Integration test (Linux): sandbox a command with `--unshare-net`;
  verify network is unavailable.
- Integration test (Linux): sandbox a command with read-only bind mount;
  verify writes fail.
- Integration test: verify `SandboxMaker.describe()` returns a working
  `Sandbox` that can run a trivial command (`echo hello`).
- Integration test: verify a guest holding only a `Sandbox` cannot
  escalate to `SandboxMaker`.

### Maybe

- Fuzz testing of SBPL profile generation with adversarial path inputs.
- Performance benchmarks for sandbox startup latency on each platform.

## Compatibility Considerations

- The plugin's capability interface (`SandboxMaker`, `Sandbox`) is
  platform-independent.  Consumers do not need to know which backend is
  in use.
- The endowment descriptor is a plain record and can be serialized over
  OCapN without special marshalling.
- Some endowment fields are platform-specific (e.g., `devices.camera` on
  macOS, `mountAt` on Linux).  The backends silently ignore fields that
  do not apply to their platform, and `getEndowments()` returns the
  effective endowments.
- bubblewrap requires Linux kernel ≥ 3.18 with user namespace support
  enabled.  Some distributions disable unprivileged user namespaces by
  default.

## Upgrade Considerations

- The plugin is new and introduces no migration concerns for existing
  Endo state.
- Future revisions of the endowment descriptor schema should be versioned
  (e.g., a `version` field) so that `SandboxMaker` can reject or adapt
  to older descriptor formats.
- If Apple removes `sandbox-exec`, the macOS backend will need
  replacement.  The `Sandbox` capability interface will remain stable.
