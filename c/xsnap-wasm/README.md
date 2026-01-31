# XSnap WASM

WebAssembly build of the XS JavaScript engine without Emscripten.

## Overview

This project builds the Moddable XS JavaScript engine as a pure WebAssembly
module, designed for embedding in Go (via wazero or similar) or JavaScript
hosts. Unlike Emscripten-based builds, this uses a minimal freestanding
approach with explicit host imports for system functionality.

## Quick Start

```bash
# Install dependencies (macOS)
brew install llvm

# Install WASI SDK (for wasm-ld linker)
curl -LO https://github.com/WebAssembly/wasi-sdk/releases/download/wasi-sdk-24/wasi-sdk-24.0-x86_64-macos.tar.gz
tar xf wasi-sdk-24.0-x86_64-macos.tar.gz
mv wasi-sdk-24.0-x86_64-macos ~/wasi-sdk

# Build
cd c/xsnap-wasm
make WASI_SDK_PATH=$HOME/wasi-sdk

# Output: build/bin/debug/xsnap.wasm (3.0 MB)
```

## System Requirements

### macOS

1. **LLVM/Clang with WebAssembly support** (Apple's clang doesn't include WASM backend)
   ```bash
   brew install llvm
   ```

2. **WASI SDK** (provides `wasm-ld` linker)
   ```bash
   # Download and extract
   curl -LO https://github.com/WebAssembly/wasi-sdk/releases/download/wasi-sdk-24/wasi-sdk-24.0-x86_64-macos.tar.gz
   tar xf wasi-sdk-24.0-x86_64-macos.tar.gz
   
   # Move to home directory (or /opt/wasi-sdk with sudo)
   mv wasi-sdk-24.0-x86_64-macos ~/wasi-sdk
   ```

3. **Make** (included with Xcode Command Line Tools)
   ```bash
   xcode-select --install
   ```

### Linux

```bash
# Ubuntu/Debian - install LLVM with LLD
apt install clang llvm lld

# Verify wasm-ld is available
which wasm-ld  # Should print path

# Fedora
dnf install clang llvm lld
```

### Verified Versions

| Tool | Version | Notes |
|------|---------|-------|
| LLVM/Clang | 21.1.8 | Homebrew on macOS |
| WASI SDK | 24.0 | Provides wasm-ld linker |
| Make | 3.81+ | GNU Make |

## Building

```bash
# Full build (library + WASM executable)
make WASI_SDK_PATH=$HOME/wasi-sdk

# Or if wasm-ld is in PATH
make

# Build library only (doesn't require wasm-ld)
make lib

# Release build (optimized, smaller)
make release WASI_SDK_PATH=$HOME/wasi-sdk

# With optional XS features
make WASI_SDK_PATH=$HOME/wasi-sdk LOCKDOWN=1 METERING=1 SNAPSHOT=1

# Clean
make clean
```

## Build Output

| File | Size | Description |
|------|------|-------------|
| `build/bin/debug/libxs.a` | ~4.8 MB | Static library with WASM objects |
| `build/bin/debug/xsnap.wasm` | ~3.0 MB | Debug WASM executable |
| `build/bin/release/xsnap.wasm` | smaller | Optimized WASM executable |

## Architecture

### Host Imports Required

The WASM module expects these imports from the host environment (`env` module):

| Import | Signature | Description |
|--------|-----------|-------------|
| `wasm_time_now_ms` | `() -> i64` | Current time in milliseconds |
| `wasm_issue_command` | `(length: i32) -> i32` | Handle issueCommand callback |
| `wasm_console_log` | `(length: i32) -> ()` | Print to console |
| `wasm_alloc` | `(size: i32) -> i32` | Allocate memory (optional) |
| `wasm_free` | `(ptr: i32) -> ()` | Free memory (optional) |

### Exports

The module exports these functions:

| Export | Signature | Description |
|--------|-----------|-------------|
| `xsnap_buffer` | `() -> i32` | Get pointer to shared message buffer |
| `xsnap_buffer_size` | `() -> i32` | Get size of shared buffer (65536) |
| `xsnap_create` | `() -> i32` | Create XS machine (0=success) |
| `xsnap_destroy` | `() -> ()` | Destroy XS machine |
| `xsnap_evaluate` | `(length: i32) -> i32` | Evaluate JS code from buffer |
| `xsnap_command` | `(length: i32) -> i32` | Send command to machine |
| `xsnap_status` | `() -> i32` | Get machine status (1=running) |

### Message Passing Protocol

1. Host writes data to shared buffer (via `xsnap_buffer()` pointer)
2. Host calls `xsnap_evaluate(length)` or `xsnap_command(length)`
3. Guest processes, may call `wasm_issue_command()` back to host
4. On `wasm_issue_command`, host reads from buffer, writes response, returns length
5. Function returns: 0=success, <0=error (message in buffer)

## Directory Structure

```
c/xsnap-wasm/
├── Makefile           # Build configuration
├── README.md          # This file
├── build/             # Build output (generated)
├── sources/
│   └── xsnap-wasm.c   # Worker entry point with FFI interface
├── libc/              # Minimal freestanding libc headers
│   ├── stdint.h
│   ├── stddef.h
│   ├── string.h
│   ├── math.h
│   ├── time.h
│   ├── wasm_libc.c    # Minimal libc implementations
│   └── sys/
│       ├── time.h
│       ├── stat.h
│       └── types.h
└── platforms/
    ├── wasm32_xs.h    # Platform configuration header
    └── wasm32_xs.c    # Platform implementation
```

## Integration with Moddable XS

This build uses XS source files from the `c/moddable` submodule. The
`MODDABLE` environment variable or makefile variable should point to the
moddable directory if not using the default relative path.

## Next Steps

1. ✅ Build XS engine as WASM static library
2. ✅ Create worker entry point with FFI interface
3. ✅ Link into complete WASM module
4. ✅ Create Go bindings using wazero (see `go/engo/cmd/xsnap-wasm-test/`)
5. 🚧 Create Node.js bindings (see `packages/xsnap-wasm/`)
6. Add xsnap-worker compatible command interface
7. Implement snapshot support

## Related Packages

- **[packages/xsnap-wasm](../../packages/xsnap-wasm/)** - Node.js bindings
- **[go/engo/cmd/xsnap-wasm-test](../../go/engo/cmd/xsnap-wasm-test/)** - Go proof of concept

## FFI Specification

For detailed documentation of the FFI interface, memory layout, and message
passing protocol, see:

**[packages/xsnap-wasm/docs/ffi-specification.md](../../packages/xsnap-wasm/docs/ffi-specification.md)**

## Troubleshooting

### "wasm-ld not found"

Install WASI SDK and pass its path:
```bash
make WASI_SDK_PATH=$HOME/wasi-sdk
```

### Apple clang errors about wasm32 target

Apple's clang doesn't support WASM. Install LLVM via Homebrew:
```bash
brew install llvm
```

### Duplicate symbol errors

Ensure you're using the latest version of this build which includes the
`extern` fix in `mxExport` for WASM targets.
