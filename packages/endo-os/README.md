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

- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
  (recommended — handles all Linux cross-compilation)
- [QEMU](https://www.qemu.org/) (`brew install qemu` on macOS)
- Optionally [VirtualBox](https://www.virtualbox.org/) if you
  prefer a GUI VM manager

If building without Docker (Linux host only):

- [depot_tools](https://v8.dev/docs/source-code) (for V8 build)
- GCC or Clang toolchain with static linking support
- Linux kernel build dependencies (`flex`, `bison`, `libelf-dev`,
  `libssl-dev`)
- libsodium (for crypto bindings)

## Quick Start (macOS with Docker)

The Docker build handles everything — V8 compilation, kernel
build, static linking — inside a container.  No Linux toolchain
needed on the host.

```sh
cd packages/endo-os

# Build everything (~30 min first run, cached after)
./build/build-docker.sh

# Boot in QEMU (serial console, Ctrl-A X to quit)
./build/run-qemu.sh --docker

# Or with a graphical window (framebuffer + audio)
./build/run-qemu.sh --docker --gui
```

### What you'll see

```
endo-init: Endo OS starting
endo-init: Capability-native operating system
endo-init: V8 platform initialized (1 thread)
endo-init: Installing device capability bindings
ses: SES lockdown module loaded (Phase 0 stub)
endo-init: SES lockdown complete
endo-os: Bootstrap starting
endo-os: SES lockdown succeeded
endo-os: Hello from Endo OS!
endo-os: harden() verified - object is frozen
endo-os: Compartment.evaluate("40 + 2") = 42
--- Probing device capabilities ---
endo-os: [disk]    /dev/vda 64MB
endo-os: [network] ready
endo-os: [display] 1024x768 @ 32bpp     (--gui mode only)
endo-os: [mic]     44100Hz 1ch 16bit    (if audio enabled)
========================================
 Endo OS: All checks passed!
 The capability-native OS is alive.
========================================
```

## VirtualBox

VirtualBox requires a proper bootable disk image with GRUB
(it can't boot a raw kernel+initramfs like QEMU).

```sh
# 1. Build with Docker first
./build/build-docker.sh

# 2. Create a GRUB-bootable VDI disk image
./build/make-vbox-image.sh

# 3. In VirtualBox:
#    New → Name: "Endo OS", Type: Linux, Version: Other Linux (64-bit)
#    Memory: 512 MB
#    Hard disk → Use existing → build/out/endo-os.vdi
#    Settings → Network → NAT → Port Forwarding:
#      Host 8920 → Guest 8920 (TCP)
#    Settings → Audio → Enable Audio (for mic capability)
#    Start!
```

The GRUB menu offers three boot options:

- **Endo OS** — graphical console (`tty0`)
- **Endo OS (serial console)** — headless (`ttyS0`)
- **Endo OS (verbose)** — graphical with full kernel log

## Building Without Docker (Linux Only)

On a Linux host you can build natively:

```sh
cd packages/endo-os

# Build V8 static library (~20 min, cached)
./build/build-v8.sh

# Build minimal Linux kernel (~5 min, cached)
./build/build-kernel.sh

# Build endo-init binary
make -C build endo-init

# Assemble initramfs
./build/build-initramfs.sh

# Boot
./build/run-qemu.sh
```

## Device Capabilities

Every hardware device is exposed to JavaScript as a capability
object.  If you don't have a reference to the object, you can't
use the device.  Capabilities can be attenuated (e.g., read-only
disk), delegated to sandboxed guests, and revoked.

| Device | Linux interface | JS constructor | Key methods |
|--------|----------------|----------------|-------------|
| Disk | `/dev/vda` (virtio-blk) | `__openBlockDevice(path)` | `read(off, len)`, `write(off, data)`, `size()`, `sync()` |
| Network | TCP sockets | `__createNetworkInterface()` | `listen(port)` → Listener, `connect(host, port)` → Connection |
| Display | `/dev/fb0` (framebuffer) | `__openFramebuffer(path)` | `buffer()` → mmap'd Uint8Array, `setPixel()`, `fillRect()`, `flip()` |
| Camera | `/dev/video0` (V4L2/UVC) | `__openCamera(path)` | `capture()` → frame Uint8Array, `startStreaming()`, `stopStreaming()` |
| Microphone | `/dev/dsp` (OSS/ALSA) | `__openMicrophone(device)` | `read(frames)` → PCM Uint8Array, `start()`, `stop()` |

### Capability attenuation example

```js
// Full disk capability (read + write)
const disk = __openBlockDevice('/dev/vda');

// Create a read-only view
const readOnlyDisk = harden({
  read: disk.read.bind(disk),
  size: disk.size.bind(disk),
});

// Guest receives only the attenuated capability
const guest = new Compartment({ disk: readOnlyDisk });
guest.evaluate('disk.read(0, 512)');   // works
guest.evaluate('disk.write(0, data)'); // throws — no write method
```

### Stream handoff (the killer use case)

In a capability OS, passing a camera stream across chat to a
third party is just passing an object reference:

```js
// Agent A has a camera, sends it to Agent B via chat:
E(agentB).send('camera', camera);

// Agent B shares with Agent C — the capability transfers:
E(agentC).send('camera', receivedCamera);

// Agent C now captures frames directly — no proxy, no relay.
// Revoke Agent B's reference and they lose access, but Agent C
// keeps theirs (or not — depends on your revocation policy).
```

## QEMU Options

```sh
# Serial console only (headless, for CI)
./build/run-qemu.sh --docker

# Graphical window with display + audio
./build/run-qemu.sh --docker --gui

# Custom memory
QEMU_MEMORY=1G ./build/run-qemu.sh --docker

# USB camera passthrough (Linux host only)
./build/run-qemu.sh --docker --usb-camera=/dev/video0
```

Ports forwarded from host to VM:

- **8920** — WebSocket gateway (Chat UI connects here)

Press **Ctrl-A X** to exit QEMU in serial mode.

## Project Structure

```
src/
  v8-host/
    main.cc              PID 1: init V8, load SES, run bootstrap
    platform.cc          v8::Platform (event loop, threading)
    devices.cc           Device binding dispatcher
    block-device.cc      Disk capability (/dev/vda)
    network-device.cc    TCP listen/connect capabilities
    framebuffer.cc       Display capability (/dev/fb0)
    camera.cc            Camera capability (V4L2)
    microphone.cc        Microphone capability (OSS/ALSA)
  js/
    ses-lockdown.js      SES lockdown (stub, replaced by real SES later)
    bootstrap.js         First JS to run: probes devices, demos caps
  daemon/                Endo daemon platform bindings (future)
  storage/               Log-structured block store (future)
  network/               Minimal TCP + WebSocket (future)
build/
  Dockerfile             Full build environment (V8 + kernel + init)
  build-docker.sh        One-command Docker build (recommended)
  build-all.sh           Native Linux build orchestrator
  build-v8.sh            V8 static library build
  build-kernel.sh        Minimal Linux kernel build
  build-initramfs.sh     Pack initramfs from artifacts
  run-qemu.sh            Boot in QEMU (serial or GUI)
  make-vbox-image.sh     Create GRUB-bootable VDI for VirtualBox
  Makefile               Compile endo-init from C++ sources
kernel/
  qemu-x86_64.config     Minimal Linux kernel config
```

## Build Notes

- **First Docker build takes ~30 minutes** because it compiles
  V8 from source.  Docker layer caching means subsequent builds
  only rebuild what changed — an endo-init recompile takes
  seconds.
- **V8 is ~30 MB** as a static library.  The final endo-init
  binary is roughly 40–50 MB.
- The **kernel config** disables everything except virtio,
  serial, framebuffer, USB, V4L2, ALSA, and TCP/IP.  No ext4,
  no shell, no coreutils.
- The **camera** device requires USB passthrough, which is
  tricky in VMs.  In VirtualBox, install the Extension Pack and
  configure USB device filters.

## Phase Plan

0. **Hello SES on QEMU** — V8 evaluates `lockdown()` on bare
   Linux, prints to serial console *(current)*
1. **Persistence without POSIX** — content-addressed block store
   on virtio-blk, replacing the filesystem entirely
2. **Workers without processes** — V8 Isolates replace
   `child_process.fork()`
3. **Daemon boots** — full `makeDaemon(osPowers)` on bare metal
4. **Network gateway** — Chat UI connects from host browser via
   WebSocket on port 8920
5. **Chat as shell** — VGA console with text-mode chat interface
