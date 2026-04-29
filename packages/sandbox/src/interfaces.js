// @ts-check

import { M } from '@endo/patterns';

/**
 * Runtime `M.interface()` guards for the `@endo/sandbox` capability
 * surface. The compile-time shapes live in `./types.d.ts`; these guards
 * are what `makeExo` enforces at the CapTP boundary.
 */

// ---------------------------------------------------------------------------
// Shared shape fragments
// ---------------------------------------------------------------------------

const NetworkProfileShape = M.or(
  'none',
  'private',
  'host-loopback',
  'host-lan',
  'host-net',
);
harden(NetworkProfileShape);

const BackendNameShape = M.or(
  'bwrap',
  'podman',
  'lima',
  'containerization',
  'wsl',
);
harden(BackendNameShape);

const BackendSelectorShape = M.or('auto', BackendNameShape);
harden(BackendSelectorShape);

const MountModeShape = M.or('ro', 'rw');
harden(MountModeShape);

const EnvShape = M.recordOf(M.string(), M.string());
harden(EnvShape);

const RootfsSpecShape = M.or(
  M.remotable('Mount'),
  M.splitRecord({ kind: 'host-bind' }),
  M.splitRecord({ kind: 'minimal' }),
);
harden(RootfsSpecShape);

const MountSpecShape = M.splitRecord(
  {
    cap: M.remotable('Mount'),
    innerPath: M.string(),
  },
  {
    mode: MountModeShape,
  },
);
harden(MountSpecShape);

const SeccompPolicyShape = M.or(
  'default',
  'unconfined',
  M.splitRecord({ profile: M.any() }),
);
harden(SeccompPolicyShape);

const ResourceLimitsShape = M.splitRecord(
  {},
  {
    as: M.number(),
    cpu: M.number(),
    nproc: M.number(),
    nofile: M.number(),
    fsize: M.number(),
    core: M.number(),
  },
);
harden(ResourceLimitsShape);

const SandboxMakeOptsShape = M.splitRecord(
  {
    rootfs: RootfsSpecShape,
  },
  {
    mounts: M.arrayOf(MountSpecShape),
    network: NetworkProfileShape,
    backend: BackendSelectorShape,
    seccomp: SeccompPolicyShape,
    env: EnvShape,
    cwd: M.string(),
    limits: ResourceLimitsShape,
  },
);
harden(SandboxMakeOptsShape);

const SpawnOptsShape = M.splitRecord(
  {},
  {
    env: EnvShape,
    cwd: M.string(),
    stdin: M.remotable('Reader'),
    captureStdout: M.boolean(),
    captureStderr: M.boolean(),
  },
);
harden(SpawnOptsShape);

const BackendProbeDetailsShape = M.splitRecord(
  {},
  {
    landlock: M.splitRecord({ available: M.boolean() }, { reason: M.string() }),
    cgroup2: M.splitRecord(
      { available: M.boolean(), controllers: M.arrayOf(M.string()) },
      { reason: M.string() },
    ),
  },
);
harden(BackendProbeDetailsShape);

const BackendProbeShape = M.splitRecord(
  {
    name: BackendNameShape,
    available: M.boolean(),
  },
  {
    reason: M.string(),
    version: M.string(),
    details: BackendProbeDetailsShape,
  },
);
harden(BackendProbeShape);

const ExitStatusShape = harden({
  code: M.or(M.number(), M.null()),
  signal: M.or(M.string(), M.null()),
});

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

/**
 * Root capability minted by the plugin's `make-unconfined` entry point.
 * Mints individual sandbox slices.
 */
export const SandboxFactoryInterface = M.interface('SandboxFactory', {
  help: M.call().optional(M.string()).returns(M.string()),
  listBackends: M.call().returns(M.promise()),
  make: M.call(SandboxMakeOptsShape).returns(M.promise()),
});
harden(SandboxFactoryInterface);

/**
 * A live sandbox slice — pinned by the formula that minted it.
 */
export const SandboxHandleInterface = M.interface('SandboxHandle', {
  help: M.call().optional(M.string()).returns(M.string()),
  spawn: M.call(M.arrayOf(M.string()))
    .optional(SpawnOptsShape)
    .returns(M.promise()),
  mount: M.call(M.remotable('Mount'), M.string())
    .optional(MountModeShape)
    .returns(M.promise()),
  scratch: M.call(M.string()).returns(M.promise()),
  open: M.call(M.string()).returns(M.promise()),
  fork: M.call().optional(SandboxMakeOptsShape).returns(M.promise()),
  reset: M.call().returns(M.promise()),
  dispose: M.call().returns(M.promise()),
});
harden(SandboxHandleInterface);

/**
 * A process running inside a slice. Stdio uses Endo's existing
 * `reader-ref` / `writer-ref` plumbing.
 */
export const ProcessHandleInterface = M.interface('SandboxProcess', {
  help: M.call().optional(M.string()).returns(M.string()),
  pid: M.call().returns(M.number()),
  stdin: M.call().returns(M.remotable('Writer')),
  stdout: M.call().returns(M.remotable('Reader')),
  stderr: M.call().returns(M.remotable('Reader')),
  wait: M.call().returns(M.promise()),
  kill: M.call().optional(M.or(M.string(), M.number())).returns(M.promise()),
});
harden(ProcessHandleInterface);

/**
 * A mount bound into a slice.
 */
export const MountHandleInterface = M.interface('SandboxMount', {
  help: M.call().optional(M.string()).returns(M.string()),
  innerPath: M.call().returns(M.string()),
  cap: M.call().returns(M.remotable('Mount')),
  mode: M.call().returns(MountModeShape),
  unmount: M.call().returns(M.promise()),
});
harden(MountHandleInterface);

// ---------------------------------------------------------------------------
// Re-exported shape fragments — useful for tests / driver authors
// ---------------------------------------------------------------------------

export {
  BackendNameShape,
  BackendProbeDetailsShape,
  BackendProbeShape,
  BackendSelectorShape,
  EnvShape,
  ExitStatusShape,
  MountModeShape,
  MountSpecShape,
  NetworkProfileShape,
  ResourceLimitsShape,
  RootfsSpecShape,
  SandboxMakeOptsShape,
  SeccompPolicyShape,
  SpawnOptsShape,
};
