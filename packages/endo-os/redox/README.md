# Endo OS — Redox Target

Runs the Endo pet daemon on **Redox OS**, a Unix-like operating
system written in Rust with capability-based namespace security.

## Why Redox?

| Feature | seL4 | Redox |
|---------|------|-------|
| Security model | Formal verification | Capability namespaces |
| POSIX compat | None (bare metal) | Full (relibc) |
| File I/O | Custom stubs | Normal open/read/write |
| Folder sharing | N/A | Mount namespace scheme |
| QuickJS support | Custom libc stubs | Runs natively |
| Boot time | ~3s (shell only) | ~5s (full OS + shell) |
| Persistence | In-memory only | Real filesystem |

Redox's **scheme + namespace** system maps naturally to Endo:
- Each process has a **namespace** (list of accessible schemes)
- An open file descriptor IS a capability
- **Null namespace** = fully sandboxed (like a confined Endo guest)
- Schemes can be shared between namespaces = capability delegation

## Quick Start

```sh
# Build (cross-compiles QuickJS for Redox, creates image)
./redox/build/build-redox.sh

# Boot in QEMU
./redox/build/run-qemu-redox.sh
```

## Architecture

```
Redox OS (microkernel, Rust)
  ├── Namespace manager (nsmgr) — capability-based access control
  ├── File scheme — persistent storage for formulas/pet stores
  ├── Net scheme — TCP/WebSocket for Chat UI gateway
  └── endo-init process
      ├── QuickJS-ng (native lockdown)
      ├── Endo daemon shell
      └── Pet names map to filesystem paths
```

The killer feature: **a pet name that maps to a folder** is just
a Redox namespace mount.  Share a folder with a guest agent by
adding the scheme to their namespace.  Revoke by removing it.
