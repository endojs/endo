## Design Endo Posix Sandbox Plugin

- [x] review the "Responses to Open Questions" below
- [x] integrate into and evolve our "Research Notes: Sandboxed POSIX Slice as an Endo Capability"
- [x] into a concrete `PLAN/` document for along the lines of "Suggested implementation phasing" near the end of file

The consolidated, opinion-bearing plan now lives at
[`PLAN/endo_posix_sandbox.md`](../PLAN/endo_posix_sandbox.md).
That document captures:

- the resolved decisions corresponding to each operator answer below
  (pure-Node plugin / "require installed" tooling, BYO rootfs, three
  named network profiles with `private` as the recommended default,
  nested slices in scope, genie-as-workspace primary integration,
  familiar deferred, Linux-only CI for v1),
- the full capability surface (`SandboxFactory`, `SandboxHandle`,
  `ProcessHandle`, `MountHandle`) as a sketch for Phase 0 to formalise
  into `M.interface()` guards,
- the `SandboxDriver` adapter shape and the four in-scope drivers
  (`bwrap`, `podman`, `lima`, `wsl`),
- cross-cutting concerns: backend probing, stdio bridging via existing
  `reader-ref` / `writer-ref`, cap-not-string mounts, GC anchored on
  the handle's formula, network profile semantics, nested-slice
  prereqs, and the `make-unconfined` plugin shape mirroring `lal` /
  `jaine` / the networks plugin,
- a six-phase implementation plan (0: interface design,
  1: bwrap on Linux, 1.5: bwrap hardening, 2: podman, 3: macOS via
  lima, 4: Windows via WSL2, 5: nested slices + Apple
  containerization, 6: focused tools & renderer integration),
- the genie integration shape (sandbox-as-workspace, existing
  `bash`/`exec`/`git` tools spawn through the slice unchanged
  externally),
- familiar follow-up notes for renderer reach,
  `endo-sandbox-stdio:` protocol scheme, distribution-shipped
  rootfs, and cross-OS CI,
- a small set of secondary open questions deferred to the relevant
  phase (default seccomp profile, egress filter mechanism, long-lived
  guest VM lifecycle, cgroup v2 delegation prerequisites).

The research notes below are retained as the longer reference for
backends and approaches we considered but are deferring; the PLAN
document is the authoritative source from this point on.

---

## Responses to Open Questions

Blockquotes in this section cite open question from the first pass of research,
responses are bullet points following each quote.

### 1. **Native helper appetite.**

> Bwrap is C; podman is Go; WSL is Win32.
> Do we want the Endo plugin to be allowed to depend on a binary
> per platform (and if so, ship-with vs. require-installed)?
> Or do we want a pure-Node plugin that fails fast when its
> external tool is missing?
- pure node plugin is where to start, go with "require installed"

### 2. **Rootfs distribution.**

> Are we OK with shipping a minimal rootfs tarball (Alpine ≈ 5 MB,
> busybox ≈ 1 MB) inside Endo, or should every consumer BYO?
- for now, avoid shipping a rootfs tarball, just BYO
- eventually, distributions like the `@endo/familiar` electron chat app may
  choose to add such things to their build

### 3. **Networking policy default.**

> "No network" is the safest default but breaks `git clone` etc.
> Do we want the default to be "loopback only," "host network with
> read-only DNS," or "private NAT'd net via pasta/slirp4netns"?
- the base case should be fully isolated "no network"
- but we should ship a more functional default of "private NAT, no access to
  RFC 1918 addresses, and especially, no access upwards onto the host machine's
  loopback"
- any endowment of access to LAN surface area, host loopback, and such must be
  explicit by the consumer/caller

### 4. **Multi-tenant slice nesting.**

> Should `SandboxHandle.fork()` be a real feature, i.e. nested
> user namespaces?
> Linux supports it but with surprises (uid_map size limits,
> `/proc/sys/user/max_user_namespaces`).
> Useful for "agent spawns a sub-agent in its own slice" patterns.
- yes very much so we want this

### 5. **Genie integration shape.**

> Should the genie tool registry get a first-class
> `sandbox.spawn`/`sandbox.exec` tool, or should we model the
> sandbox as a *workspace* and let the existing `bash`/`exec`
> tools target it transparently?
> The latter is more uniform but pushes complexity into the
> workspace abstraction.
- so the primary use case we've got in mind, is very much to isolate an entire genie's workspace
- but also focused sandbox tools as described may be useful eventually

### 6. **Familiar / Electron interaction.**

> Familiar already has `exfiltration-defense.js` and a `navigation-guard.js`.
> Should the sandbox plugin be reachable from the Electron
> renderer at all, or strictly from worker-side code?
> If reachable, does the `protocol-handler` need a new scheme to
> stream sandboxed-process stdio into a webview?
- any integration into the familiar / electron app is out of initial scope, we're starting with genie as noted in prior section
- leave design notes in a follow up `PLAN/` document for eventual familiar work and usage

### 7. **CI footprint.**

> Tests for this plugin will need bwrap/podman/lima/wsl in CI.
> Are we OK with Linux-only CI for the sandbox plugin and manual
> smoke-tests on macOS/Windows, or do we need a cross-OS matrix?
- start with Linux only CI for now, yes
- macOS and windows test matrix can be scoped alongside familiar chat app integration, per prior section

---

## Research Notes: Sandboxed POSIX Slice as an Endo Capability

### Goal

Expose a "slice of a POSIX-like system" — a confined process namespace,
filesystem view, and (optionally) network — as one or more capabilities
delivered through Endo's CapTP graph.
Typical consumers: a Genie agent that wants `bash`/`git`/`python` without
compromising the host;
a build sandbox for `lal`/`bundle-source`;
an exfiltration-resistant scratchpad mounted by the familiar shell.

### What "capability" means here

The plugin should expose, at minimum, an `Exo` with a guarded interface
something like (sketch — not for implementation yet):

```
SandboxInterface {
  help()              -> string
  spawn(argv, opts)   -> ProcessHandle      // exec inside the slice
  mount(hostPath, …)  -> MountHandle        // bind-mount host path in
  scratch(name)       -> MountHandle        // ephemeral scratch dir
  open(innerPath)     -> ReadableFile       // file capability
  fork(opts)          -> SandboxHandle      // nested sub-slice
  reset() / dispose() -> Promise<void>
}
```

The slice itself becomes a formula, GC-pinned by its handles.
Stdio is brokered as Endo `reader-ref` / `writer-ref` streams so a Genie
tool can pipe into a process across CapTP without the daemon shoveling
bytes through a JSON channel.

The slice's filesystem can compose with existing Endo storage:
`Mount` and `ScratchMount` already mediate daemon-side filesystem access
and could back the sandbox's writable layers.

Backend selection — podman, bwrap, namespaces, lima, WSL2, etc. — is
what the rest of this document explores.
A driver interface ("provide me a confined `argv` runner with these
mounts") lets one capability surface spawn backends.

---

## Linux

Options ordered roughly heaviest-to-lightest, with trade-offs.

### A. Rootless Podman (or Docker rootless)

What it is: a full OCI runtime stack
(`podman` → `crun`/`runc` → kernel namespaces) running as the user.
Uses `/etc/subuid`+`/etc/subgid` ranges via `newuidmap`/`newgidmap`
(setuid helpers from `shadow-utils`).

- **Isolation primitives**: user, mount, pid, net, ipc, uts, cgroup
  namespaces; cgroup v2 for resource limits; seccomp profile;
  capabilities drop; rootless networking via `slirp4netns` or `pasta`.
- **Storage**: `fuse-overlayfs`, or native overlayfs on kernels ≥ 5.11
  with the rootless overlay patch (Ubuntu has carried this for a while,
  upstream landed in 5.13+).
- **Image story**: full OCI — pull, tag, layer caching for free.

**Pros**
- Battle-tested, large ecosystem of base images.
- `podman machine` ports the same UX to macOS/Windows.
- Self-contained: a process tree, a writable layer, a network namespace
  all wrapped up.

**Cons**
- Heavy install footprint
  (podman + crun + slirp4netns + fuse-overlayfs).
- Requires `/etc/subuid`/`/etc/subgid` allocations; not always present
  on minimal distros or some sysadmin-locked machines.
- `cgroup v2` only — older systems force fallbacks.
- First-spawn latency (image extract, network setup) is in the seconds.

**Endo fit**
- Plugin shells out to `podman` via `child_process`.
- Each sandbox formula = one container; `dispose()` runs `podman rm -f`.
- File mounts via `--mount type=bind,...`.
  Volumes back to Endo `Mount` / `ScratchMount` paths.

References:
- <https://docs.podman.io/en/latest/markdown/podman-run.1.html>
- <https://rootlesscontaine.rs/>

### B. Bubblewrap (`bwrap`)

What it is: the sandbox engine Flatpak uses.
A small C tool that forks, sets up namespaces and a custom mount tree,
applies seccomp, and execs an inner command.

- **Isolation**: same kernel primitives as podman, but `bwrap` does
  not manage images, networks, or persistent state — you provide the
  rootfs layout (typically by bind-mounting host directories).
- Runs unprivileged on any kernel with user namespaces enabled
  (the default since ~Ubuntu 14.04 / Fedora 25).

**Pros**
- One small binary; no daemon, no image store.
- Sub-100ms startup.
- Composable: easy to construct ad-hoc sandboxes from Endo `Mount`
  capabilities (just bind-mount each granted path).

**Cons**
- No image format — you bring your own root filesystem
  (or share host `/usr` read-only and overlay scratch on top, the
  Flatpak pattern).
- Networking is "share host net" or "no network" by default; you'd
  pair it with `slirp4netns` or `pasta` yourself for a private netns.
- No native cgroup management; resource limits via `prlimit`/`systemd-run`.

**Endo fit — strongest candidate for v1**
- A *minimal* sandbox is essentially: pick mounts → invoke `bwrap`
  → return process handle.
- Maps cleanly onto an Endo plugin `make(powers)` that owns just
  `child_process.spawn` and a few host paths.

References:
- <https://github.com/containers/bubblewrap>
- <https://docs.flatpak.org/en/latest/sandbox-permissions.html>

### C. `crun` / `runc` directly

What it is: an OCI runtime invoked with a `config.json` + rootfs.

- Lower-level than podman, no image manager, no networking glue.
- `crun` is faster, written in C; `runc` is Go-based, runs Docker.
- Useful if we want podman's *sandbox* without podman's *daemon-ish*
  behaviour (storage drivers, image cache).

**Pros**
- Strict OCI config => portable across runtimes.
- Smaller surface than podman.

**Cons**
- We'd reimplement what podman does on top: subuid mapping,
  rootfs assembly, network setup, cleanup.
- Most of the value of OCI compatibility is the image ecosystem,
  which we'd lose without a puller.

**Verdict**: not worth it unless we want to *build* a podman replacement.
Skip for v1.

### D. systemd-nspawn / portable services

What it is: systemd's own container manager.

- `systemd-nspawn --user-ns-mode=pick` works rootless on recent systemd.
- Integrates with `machinectl`, `systemd-run --scope --user`.

**Pros**
- Available wherever systemd is.
- Great cgroup/journal integration if we already speak systemd.

**Cons**
- Tightly couples Endo to systemd — no good on Alpine, BSDs,
  embedded.
- Less portable than podman/bwrap, less momentum than bwrap in
  unprivileged use.

**Verdict**: nice-to-have backend; not the default.

### E. Direct namespace + capability syscalls (`unshare`, `clone3`, `pivot_root`, …)

What it is: doing what `bwrap`/`crun` do, by hand, from a small
native helper.

- `unshare(CLONE_NEWUSER|CLONE_NEWNS|CLONE_NEWPID|CLONE_NEWNET|
  CLONE_NEWIPC|CLONE_NEWUTS|CLONE_NEWCGROUP)`
- Write `/proc/self/uid_map` and `/proc/self/gid_map` (or shell out
  to `newuidmap`/`newgidmap` for >1 ID mapping).
- `pivot_root` into the new rootfs;
  recursively bind-mount, remount-ro, etc.
- `prctl(PR_SET_NO_NEW_PRIVS, 1)`;
  install a seccomp-bpf filter via `seccomp(2)`.
- Optionally a Landlock ruleset on top for path-allowlist enforcement.

**Pros**
- Zero external dependencies — everything is a syscall.
- Tightest possible control;
  can co-exist with Endo's existing process model exactly.
- Future-proof against package availability shifts.

**Cons**
- *Lots* of edge cases: capabilities-fs interactions,
  procfs masking, /dev/pts, cgroup v2 delegation,
  Linux-version-specific quirks (kernel ≥ 5.x landmarks for
  unprivileged overlayfs, idmapped mounts, etc.).
- Needs a native helper — Node's `child_process` won't expose
  `clone3` directly.
  Plausible languages: C, Rust, Go, or via `node-ffi`/N-API.
- We'd be reimplementing parts of bwrap.
  bwrap is ~5 KLOC of C with years of bug fixes — that's a *lot*
  of yak to shave for marginal benefit.

**Verdict**: defer. Worth revisiting only if (a) bwrap turns out to be
unavailable in some target environment, or (b) we want zero binary
deps for a single-file Endo distribution.

### F. Adjacent / orthogonal hardening

These don't replace a backend — they layer on whichever we pick.

- **Landlock LSM** (kernel 5.13 baseline; ABI v3 in 6.1; ABI v4 in 6.7;
  `LANDLOCK_ACCESS_NET_*` in 6.7).
  Per-process pathwise allow-list.
  Compose with bwrap to lock down what an *inner* process can reach
  even if the namespace setup misses something.
  <https://landlock.io/>
- **seccomp-bpf**.
  Install a syscall allow/deny filter.
  Default-deny is hard (you'll break libc); start by denying the
  classic unsafe set (`mount`, `keyctl`, `bpf`, `add_key`, `kexec_*`,
  `perf_event_open`, `unshare`, …) — same list podman/docker use.
- **Capabilities**: drop everything you don't need;
  `cap_setpcap` in particular.
  In a user namespace you start with caps in that ns only, but
  belt-and-braces is cheap.
- **prlimit / cgroup v2** for resource caps (rss, cpu, pids, io).
- **`PR_SET_NO_NEW_PRIVS`** mandatory before exec.

### G. Less serious options (mention to dismiss)

- **chroot alone** — not a security boundary; only namespace + chroot
  is safe.
- **Firejail** — setuid binary; carries CVE history;
  fine as a desktop tool, not great as an embedded daemon dependency.
- **gVisor (`runsc`)** — userland kernel; very strong isolation but
  perf cost is significant and it's another big dep.
  Could plug in later as an alt OCI runtime under podman.
- **Kata Containers** — full VM under the OCI surface;
  belongs in the "VM" tier alongside lima.

---

## Recommendation for Linux

A two-tier driver, both behind the same `SandboxInterface`:

1. **`bwrap` driver** as the default.
   Cheap to spawn, no daemon, no image cache, composes naturally with
   existing Endo `Mount` capabilities.
   Add Landlock + seccomp + caps drop on top.
   Network: start with "none" or "loopback only", add `pasta`-based
   private netns later.

2. **`podman` driver** for "I want a real distro userland" cases —
   cases where the consumer needs apt/dnf packages, full `/usr`,
   multi-process services, or wants to pull an OCI image.

Defer the direct-syscall approach.
Re-evaluate if/when bwrap becomes a problematic dependency.

---

## macOS

There is no `clone(2)` on Darwin.
Real POSIX-namespace isolation requires a Linux kernel.
The realistic choices are:

### A. Linux VM (lima / colima / podman-machine / OrbStack)

- All four ultimately drive **Apple's `Virtualization.framework`**
  (or QEMU on older macOS) to run a Linux VM, then run a Linux
  container *inside* that VM.
- File sharing: virtiofs in modern lima / OrbStack — fast and
  POSIX-correct enough.
  9P is the older fallback.
- Networking: VM gets its own NAT'd interface; port forwarding
  via SSH tunnels or VM-native mechanisms.

**Pros**
- Identical kernel semantics to native Linux — same code paths
  in our plugin, modulo "is the daemon talking to a remote
  process or local?"
- Cross-platform: same plumbing works on Windows-via-WSL2 and
  macOS-via-lima.

**Cons**
- VM-tier resource cost (RAM allocation, disk image).
- Boot time on cold start.
- File-sharing semantics drift — case-sensitivity, fsync,
  inotify behaviour.

**Endo fit**: SSH or WS-CapTP into the guest;
the daemon runs the bwrap/podman driver *inside* the guest;
the host-side capability is a thin proxy.
This composes well with Endo's existing peer-formula machinery.

### B. Apple `Containerization.framework` (macOS 15+, "Apple Container")

- Apple open-sourced this in 2025 (`apple/containerization` and
  `apple/container` on GitHub).
- Effectively: one Linux microVM per container, OCI image support,
  the host driver is Swift on top of Virtualization.framework.
- Designed to make container-per-VM fast enough that it competes
  with Docker Desktop on launch latency.
- **macOS 15 minimum.**

**Pros**
- First-party. Long-term direction Apple is pointing at.
- Per-container microVMs is *better* isolation than rootless podman.

**Cons**
- macOS 15 minimum; many users still on 13/14.
- Newer surface; APIs and tooling will churn for a few releases.

**Endo fit**: same shape as the Linux-VM case but with a more native
control plane.
Worth a placeholder driver once we can require macOS 15.

### C. `sandbox-exec` / Apple Sandbox (`Sandbox.framework`, "Seatbelt")

- The same TrustedBSD-MAC sandbox that backs the App Sandbox.
- Profile language is officially private/undocumented;
  `sandbox-exec(1)` has been "deprecated" since macOS 10.8 but
  still ships and still works (it's load-bearing for system stuff).
- Profiles are S-expressions specifying syscall and path
  allow/deny rules.

**Pros**
- Native, no VM overhead.
- Good for hardening *individual native processes*.

**Cons**
- Not a process-namespace container — you don't get an isolated
  PID space, mount tree, or network stack.
- Private API ⇒ unstable across macOS releases.
- Doesn't give you a "POSIX slice" in the sense the task asks for;
  it gives you "a more locked-down version of the host POSIX
  environment."

**Endo fit**: defense-in-depth wrapper around a native macOS process,
not a primary backend.
Possibly useful for the daemon worker itself.

### D. Other Darwin pieces (mostly: don't bother)

- **Endpoint Security framework** — monitoring/auditing only,
  not enforcement.
- **chroot** — trivially escapable on Darwin too.
- **App Groups / entitlements** — about *signed app* identity,
  not arbitrary process confinement.

### Recommendation for macOS

- v1: lima (or colima — lima with podman/docker preconfigured)
  driving the Linux backend over SSH/WS.
  Document the install dependency clearly.
- v1.5: optional `Containerization.framework` driver gated on
  macOS 15+ — same SandboxInterface, faster cold start.
- Use `sandbox-exec` opportunistically as an *additional* layer
  around Endo's own native processes (not the primary slice
  mechanism).

---

## BSD (research-only, not in v1)

Not in scope for the first cut, but worth knowing what exists:

### FreeBSD `jail(8)` + VNET

- Strong, well-tested isolation primitive — predates Linux
  containers by ~15 years.
- VNET gives a private network stack; ZFS gives copy-on-write
  layers; `pot` and `cbsd` are higher-level managers.
- Capsicum (`cap_enter`, `cap_rights_limit`) is FreeBSD's
  capability-mode for finer-grained per-process restriction —
  conceptually closer to Endo's own model than namespaces are.

**Endo fit if we ever care**: a FreeBSD-only driver paralleling
the Linux one, mapping `SandboxInterface.spawn()` onto a jail.

### OpenBSD `pledge(2)` / `unveil(2)`

- Per-process syscall promise + filesystem unveil.
- Not full containment — same kernel, same network stack;
  what it gives is an aggressive narrowing of *this process'*
  authority.
- Like macOS sandbox-exec, this is a hardening layer, not a slice.

### illumos zones

- Same lineage as FreeBSD jails; SmartOS is the obvious target.
  Tooling exists but our user base here is approximately zero.

---

## Windows

### A. WSL2 — the obvious answer

- WSL2 is, mechanically, a Linux VM under Hyper-V with deep
  Win32 integration.
- `wsl.exe --install -d <distro>`,
  `wsl --import <name> <dir> <tarball>`,
  `wsl --terminate <name>` give us programmatic distro creation.
- Each registered distro is essentially a separate Linux instance;
  inside one, we can do bwrap/podman as on native Linux.

**Pros**
- Cheapest path to "real Linux semantics on Windows."
- Same in-guest plumbing as our Linux backend → same driver code.
- File interop via `\\wsl$\` works, with caveats.

**Cons**
- Requires WSL2 installed — not always on locked-down Windows boxes.
- File-share semantics get weird at the boundary (case sensitivity,
  metadata).
- Networking changed substantially in WSL2;
  expect to revisit when WSL adds a new mode (the "mirrored networking"
  shift was painful for some tooling).

**Endo fit**: same as macOS-via-lima — ssh/CapTP into the WSL2
distro, run the Linux backend inside.

### B. Windows Sandbox

- Hyper-V-based ephemeral *Windows* desktop.
- Configured with `.wsb` XML files.
- It's an isolated Windows, not a POSIX slice — wrong shape for
  this task.

### C. Hyper-V Containers / Windows Containers

- For Windows Server workloads;
  Linux Containers on Windows (LCOW) was mostly subsumed by WSL2.
- Not our path.

### D. Native Windows confinement (mention for completeness)

- **Job Objects** — process-tree resource and lifetime control.
- **AppContainer + Capability SIDs** — UWP-style sandboxing,
  also used by Edge content processes;
  fine-grained but Windows-API-shaped, not POSIX-shaped.
- **Integrity Levels / SRP / WDAC** — policy layer, not isolation.
- **Cygwin / MSYS2** — POSIX *emulation* on Win32; not sandboxing.

**Verdict**: WSL2 it is.

---

## Cross-cutting concerns

These affect the plugin design regardless of backend.

### 1. Backend probe & capability advertisement

The plugin should detect at startup which backends are usable on this
host (which binaries exist; which kernel features are enabled;
whether `/etc/subuid` has us; whether `bwrap --version` works;
whether `lima` is installed; whether `wsl.exe` exists) and surface
that as a `listBackends()` capability.
Callers can then pin a backend or accept the default.

### 2. Stdio bridging

Existing Endo plumbing has `reader-ref` / `writer-ref` already.
Process stdio (stdin/stdout/stderr) should be exposed as
`ReaderRef`/`WriterRef` on the returned `ProcessHandle` so that
Genie tools, the familiar shell, and remote agents can stream
without the daemon transcoding bytes through CapTP.

### 3. File capabilities ↔ host paths

Pattern: a sandbox is constructed with a list of granted `Mount`
capabilities (read or read-write).
The plugin resolves each `Mount` to a host path and bind-mounts it
into the slice.
This means **the sandbox inherits Endo's confinement model** —
the inner process can only see filesystem the caller has explicitly
shared as capabilities.

### 4. Rootfs source

For bwrap we need a base rootfs.
Options:
- Bind-mount the host's `/usr`, `/etc/{ld.so.conf,resolv.conf}`,
  etc. (the Flatpak pattern).
- Ship a minimal rootfs tarball as an Endo formula.
- Pull from an OCI registry via `skopeo` (small dep, no daemon).

Probably want all three, in priority order: minimal-rootfs-formula
(most reproducible) → host-bind (most ergonomic) → OCI pull
(when we want Debian or Alpine specifically).

### 5. Garbage collection

Sandbox formulas should pin: the rootfs they used, any granted
mounts, and (by reference) the running process if any.
On unpinning: kill processes, unmount, remove scratch layer.
Already aligns with how `mount.js` and `worker-node-powers.js` clean
up.

### 6. Plugin shape in Endo

A `make-unconfined` formula loaded from the daemon (worker hosts
the JS, uses `child_process` to drive the backend binary).
Powers needed:
- `process.spawn` (or a narrower "spawn this allow-listed binary"
  power),
- read access to a specific config dir (where rootfs / images live),
- writable scratch path (already covered by `provideScratchMount`).

This is broadly the same shape as the existing networks plugin
(`networks/libp2p.js` etc.) — small unconfined module, large
external dep, returns an `Exo` to the daemon.

### 7. Security boundary clarity

The capability surface should make it hard to *accidentally*
broaden the sandbox.
In particular:
- `mount(hostPath, …)` should require a `Mount` capability,
  not a string path — otherwise the sandbox plugin becomes
  a confused-deputy escape hatch from Endo's confinement.
- A "host-paths" power exists in some shape on the daemon side
  for bootstrapping; the sandbox plugin should *not* receive
  that power transitively.

---

## Suggested implementation phasing (for the eventual code task)

Phase 0 — **driver interface design**
- Sketch `SandboxInterface` exo + the `Backend` adapter shape
  (no production code, just types and a stub).

Phase 1 — **bwrap driver on Linux**
- Detection, spawn, mounts from `Mount` capabilities, stdio
  bridging, basic seccomp + no-new-privs.
- ScratchMount for the writable layer.

Phase 2 — **podman driver**
- Same interface, OCI image support, network namespace.

Phase 3 — **macOS via lima**
- Reuse Linux drivers inside the VM; thin host proxy.

Phase 4 — **Windows via WSL2**
- Same as Phase 3 but driving `wsl.exe`.

Phase 5 — **hardening passes**
- Landlock allowlist on Linux ≥ 5.13.
- seccomp profile review.
- Optional `sandbox-exec` wrap for the macOS host-side daemon
  worker itself.
- Apple `Containerization.framework` driver as macOS 15+ fast path.

---

## Initiator Prompt

> We're researching how to write an Endo plugin that can provide a sandboxed
> slice of a posix-like system as a capability or set of capabilities.
> 
> - I think I want to start out supporting Linux, using unprivileged podman containers
> - but maybe I want wield the Linux subuid / namespace / etc APIs directly instead?
> - MacOS and Windows, we can plan to just use a Linux VM for now, but maybe give
>   me research notes about similar darwin/bsd-native or windows-native
>   containment APIs or tools?
> 
> - [x] research and layout options here in this task for now, write no code
