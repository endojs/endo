# @endo/os

A capability-native runtime for the Endo pet daemon.
Boots to an interactive shell where every resource — files,
network, agents — is an object capability: explicit, granular,
and revocable.

## Quick Start

```sh
# Build (Docker, ~30 seconds)
cd packages/endo-os
./redox/build/build-redox.sh

# Copy binary where Docker can find it
cp redox/build/out/endo-init /tmp/endo-init
chmod +x /tmp/endo-init

# Run with a host directory mounted
docker run --rm -it \
  -v /tmp/endo-init:/endo-init \
  -v $HOME:/mnt/home:ro \
  ubuntu:24.04 /endo-init --mount home=/mnt/home
```

```
endo-init: Endo OS (Redox + QuickJS-ng)
endo-init: Freezing intrinsics
ses: Ready (native lockdown applied from C)
endo-os: Mounted home → /mnt/home
========================================
 Endo OS
 Capability-native operating system
 QuickJS-ng (native lockdown)
 Daemon: in-memory (pet names + eval + messaging)
========================================

Type ? for help, or just type JavaScript.

endo>
```

## What It Does

The binary is a 2 MB static executable containing:

- **QuickJS-ng** (JavaScript engine, ES2023, no JIT)
- **Native lockdown** — all JS intrinsics frozen in <1ms at
  the C level
- **Native harden/Compartment** — deep-freeze objects and
  isolate evaluation contexts
- **Full Endo CLI** — pet names, eval, messaging, agents

The shell implements the same command set as the `endo` CLI
from `packages/daemon`.

## Shell Commands

### Naming & Eval

```
eval <js>                   Evaluate JavaScript
name <n> <js>               Eval and store as pet name
list [dir]                  List pet names
show <name>                 Print a value
remove <name>               Remove a name
move <from> <to>            Rename
copy <from> <to>            Duplicate
mkdir <name>                Make a pet store directory
mount <name> <path>         Mount a host filesystem path
inspect <name>              Show methods of a capability
```

### Storage

```
store --text <t> -n <name>  Store text
store --json <j> -n <name>  Store JSON
```

### Messaging

```
inbox                       Read messages
send <agent> <msg @refs>    Send message with @capability refs
request <desc> [-t agent]   Ask for something
resolve <msg#> <name>       Grant a request
reject <msg#> [reason]      Deny a request
adopt <msg#> <edge> -n <n>  Adopt a value from a message
dismiss <msg#>              Delete a message
reply <msg#> <msg @refs>    Reply to a message
```

### Agents

```
mkguest <handle> [name]     Create a sandboxed guest agent
mkhost <handle> [name]      Create a host agent
```

### System

```
where                       Show system info
status                      Daemon status
help [command]              Show help
```

Or just type JavaScript — unrecognized input is evaluated.

## Filesystem Capabilities

Host directories mounted via `--mount` or the shell `mount`
command become capability objects matching the Endo daemon's
`MountInterface`:

```
endo> home.list()
["Documents", "Desktop", ".config", ...]

endo> home.has("Documents")
true

endo> home.lookup("Documents")
[Mount(Documents)]

endo> home.lookup("Documents").list()
["endo-os", "notes", ...]

endo> home.lookup("package.json").text()
"{ \"name\": \"@endo/os\", ... }"

endo> home.lookup("package.json").json().name
"@endo/os"

endo> home.readOnly()
[Mount(home) (read-only)]
```

### Mount Interface

Matches `packages/daemon/src/interfaces.js` `MountInterface`:

| Method | Returns | Description |
|--------|---------|-------------|
| `has(...pathSegments)` | `boolean` | Check if path exists |
| `list(...pathSegments)` | `string[]` | List child names |
| `lookup(path)` | `Mount \| MountFile` | Navigate to child |
| `readText(path)` | `string` | Read file content |
| `maybeReadText(path)` | `string \| undefined` | Read or undefined |
| `writeText(path, text)` | `void` | Write file content |
| `remove(path)` | `void` | Delete file/directory |
| `move(from, to)` | `void` | Rename/move |
| `makeDirectory(path)` | `void` | Create directory |
| `readOnly()` | `Mount` | Attenuated read-only view |

### MountFile Interface

Matches `MountFileInterface`:

| Method | Returns | Description |
|--------|---------|-------------|
| `text()` | `string` | Read content as text |
| `json()` | `any` | Parse content as JSON |
| `writeText(content)` | `void` | Write text |
| `readOnly()` | `MountFile` | Read-only attenuated view |

Path arguments accept `string` or `string[]`.

### Capability Attenuation

```
endo> name docs home.lookup("Documents")
endo> name readonlyDocs docs.readOnly()
endo> mkguest alice
endo> send alice Check out these docs @readonlyDocs
```

Alice gets a read-only view.  She can `list()` and `readText()`
but `writeText()` throws.  She cannot navigate above the
`Documents` directory.

## Network Capabilities

Available when launched with `--port`:

```
endo-init --port 8920
```

```
endo> network.listen(8920)
[Listener]

endo> network.connect("example.com", 80)
[Connection]
```

| Object | Methods |
|--------|---------|
| Network | `listen(port)`, `connect(host, port)` |
| Listener | `accept()`, `close()` |
| Connection | `recv([max])`, `send(data)`, `close()` |

## Configuration

### CLI Flags

```sh
endo-init --mount name=/path      # Mount directory as capability
endo-init --port 8920             # Enable network capability
```

### Environment Variables

```sh
ENDO_MOUNT_DOCS=/path/to/docs endo-init
ENDO_PORT=8920 endo-init
```

### Runtime Mount

```
endo> mount project /mnt/host/Documents/my-project
Mounted: project → /mnt/host/Documents/my-project
```

## Build Targets

### Native Binary (recommended)

Builds a static binary for the host architecture.  No runtime
dependencies.

```sh
./redox/build/build-redox.sh
# Output: redox/build/out/endo-init (2 MB)
```

### Arch Linux Test

Verifies the binary builds and runs on bare Arch Linux x86_64:

```sh
./redox/build/test-arch.sh              # automated test
./redox/build/test-arch.sh --interactive  # interactive shell
# Output: redox/build/out/endo-init-x86_64 (2.6 MB)
```

### seL4 Microkernel

Runs on the formally verified seL4 kernel.  Boots in ~3 seconds
(without daemon bundle) via QEMU.  Interactive shell over serial
UART.

```sh
./sel4/build/build-sel4.sh
./sel4/build/run-qemu-sel4.sh
```

## Project Structure

```
src/js/
  bootstrap-sel4.js     The Endo shell (900 lines, all commands)
  ses-lockdown-quickjs.js  SES shim for QuickJS-ng

redox/
  src/endo-init.c       C entry point (POSIX, real libc)
  build/
    build-redox.sh      Docker build → static binary
    test-arch.sh        Arch Linux CI test
    run.sh              Docker run helper
    run-vm.sh           QEMU VM with virtio-9p shares

sel4/
  src/endo_init.c       Microkit PD entry point (bare metal)
  src/uart.c            Serial driver (PL011 + x86 COM1)
  src/heap.c            Allocator over seL4 memory region
  src/libc_stubs.c      Minimal libc for QuickJS on seL4
  src/ses-shim.js       SES + assert shim
  system.xml            Microkit system description
  build/
    build-sel4.sh       Docker build → seL4 image
    run-qemu-sel4.sh    QEMU launcher (auto-detects arch)
    Dockerfile          Cross-compile for AArch64/x86_64
```

## Technology Stack

| Component | What | Why |
|-----------|------|-----|
| [QuickJS-ng](https://github.com/nicedoc/nicedoc/quickjs) | JS engine | No JIT (small, portable), native lockdown/harden/Compartment |
| [SES](https://github.com/endojs/endo/tree/master/packages/ses) | Hardened JS | Frozen intrinsics, Compartment isolation, harden() |
| [seL4](https://sel4.systems/) | Verified kernel | Capability-native, formally proven (optional target) |
| [Redox](https://redox-os.org/) | Capability OS | POSIX + namespace-based capabilities (future target) |
| Static C binary | Deployment | Zero dependencies, runs anywhere |

## Coordination

A parallel agent maintains QuickJS-ng with SES support:
- `quickjs-collab.txt` — shared notes between agents
- `COORDINATION.md` — detailed integration plan

QuickJS-ng `native-ses` branch provides:
- `JS_FreezeIntrinsics(ctx)` — freeze all intrinsics in C (<1ms)
- `JS_AddIntrinsicLockdown(ctx)` — add lockdown/harden globals
- Native `Compartment` — isolated JSContext per compartment
