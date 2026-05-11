/**
 * Type definitions for the `@endo/sandbox` plugin.
 *
 * These mirror the capability surface and backend driver interface
 * described in `PLAN/endo_posix_sandbox.md`. They are the typed contract
 * Phase 1+ implementations will fill in. No runtime code lives here —
 * the runtime guards live in `./interfaces.js`.
 */

import type { ERef, FarRef } from '@endo/eventual-send';

// ---------------------------------------------------------------------------
// Network policy
// ---------------------------------------------------------------------------

/**
 * Network policy ladder applied at slice construction. Profiles are
 * strictly ordered from most-confined to least-confined; misconfiguration
 * is a hard error, never an upgrade.
 *
 * - `none`        — no network reachable.
 * - `private`     — private namespace, NAT'd outbound, RFC 1918 / loopback
 *                   blocklisted.
 * - `host-loopback` — share host net namespace, only loopback reachable.
 * - `host-lan`    — share host net namespace, no public Internet.
 * - `host-net`    — share host net namespace, no extra filtering.
 */
export type NetworkProfile =
  | 'none'
  | 'private'
  | 'host-loopback'
  | 'host-lan'
  | 'host-net';

// ---------------------------------------------------------------------------
// Backend driver names and probe results
// ---------------------------------------------------------------------------

/**
 * Backend driver registry. v1 only ships `bwrap` (Phase 1) and
 * `podman` (Phase 2); the rest are reserved for later phases.
 */
export type BackendName =
  | 'bwrap'
  | 'podman'
  | 'lima'
  | 'containerization'
  | 'wsl';

/**
 * Backend selection passed to `SandboxFactory.make()`.
 * `'auto'` lets the factory choose the first available backend.
 */
export type BackendSelector = 'auto' | BackendName;

/**
 * Optional kernel-feature detail attached to a backend probe.  Phase
 * 1.5 surfaces Landlock and cgroup v2 status; Phase 2 adds the
 * `rootless` flag for the podman driver so callers can tell whether
 * podman runs as a regular user (the only mode the sandbox supports).
 */
export type BackendProbeDetails = {
  /** Landlock LSM availability (kernel ≥ 5.13). */
  landlock?: {
    available: boolean;
    reason?: string;
  };
  /** cgroup v2 availability + delegated controllers. */
  cgroup2?: {
    available: boolean;
    controllers: string[];
    reason?: string;
  };
  /**
   * Rootless container engine availability (Phase 2; podman driver).
   * `available: false` either means the binary is rootful-only or that
   * rootless support could not be confirmed.
   */
  rootless?: {
    available: boolean;
    reason?: string | undefined;
  };
};

/**
 * Result of probing a backend driver for availability. Probing is
 * best-effort and fast (binary present? `--version` works? kernel
 * feature reachable?).
 */
export type BackendProbe = {
  /** Backend driver name. */
  name: BackendName;
  /** Whether this backend is usable on the current host. */
  available: boolean;
  /** Optional human-readable explanation when `available` is false. */
  reason?: string | undefined;
  /** Optional version string reported by the backend's CLI. */
  version?: string;
  /** Optional kernel-feature detail, populated by Phase 1.5+ drivers. */
  details?: BackendProbeDetails;
};

// ---------------------------------------------------------------------------
// Mount specifications and rootfs
// ---------------------------------------------------------------------------

/** Mount mode — read-only is the default. */
export type MountMode = 'ro' | 'rw';

/**
 * A `Mount` capability the caller has been granted by Endo's existing
 * `provideMount` machinery. The sandbox plugin never accepts string
 * host paths in lieu of a `Mount` capability.
 */
export type MountCap = ERef<unknown>;

/**
 * Specification for a mount to be bound into the slice.
 */
export type MountSpec = {
  /** Mount capability to bind into the slice. */
  cap: MountCap;
  /** Path inside the slice where the mount appears. */
  innerPath: string;
  /** Mount mode (`ro` by default). */
  mode?: MountMode;
};

/**
 * Rootfs selector for the slice. Either:
 * - a `Mount` capability rooted at a directory containing a userland tree,
 * - `{ kind: 'host-bind' }` to bind-mount the host's `/usr` / `/etc` /
 *   etc. read-only (the Flatpak pattern),
 * - `{ kind: 'minimal' }` for a backend-supplied empty / busybox rootfs,
 *   or
 * - `{ kind: 'oci', ref }` to materialise the slice from an OCI image
 *   reference (Phase 2; podman driver only).  The reference uses the
 *   transport / repo / tag form podman accepts directly, e.g.
 *   `docker.io/library/alpine:3.19`.  The driver pulls the image into
 *   the user's container storage on first use; the bwrap driver
 *   rejects `oci` rootfs with a structured error.
 */
export type RootfsSpec =
  | MountCap
  | { kind: 'host-bind' }
  | { kind: 'minimal' }
  | { kind: 'oci'; ref: string };

// ---------------------------------------------------------------------------
// Seccomp policy
// ---------------------------------------------------------------------------

/**
 * Seccomp policy for the slice.
 *
 * - `'default'`     — backend-default profile (podman/docker default-deny).
 * - `'unconfined'`  — disable seccomp entirely (escape hatch).
 * - `{ profile }`   — caller-supplied profile blob (BPF JSON or similar);
 *                     the shape is backend-specific and is opaque to the
 *                     factory.
 */
export type SeccompPolicy = 'default' | 'unconfined' | { profile: unknown };

// ---------------------------------------------------------------------------
// Slice construction
// ---------------------------------------------------------------------------

/**
 * Options accepted by `SandboxFactory.make()`. Many fields are optional;
 * the factory applies safe defaults (network 'none', seccomp 'default',
 * read-only mounts) when omitted.
 */
export type SandboxMakeOpts = {
  rootfs: RootfsSpec;
  mounts?: MountSpec[];
  network?: NetworkProfile;
  backend?: BackendSelector;
  seccomp?: SeccompPolicy;
  env?: Record<string, string>;
  cwd?: string;
  /**
   * Resource caps applied via `prlimit` (Phase 1.5+).  Unset values
   * fall back to the driver-default table; see
   * `src/limits.js#DEFAULT_LIMITS`.
   */
  limits?: ResourceLimits;
};

/**
 * Resource caps applied to the slice's first process (and inherited
 * by every descendant).  Each key matches a `prlimit` long flag.
 */
export type ResourceLimits = {
  /** RLIMIT_AS — virtual memory bytes. */
  as?: number;
  /** RLIMIT_CPU — wallclock seconds. */
  cpu?: number;
  /** RLIMIT_NPROC — max processes per uid. */
  nproc?: number;
  /** RLIMIT_NOFILE — open file descriptors. */
  nofile?: number;
  /** RLIMIT_FSIZE — bytes any single file the slice writes can grow to. */
  fsize?: number;
  /** RLIMIT_CORE — core dump size cap (defaults to 0). */
  core?: number;
};

/**
 * Spec passed to a `SandboxDriver` after the factory has resolved every
 * `Mount` capability to a host path. Drivers never see Endo capabilities
 * directly — the factory is the single mediator that performs cap-to-path
 * resolution.
 */
export type SliceSpec = {
  /** Resolved rootfs source. `null` denotes the host-bind / minimal case. */
  rootfs:
    | { kind: 'host-bind' }
    | { kind: 'minimal' }
    | { kind: 'mount'; hostPath: string; mode: MountMode }
    | { kind: 'oci'; ref: string };
  /** Resolved bind-mount triples. */
  mounts: Array<{ hostPath: string; innerPath: string; mode: MountMode }>;
  /** Writable scratch host path provided by the daemon's scratch service. */
  scratchHostPath: string;
  /** Network policy. */
  network: NetworkProfile;
  /** Seccomp policy. */
  seccomp: SeccompPolicy;
  /**
   * Optional precompiled BPF blob the driver can load via the
   * backend's seccomp facility (e.g. `bwrap --seccomp <fd>`).
   * Populated only when `seccomp` was `{ profile: <Buffer> }`; the
   * factory does not compile JSON profiles itself in Phase 1.
   */
  seccompProfile?: Uint8Array;
  /** Environment variables for the slice's `init` / first child. */
  env: Record<string, string>;
  /** Initial cwd inside the slice. */
  cwd?: string | undefined;
  /**
   * Resolved resource caps (defaults merged in by the factory).
   * Drivers translate this into `prlimit` argv before bwrap exec.
   */
  limits?: ResourceLimits;
};

// ---------------------------------------------------------------------------
// Spawn options
// ---------------------------------------------------------------------------

/** Reader / writer references — Endo's existing stdio plumbing. */
export type ReaderRef = ERef<unknown>;
export type WriterRef = ERef<unknown>;

/**
 * Per-spawn options passed to `SandboxHandle.spawn()`.
 */
export type SpawnOpts = {
  /** Per-spawn environment overrides, merged on top of the slice's env. */
  env?: Record<string, string>;
  /** Per-spawn cwd; falls back to the slice's cwd. */
  cwd?: string;
  /** Attach an existing reader as stdin. */
  stdin?: ReaderRef;
  /** Capture stdout via a `WriterRef`. Defaults to true. */
  captureStdout?: boolean;
  /** Capture stderr via a `WriterRef`. Defaults to true. */
  captureStderr?: boolean;
};

// ---------------------------------------------------------------------------
// Capability shapes
// ---------------------------------------------------------------------------

/**
 * Root capability minted by the plugin's `make-unconfined` entry point.
 * Mints individual sandbox slices.
 */
export type SandboxFactory = FarRef<{
  /** Discoverability — describe the factory or one of its methods. */
  help(methodName?: string): string;
  /** Probe each registered driver and return the results. */
  listBackends(): Promise<BackendProbe[]>;
  /** Mint a new sandbox slice. */
  make(opts: SandboxMakeOpts): Promise<SandboxHandle>;
}>;

/**
 * A live sandbox slice. Pinned by the formula that minted it; when the
 * handle is dropped, every `ProcessHandle` it spawned is killed and every
 * `MountHandle` it minted is unmounted before the driver tears down the
 * underlying namespace / container.
 */
export type SandboxHandle = FarRef<{
  help(methodName?: string): string;
  spawn(argv: string[], opts?: SpawnOpts): Promise<ProcessHandle>;
  mount(
    cap: MountCap,
    innerPath: string,
    mode?: MountMode,
  ): Promise<MountHandle>;
  /** Mint an ephemeral, slice-lifetime scratch mount at `innerPath`. */
  scratch(innerPath: string): Promise<MountHandle>;
  /** Open a single file inside the slice as a `ReadableFile`-shaped cap. */
  open(innerPath: string): Promise<ERef<unknown>>;
  /**
   * Mint a nested sub-slice. Phase 0–2 stubs return a structured
   * `notImplemented` error; Phase 3 lands the real implementation behind
   * a kernel-feature probe.
   */
  fork(opts?: SandboxMakeOpts): Promise<SandboxHandle>;
  /** Tear down processes and ephemeral scratch, keeping mounts. */
  reset(): Promise<void>;
  /** Full teardown — all processes killed, all mounts released. */
  dispose(): Promise<void>;
}>;

/**
 * A process running inside a slice. Stdio uses Endo's existing
 * `reader-ref` / `writer-ref` plumbing — there is no JSON transcoding of
 * process bytes.
 */
export type ProcessHandle = FarRef<{
  help(methodName?: string): string;
  /** Pid as observed inside the slice's pid namespace. */
  pid(): number;
  /** Stdin writer (present only when the spawn kept stdin open). */
  stdin(): WriterRef;
  /** Stdout reader (present when `captureStdout` was true). */
  stdout(): ReaderRef;
  /** Stderr reader (present when `captureStderr` was true). */
  stderr(): ReaderRef;
  /** Resolves when the process exits. */
  wait(): Promise<{ code: number | null; signal: string | null }>;
  /** Send `signal` (or `SIGTERM`) to the process. */
  kill(signal?: string | number): Promise<void>;
}>;

/**
 * A mount bound into a slice. Holds the original `Mount` capability so
 * the inner path can be related back to the cap it came from.
 */
export type MountHandle = FarRef<{
  help(methodName?: string): string;
  /** Path inside the slice where the mount appears. */
  innerPath(): string;
  /** Back-reference to the original `Mount` capability. */
  cap(): MountCap;
  /** Effective mount mode (`ro` or `rw`). */
  mode(): MountMode;
  /** Detach the mount from the slice. */
  unmount(): Promise<void>;
}>;

// ---------------------------------------------------------------------------
// Backend driver adapter
// ---------------------------------------------------------------------------

/**
 * Driver-side process handle returned by `SandboxDriver.spawn()`. The
 * factory wraps these in `reader-ref` / `writer-ref` adapters before
 * exposing them through `ProcessHandle`.
 */
export type DriverProcess = {
  pid: number;
  stdin?: AsyncIterable<Uint8Array> | null;
  stdout?: AsyncIterable<Uint8Array> | null;
  stderr?: AsyncIterable<Uint8Array> | null;
  wait(): Promise<{ code: number | null; signal: string | null }>;
  kill(signal?: string | number): Promise<void>;
};

/**
 * Opaque per-slice context the driver returns from `prepareSlice`. The
 * factory passes it back to every subsequent driver call for the same
 * slice and finally to `teardown`.
 */
export type DriverSliceContext = unknown;

/**
 * Adapter the plugin loads at startup to translate `SandboxHandle`
 * operations into a particular runtime (bwrap, podman, lima, etc.).
 *
 * Drivers do **not** receive Endo capabilities directly: the factory
 * resolves each granted `Mount` to a host path and hands the driver
 * plain `{ hostPath, innerPath, mode }` triples in `SliceSpec`.
 */
export type SandboxDriver = {
  /** Stable name (matches `BackendName`). */
  name: BackendName;
  /** Best-effort availability check. */
  probe(): Promise<Omit<BackendProbe, 'name'>>;
  /** Materialise a slice from a fully-resolved `SliceSpec`. */
  prepareSlice(spec: SliceSpec): Promise<DriverSliceContext>;
  /** Spawn a process inside a previously-prepared slice. */
  spawn(
    slice: DriverSliceContext,
    argv: string[],
    opts: SpawnOpts,
  ): Promise<DriverProcess>;
  /** Tear down the slice's namespace / container. */
  teardown(slice: DriverSliceContext): Promise<void>;
};

// ---------------------------------------------------------------------------
// Plugin powers
// ---------------------------------------------------------------------------

/**
 * Powers the `make-unconfined` entry point hands to `makeSandboxFactory`.
 *
 * Phase 0 only required `provideScratchMount`. Phase 1 adds
 * `provideHostPath`, the privileged operation that turns a `Mount`
 * capability into a host filesystem path so the driver can issue a
 * bind-mount.
 *
 * Cap-to-path resolution is the *only* privileged operation the factory
 * performs; drivers never see Endo capabilities directly. Phase 1.5+
 * will wire `provideHostPath` to the daemon's mount-resolution power
 * (`packages/daemon/src/mount.js` already tracks the host path of every
 * `Mount` it mints).  Until that wiring lands, callers that intend to
 * use `Mount`-backed mounts must supply a `provideHostPath` themselves
 * (the test stub in `test/bwrap.test.js` is the canonical example).
 *
 * The factory deliberately does **not** receive the daemon's host-paths
 * power directly. All host-path access is mediated through `Mount`
 * capabilities the caller hands in, which `provideHostPath` then
 * resolves on the factory's behalf.
 */
export type SandboxPowers = ERef<{
  /** Mint a writable scratch mount. */
  provideScratchMount(petName: string): Promise<MountCap>;
  /**
   * Resolve a `Mount` capability to a host filesystem path. The
   * factory calls this for every granted mount before assembling the
   * driver's `SliceSpec`.  Throws a structured error if the mount cap
   * does not name a directory the daemon can resolve.
   *
   * This is the privileged operation that bridges the Endo capability
   * graph and the kernel's bind-mount surface.  Drivers never call
   * this — only the factory does.
   */
  provideHostPath(cap: MountCap): Promise<string>;
}>;

/**
 * Inputs to the factory constructor.
 */
export type MakeSandboxFactoryInput = {
  /** Registered drivers (empty in Phase 0). */
  drivers: SandboxDriver[];
  /** Powers used to mint the writable scratch upper layer. */
  scratchProvider: SandboxPowers;
};
