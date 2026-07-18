# cap-std-watch: capability-scoped directory watching

| | |
|---|---|
| **Created** | 2026-07-18 |
| **Updated** | 2026-07-18 |
| **Author** | Kriscendo Bot (prompted by Kris Kowal) |
| **Status** | Proposed |
| **Tracks** | [endojs/endo-but-for-bots#606](https://github.com/endojs/endo-but-for-bots/issues/606) |

## Prompt

> Let's explore producing our own watcher bindings to augment cap-std
> within this repository, e.g. `cap-std-watch`.
> — kriskowal, [#606 comment](https://github.com/endojs/endo-but-for-bots/issues/606#issuecomment-5010290143)

## What is the Problem Being Solved?

On the Rust/XS supervisor, `FilePowers.watchDirectory`
(`packages/daemon/src/bus-manager-rust-xs-powers.js`) is a
graceful-degradation **stub**: it returns an immediately-closed diff
stream, so `EndoMount.followNameChanges` yields its initial snapshot and
then ends cleanly instead of delivering live add/remove/replace events.
On the Node host (`manager-node-powers.js`, and the go supervisor via
`worker-go-powers.js`) `watchDirectory` is backed by `fs.watch`.

Issue #606 established *why* the stub is currently the honest answer: the
Rust powers resolve every filesystem operation through a
`cap_std::fs::Dir` capability, and cap-std deliberately exposes **no**
watch surface, while the obvious off-the-shelf watcher — the `notify`
crate — accepts **only** an ambient `&Path`. Feeding `notify` a path
recovered from the confined `Dir` would break confinement; that is the
whole reason the stub exists.

This document explores whether we can close that gap with **our own
bindings** rather than a general-purpose watcher — a small
`cap-std-watch` layer that watches a *directory the process already holds
as a capability*, never a path it re-resolves from ambient authority.
The goal is a design and a feasibility verdict, not an implementation
commitment.

## Key Insight: the confined dirfd is already in hand

The blocker in #606 is framed around `notify` / `inotify_add_watch`,
both of which are **path-anchored**: you name a path string and the
kernel re-traverses it from the ambient root/cwd. That is irreconcilable
with cap-std.

But the Rust powers do not hold *paths* — they hold **open directory
capabilities**. In `rust/endo/xsnap/src/powers/fs.rs`, every directory
lives in `DIR_MAP` as a `cap_std::fs::Dir`, and `cap_std::fs::Dir`
implements `AsFd` / `AsRawFd` (Windows: `AsHandle` / `AsRawHandle`). So
at the moment we want to watch, we already possess the **open file
descriptor** (Unix) or **HANDLE** (Windows) for exactly the directory the
capability authorizes — with no path string anywhere in the call.

The question then becomes narrower and more tractable than "can cap-std
watch?": **which OS watch primitives anchor on an already-open
directory fd/handle** (capability-preserving) rather than on a path
(ambient)? It turns out each of the three target platforms has one:

| Platform | fd/handle-anchored primitive | Names the changed child? | Confinement |
|---|---|---|---|
| Linux | `fanotify_mark(fd, FAN_MARK_ADD, …, dirfd, NULL)` | Yes (`FAN_REPORT_DFID_NAME`) | Preserved — marks the dirfd, no path |
| macOS/BSD | `kqueue` + `EVFILT_VNODE` on the dirfd | No — coarse "dir changed" only | Preserved — registers the fd |
| Windows | `ReadDirectoryChangesW(HANDLE, …)` | Yes (`FILE_ACTION_*` + name) | Preserved — reads the handle |
| any | poll + `Dir::read_dir` diff (fallback) | Yes (by diffing snapshots) | Preserved — uses the `Dir` cap |

`fanotify_mark` is the crucial correction to the #606 framing: unlike
`inotify_add_watch`, it **is dirfd-relative**. Called with a `NULL`
pathname and `FAN_MARK_ADD`, it marks the object the `dirfd` itself
refers to — so it composes directly with `cap_std::fs::Dir::as_fd()`
with **no ambient path recovery**.

## Background the exploration turned up

### Linux fanotify is more viable than #606 concluded

Issue #606 correctly noted fanotify supports dirfd-relative marking and
gained directory-entry events (`FAN_CREATE` / `FAN_DELETE` / `FAN_MOVE`
/ `FAN_RENAME`) in Linux 5.1, but treated `CAP_SYS_ADMIN` as a hard
blocker. That blocker is no longer absolute:

- Since **Linux 5.13** (backported to 5.10.220), `fanotify_init()` may
  be called **without `CAP_SYS_ADMIN`** to create a `FAN_CLASS_NOTIF`
  group, provided it identifies objects by file handle (e.g.
  `FAN_REPORT_FID` / `FAN_REPORT_DFID_NAME`). Unprivileged groups may
  mark **inodes** (`FAN_MARK_ADD` on a dirfd — exactly our case),
  though not whole mounts or filesystems.
- The directory-entry events (`FAN_CREATE` etc.) require an fid-reporting
  group anyway, so the unprivileged constraint and the
  directory-watch requirement line up rather than conflict.
- `FAN_REPORT_DFID_NAME` delivers, for each event, the **parent
  directory's file handle plus the affected child's name** — which is
  precisely the `{ kind: 'add' | 'remove' | 'replace', name }` shape
  `watchDirectory` must produce, with no path re-resolution.

So on a modern kernel, an unprivileged, confinement-preserving,
child-named directory watch anchored on the cap-std dirfd is
**achievable today** — the analysis in #606 predates or omits the
unprivileged-fanotify path.

### The remaining Linux caveat is the sandbox, not the kernel

The real obstruction for *our* deployment is one layer up: container
runtimes' default seccomp profiles. Docker's default profile still
gates `fanotify_init` behind `CAP_SYS_ADMIN` even where the kernel would
allow it unprivileged (moby/moby#49756). The garden fleet runs inside
such a container. So a fanotify backend must be written to **detect
`EPERM`/`ENOSYS` at init and fall back**, and any deployment wanting live
Rust/XS watches must either loosen the seccomp profile for
`fanotify_init` or accept the fallback. This is a config knob, not a
code impossibility — but it means fanotify cannot be the *only* backend.

### macOS and Windows: the cross-platform story #606 did not cover

Issue #606 is Linux-centric. The fd/handle-anchored angle generalizes:

- **Windows** is, surprisingly, the *cleanest* capability-preserving
  case. `ReadDirectoryChangesW` takes an open directory **HANDLE** —
  exactly what cap-std holds — and reports child-level
  `FILE_ACTION_ADDED` / `REMOVED` / `RENAMED_OLD_NAME` /
  `RENAMED_NEW_NAME` with filenames. No path, no ambient authority,
  full add/remove/replace fidelity.
- **macOS / BSD** has no child-naming fd-anchored primitive. `kqueue`
  with `EVFILT_VNODE` registers on the **open dirfd** and fires
  `NOTE_WRITE` when the directory's entries change — but it only says
  *"this directory changed"*, not which child. FSEvents does name
  children but is **path-anchored** (ambient), so it is off the table.
  The capability-preserving macOS design is therefore **coarse kqueue
  wakeup → re-`read_dir` the `Dir` → diff against the last snapshot** to
  synthesize the named add/remove/replace events.

The snapshot-diff step macOS needs is the same mechanism as the
universal poll fallback, so it is not extra surface — it is the shared
core that fanotify/`ReadDirectoryChangesW` merely *accelerate* by
telling us *when* (and, where available, *what*) to diff.

## Proposed design

### Shape

A minimal Rust module (candidate crate name `cap-std-watch`, initially
vendored under `rust/endo/xsnap/src/powers/` rather than published)
exposing one capability-in / stream-out primitive:

```rust
/// Watch a directory held as a cap-std capability. Borrows the Dir's
/// fd/handle; never resolves a path from ambient authority.
pub fn watch_dir(dir: &cap_std::fs::Dir) -> io::Result<DirWatch>;

pub struct DirWatch { /* backend + snapshot state */ }

pub enum ChangeKind { Add, Remove, Replace }
pub struct Change { pub kind: ChangeKind, pub name: String }

impl DirWatch {
    /// Blocking/next-style drain of coalesced changes.
    pub fn poll(&mut self, timeout: Duration) -> io::Result<Vec<Change>>;
    pub fn close(self);
}
```

Backend selection at construction, best-to-worst, each falling through
on failure:

1. **Linux**: `fanotify` group (`FAN_CLASS_NOTIF | FAN_REPORT_DFID_NAME`,
   unprivileged), `fanotify_mark(FAN_MARK_ADD, dir.as_fd(), NULL)` →
   native named events. On `EPERM`/`ENOSYS` (old kernel or container
   seccomp) → fall through.
2. **Windows**: `ReadDirectoryChangesW(dir.as_handle(), …)` → native
   named events.
3. **macOS/BSD**: `kqueue` `EVFILT_VNODE` on `dir.as_fd()` → coarse
   wakeup, then `dir.read_dir()` diff → synthesized named events.
4. **Universal fallback**: timed `dir.read_dir()` diff (a periodic poll).
   This is the honest degradation and is always available because it uses
   only the `Dir` capability itself.

Backends 3 and 4 share one **snapshot-diff engine** (name → cheap
identity such as `(ino, mtime, size)` from `Dir::metadata`); backends 1
and 2 emit named events directly and skip it.

### Binding into the supervisor

Three host functions in `rust/endo/xsnap/src/powers/fs.rs`, following the
existing `openDir`/`readDir`/`closeDir` handle-map pattern (a
`WATCH_MAP: HashMap<u32, DirWatch>` alongside `DIR_MAP`):

- `watchDir(dirOrToken) -> number` — resolve the `Dir` from `DIR_MAP` /
  the token exactly as the other fs host fns do, `watch_dir(&dir)`, store,
  return a handle.
- `watchNext(handle, timeoutMs) -> string` — JSON array of
  `{ kind, name }`, drained/coalesced. (Or a callback/port if the XS
  event loop favors push over pull; see Open Questions.)
- `watchClose(handle) -> undefined`.

Then `bus-manager-rust-xs-powers.js` replaces the stubbed
`watchDirectory` with an async-iterator adapter over those three host
functions, mirroring the event coalescing/debounce the Node
`fs.watch`-backed powers already implement, so the two hosts present the
identical `AsyncIterable<{kind,name}>` contract and the existing
`watch-directory.test.js` / `mount-platform-fs-conformance.test.js`
suites apply unchanged.

## Security model

The confinement guarantee cap-std exists to provide is **preserved by
construction**: every backend is handed only `dir.as_fd()` /
`dir.as_handle()` — the descriptor of the already-authorized directory —
and never a path string it could re-resolve against ambient root/cwd.

- **Linux fanotify**: `FAN_MARK_ADD` on the dirfd with `NULL` pathname
  marks *that inode*; `FAN_REPORT_DFID_NAME` reports the child's name as
  a leaf component, not a resolvable ambient path. No `openat`/`readlink`
  escape is introduced.
- **macOS kqueue / poll fallback**: only `Dir::read_dir` (already a
  sanctioned cap-std operation) and the registered fd are used.
- **Windows**: `ReadDirectoryChangesW` reads events *from the handle*; it
  cannot observe anything outside the directory the handle authorizes.

The one thing to *avoid* — and the reason to write our own bindings
rather than adopt `notify` — is the `/proc/self/fd/N` trick, which would
recover an ambient path from the fd and reintroduce exactly the ambient
authority cap-std removes. `cap-std-watch` must never do this;
sub-directory recursion, if ever wanted, is done by opening child `Dir`
capabilities and watching each, not by handing a recursive path to the
kernel.

New event surface (names of created/removed entries within an
already-readable directory) discloses nothing the holder could not
already learn by calling `readDir`, so the watch adds no information
authority beyond the `Dir` it is built from.

## Effort and risk

- **Universal poll fallback + macOS kqueue-driven diff**: small,
  low-risk, and immediately unblocks live-ish watches on every platform
  including inside the current container (no seccomp change needed). This
  alone upgrades the Rust/XS host from *snapshot-only* to *eventually
  converging* and is the recommended first slice.
- **Linux fanotify backend**: medium effort (raw syscalls / a thin
  binding; parsing `fanotify_event_metadata` + `fanotify_event_info_fid`
  records), medium risk (kernel-version and seccomp variance). High
  payoff: true push events, no polling latency. Gated behind runtime
  capability-probe with graceful fallback.
- **Windows `ReadDirectoryChangesW` backend**: medium effort, low risk,
  clean semantics — but only worth it once a Windows Rust/XS supervisor
  is a target.

Net: the honest "snapshot-only" degradation in #606 can be replaced with
"converges via diff, accelerated to true push events where the platform
and sandbox permit," with the fallback guaranteeing no regression where
they do not.

## Open questions

1. **Pull vs push at the XS boundary.** `watchNext(timeout)` (pull) is
   simplest to bind but ties up a host call; a registered XS callback /
   port would integrate better with the daemon's async loop. Which fits
   the Rust/XS event model best?
2. **Poll cadence / debounce** for the fallback and macOS diff — reuse
   the Node powers' existing debounce window for cross-host parity?
3. **Loosen the container seccomp profile** to allow unprivileged
   `fanotify_init`, or ship fallback-only inside the sandbox and reserve
   fanotify for host deployments? (Operational decision for the garden
   fleet specifically.)
4. **Vendor vs publish.** Keep `cap-std-watch` internal to
   `rust/endo/xsnap` first; only extract a standalone crate (and
   potentially offer it upstream to the bytecodealliance/cap-std
   ecosystem, per #606 follow-up item 1) once the API stabilizes.
5. **Rename fidelity.** fanotify `FAN_MOVED_FROM`/`FAN_MOVED_TO` and
   Windows `RENAMED_OLD/NEW` carry rename pairs; the current contract
   flattens to add/remove/replace. Is a `rename` kind worth surfacing, or
   is the flattened model deliberate?

## Alternatives considered

- **Adopt `notify` as-is** — rejected: path-anchored, breaks confinement
  (the #606 finding).
- **`/proc/self/fd/N` → `notify`** — rejected: reintroduces ambient
  authority; defeats the purpose.
- **Stay snapshot-only** — the status quo; honest but leaves the Rust/XS
  host permanently less capable than Node for `followNameChanges`. This
  design shows we can do better without sacrificing confinement.
- **Wait for upstream cap-std to add a watch API** (#606 follow-up
  item 1) — worth pursuing in parallel, but slow and out of our control;
  our own bindings de-risk it and could seed the upstream proposal.

## Status

Proposed — feasibility exploration in response to #606. Recommends a
staged build: (1) universal poll/diff + macOS kqueue fallback (unblocks
all platforms, no sandbox change), then (2) Linux unprivileged-fanotify
push backend behind a capability probe, then (3) Windows
`ReadDirectoryChangesW` when a Windows supervisor is targeted. No code in
this PR; it captures the design and the corrected feasibility verdict so
the decision is durable.
