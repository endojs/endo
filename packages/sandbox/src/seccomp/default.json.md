# Default seccomp profile

`default.json` is a snapshot of the podman/`containers/common`
default seccomp profile reduced to the syscalls Endo's sandbox slice
needs.
It is shipped here as **documentation and as a payload for callers
who supply a precompiled BPF blob** via `SeccompPolicy.profile`.

## Source

- Upstream:
  https://github.com/containers/common/blob/main/pkg/seccomp/seccomp.json
- Snapshot date: 2026-04-29
- License: Apache-2.0 (matches Endo's license)

The upstream profile is large (≈800 lines, multiple
arch-conditional / cap-conditional rules).
The snapshot stripped here keeps a single allow-list of safe
syscalls under `SCMP_ACT_ALLOW` with a default `SCMP_ACT_ERRNO 1`
denial policy.
That is intentionally tighter than the upstream default
(no `clone`, `unshare`, `setns`, `mount`, `pivot_root`,
`keyctl`, `ptrace`, `personality`, `bpf`, `userfaultfd`, `acct`,
`reboot`, `kexec_*`, `init_module`, `iopl`, `ioperm`, `swapon`,
`swapoff`, `delete_module`, etc.).

## Loading

The Phase 1 `bwrap` driver does NOT load this profile by default
because Endo does not bundle a native BPF compiler
(`libseccomp` / `node-libseccomp`).
Bubblewrap's `--seccomp <fd>` flag expects a fully-compiled BPF
program on the supplied file descriptor, not the JSON blob.

Two paths forward:

1. Caller supplies a precompiled BPF blob via
   `SeccompPolicy = { profile: <Buffer> }`.
   The factory pipes that blob through a memfd / temp file and
   passes the fd to `bwrap --seccomp`.
2. A future phase adds an optional `node-libseccomp` dependency
   that compiles this JSON to BPF at slice construction.

Either path keeps the JSON profile here as the source of truth for
the syscall allow-list.

## Rationale for the allow-list

The list is the union of:

- POSIX file / process / signal syscalls every userland program
  uses,
- the "modern Linux" feature set podman allows by default
  (`landlock_*`, `io_uring_*`, `pidfd_*`, `clock_*_time64`,
  `*_time64` variants),
- nothing privileged: no module loading, no namespace creation
  beyond what bwrap already set up, no kernel-config syscalls.

## Updating

When refreshing against upstream:

1. Pull the latest `seccomp.json` from `containers/common`.
2. Diff against this file and add any newly-introduced safe
   syscalls (the long-tail of `*_time64`, `pidfd_*` variants).
3. Do NOT pull in the upstream `archMap` for `mips`, `s390`,
   `riscv64` etc. unless Endo gains a CI matrix for those arches.
4. Update the snapshot date above.
