# @endo/os

A capability-native operating system built around the Endo pet
daemon.  Instead of layering capability security on top of POSIX,
Endo OS makes the capability model *the* OS — booting directly to
the Endo chat shell with V8 + SES as the execution substrate.

## Architecture

```
UEFI/BIOS → Linux (stripped bzImage)
  → endo-init (static binary embedding V8, PID 1)
    → lockdown() (SES / Hardened JavaScript)
    → makeDaemon(osPowers)
    → Chat shell + WebSocket gateway
```

**Key insight**: SES Compartments + V8 Isolates replace POSIX
process isolation.  A single-address-space system where all
sandboxing is language-level is more natural for the capability
model than processes with ambient authority.

## Status

**Phase 0** — bootstrapping V8 + SES on a minimal Linux kernel
in QEMU.

## Prerequisites

- [depot_tools](https://v8.dev/docs/source-code) (for V8 build)
- GCC or Clang toolchain with static linking support
- QEMU (`qemu-system-x86_64`)
- Linux kernel source (or pre-built bzImage)
- libsodium (for crypto bindings)

## Quick Start

```sh
# Build everything (V8, kernel, endo-init, initramfs)
yarn build

# Boot in QEMU (serial console, Ctrl-A X to quit)
yarn start
```

## Project Structure

```
src/
  v8-host/       C++ code embedding V8 as PID 1
  daemon/        Endo daemon platform bindings for bare metal
  storage/       Log-structured block store (replaces filesystem)
  network/       Minimal TCP + WebSocket (replaces Node.js net/ws)
build/           Build scripts and Makefile
kernel/          Minimal Linux kernel configs
test/            QEMU-based integration tests
```

## Phase Plan

0. **Hello SES on QEMU** — V8 evaluates `lockdown()` on bare
   Linux, prints to serial console
1. **Persistence without POSIX** — content-addressed block store
   on virtio-blk
2. **Workers without processes** — V8 Isolates replace
   `child_process.fork()`
3. **Daemon boots** — full `makeDaemon(osPowers)` on bare metal
4. **Network gateway** — Chat UI connects from host browser
5. **Chat as shell** — VGA console with text-mode chat
