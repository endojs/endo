# Endo OS — seL4 Microkit Target

Runs the Endo pet daemon on the **formally verified seL4
microkernel** with **QuickJS** as the JavaScript engine.

This is the "capabilities all the way down" target:

```
seL4 kernel capabilities (formally verified)
  → Microkit protection domain isolation
    → QuickJS + SES Compartments (JS-level)
      → CapTP (distributed capability passing)
```

No ambient authority at any layer.

## Why seL4?

| Layer | Linux target | seL4 target |
|-------|-------------|-------------|
| Kernel | Ambient authority (root) | Capability-based (verified) |
| Isolation | POSIX processes | Protection domains |
| IPC | Sockets + pipes | seL4 endpoints |
| Memory | mmap (global) | Capability-mediated pages |
| Drivers | Kernel modules (trusted) | Separate PDs (isolated) |

With Linux, there's an ambient-authority gap between hardware
and JS capabilities.  With seL4, the kernel *enforces* that
you can only access what you have a capability for — proven
by mathematical proof.

## Why QuickJS?

| | V8 (Linux target) | QuickJS (seL4 target) |
|-|-------|---------|
| JIT | Yes (needs mmap/mprotect) | No (interpreter only) |
| Code size | ~30 MB | ~210 KB |
| Dependencies | libc, threading, mmap | malloc/free only |
| ES support | Full ES2024 | ES2023 (including Proxy) |
| seL4 portability | Hard (JIT, threading) | Easy (minimal deps) |
| SES compatible | Yes | Yes (Proxy support) |

QuickJS supports Proxy, which is required for SES.  No JIT means
no `mmap`/`mprotect`, which are the hardest V8 requirements to
satisfy on seL4.

## Quick Start

```sh
# Build (Docker handles the Microkit SDK + cross-compilation)
./sel4/build/build-sel4.sh

# Boot on QEMU (AArch64 virt platform)
./sel4/build/run-qemu-sel4.sh
```

Requires: Docker, QEMU (`brew install qemu`)

## Architecture

```
seL4 Microkit
  │
  ├── PD: endo-init (Rust + QuickJS)
  │   ├── SES lockdown
  │   ├── Endo daemon bootstrap
  │   └── Capability object system
  │
  └── (Phase 1+: device driver PDs)
      ├── PD: virtio-blk  ←─ channel ─→  disk capability
      ├── PD: virtio-net   ←─ channel ─→  network capability
      └── PD: virtio-gpu   ←─ channel ─→  display capability
```

Each device driver runs in its own protection domain, isolated
by the verified kernel.  Channels between PDs are seL4 endpoint
capabilities — the kernel guarantees a compromised driver cannot
access other devices.

## Project Structure

```
sel4/
  Cargo.toml          Rust crate (sel4-microkit + rquickjs)
  system.xml          Microkit system description
  Makefile            Build orchestration
  src/
    lib.rs            Microkit PD entry points (init, notified, protected)
    js_runtime.rs     QuickJS engine wrapper
  build/
    Dockerfile        Docker build environment
    build-sel4.sh     One-command Docker build
    run-qemu-sel4.sh  QEMU launcher for AArch64
```

## Phase Plan

- **0a (current)**: Boot seL4, run QuickJS, SES lockdown stub
- **0b**: Wire QuickJS via rquickjs, run real JS code
- **1**: Add virtio-blk driver PD, expose as disk capability
- **2**: Add virtio-net driver PD, WebSocket gateway
- **3**: Full Endo daemon on seL4
- **4**: Connect to Chat UI from host browser
