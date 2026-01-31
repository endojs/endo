# @endo/xsnap-wasm

Node.js bindings for the XSnap WebAssembly JavaScript engine.

## Overview

This package provides JavaScript bindings for `xsnap.wasm`, a WebAssembly build of Moddable's XS JavaScript engine. It enables running sandboxed JavaScript code with:

- **Deterministic execution** via computation metering
- **Hardened JavaScript** (HardenedJS/SES) lockdown support
- **Heap snapshots** for fast startup from saved state
- **Object-capability (ocap) communication** via `issueCommand`

Unlike the traditional pipe-based XSnap worker, this implementation uses a shared memory buffer for host-guest communication, following the same FFI pattern established by OCapN Noise Protocol bindings.

## Installation

```bash
npm install @endo/xsnap-wasm
# or
yarn add @endo/xsnap-wasm
```

## Usage

```javascript
import { XSnapWasm } from '@endo/xsnap-wasm';

// Create an XSnap instance
const xsnap = await XSnapWasm.create({
  // Optional: handle issueCommand from JavaScript
  handleCommand: async (command) => {
    console.log('Received command:', command);
    return new Uint8Array([/* response */]);
  },
  // Optional: handle print() output
  handlePrint: (message) => {
    console.log('[xsnap]', message);
  },
});

// Evaluate JavaScript code
await xsnap.evaluate(`
  print('Hello from XSnap!');
  const result = 1 + 1;
  print('1 + 1 = ' + result);
`);

// Send a command to the JavaScript code
const response = await xsnap.command(new TextEncoder().encode('ping'));

// Clean up
await xsnap.close();
```

## API

### `XSnapWasm.create(options?)`

Creates a new XSnap WebAssembly instance.

**Options:**
- `handleCommand?: (command: Uint8Array) => Promise<Uint8Array | void>` - Handler for `issueCommand()` calls from JavaScript
- `handlePrint?: (message: string) => void` - Handler for `print()` calls from JavaScript
- `wasmModule?: WebAssembly.Module` - Pre-compiled WASM module (optional, for faster instantiation)

**Returns:** `Promise<XSnapWasm>`

### `xsnap.evaluate(code: string)`

Evaluates JavaScript source code in the XS machine.

**Parameters:**
- `code`: JavaScript source code (UTF-8 string)

**Returns:** `Promise<void>`

**Throws:** Error with the JavaScript exception message if evaluation fails.

### `xsnap.command(data: Uint8Array)`

Sends a binary command to the JavaScript machine.

**Parameters:**
- `data`: Command payload (max 65,535 bytes)

**Returns:** `Promise<Uint8Array>` - Response from the command handler

### `xsnap.close()`

Destroys the XS machine and frees resources.

**Returns:** `Promise<void>`

### `xsnap.status`

Property returning the current machine status.

**Returns:** `'running' | 'stopped'`

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Node.js Host                            │
│  ┌─────────────────────────────────────────────────────┐   │
│  │               @endo/xsnap-wasm                       │   │
│  │  ┌───────────────────────────────────────────────┐  │   │
│  │  │           XSnapWasm Class                     │  │   │
│  │  │  - evaluate(), command(), close()             │  │   │
│  │  │  - Manages shared buffer                      │  │   │
│  │  └───────────────────────────────────────────────┘  │   │
│  │                      │                              │   │
│  │                      ▼                              │   │
│  │  ┌───────────────────────────────────────────────┐  │   │
│  │  │           WebAssembly Instance                │  │   │
│  │  │  ┌─────────────────────────────────────────┐  │  │   │
│  │  │  │            xsnap.wasm                   │  │  │   │
│  │  │  │  - XS JavaScript Engine                 │  │  │   │
│  │  │  │  - 64 KiB shared buffer                 │  │  │   │
│  │  │  │  - Exports: xsnap_create, evaluate...   │  │  │   │
│  │  │  └─────────────────────────────────────────┘  │  │   │
│  │  └───────────────────────────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## FFI Specification

For detailed documentation of the WebAssembly FFI interface, memory layout, and message passing protocol, see:

**[docs/ffi-specification.md](./docs/ffi-specification.md)**

This specification is useful for:
- Implementing bindings in other languages
- Understanding the low-level communication protocol
- Debugging integration issues
- Contributing to the XSnap WASM module

## Building from Source

The `xsnap.wasm` module is built from the C sources in `c/xsnap-wasm/`:

```bash
cd c/xsnap-wasm
make WASI_SDK_PATH=$HOME/wasi-sdk
```

See `c/xsnap-wasm/README.md` for build prerequisites and options.

## Comparison with @endo/xsnap

| Feature | @endo/xsnap-wasm | @endo/xsnap |
|---------|-----------------|-------------|
| Communication | Shared memory FFI | Pipe-based netstrings |
| Process model | In-process WASM | Subprocess |
| Platform support | Any WASM runtime | Native binaries |
| Snapshot support | ✓ (when enabled) | ✓ |
| Metering | ✓ (when enabled) | ✓ |
| Debugging | Future (web-based) | xsbug native app |

## Related Packages

- `@endo/xsnap` - Native XSnap subprocess implementation
- `@endo/ses` - SES shim for standard JavaScript environments
- `@endo/daemon` - Endo daemon with worker management

## License

Apache-2.0

