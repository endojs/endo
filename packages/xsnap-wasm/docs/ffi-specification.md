# XSnap WASM FFI Specification

This document describes the Foreign Function Interface (FFI) conventions for the `xsnap.wasm` WebAssembly module. It defines the memory layout, exported functions, required imports, and the message passing protocol used for communication between a host runtime (Node.js, Go, or other WASM hosts) and the XS JavaScript engine.

## Overview

The XSnap WASM module provides a sandboxed JavaScript execution environment based on Moddable's XS engine. Unlike pipe-based IPC used by traditional XSnap, this variant uses:

1. **Shared memory buffer** - A 65,536-byte region for bidirectional message passing
2. **Direct function calls** - WASM exports for machine lifecycle and code evaluation
3. **Host callbacks** - Imported functions for system services (time, I/O, logging)

This design is inspired by the OCapN Noise Protocol shared-memory pattern, where a fixed-size scratch buffer avoids the overhead of dynamic memory coordination between host and guest.

## Memory Model

### Linear Memory

The WASM module exports its own linear memory with the following configuration:

| Property | Value | Description |
|----------|-------|-------------|
| Initial size | 16 MiB | `--initial-memory=16777216` |
| Maximum size | 256 MiB | `--max-memory=268435456` |
| Page size | 64 KiB | Standard WASM page size |

Memory is exported (not imported) for simpler host integration. The host can read/write to this memory using the pointer returned by `xsnap_buffer()`.

### Shared Message Buffer

A dynamically-sized buffer serves as the communication channel between host and guest:

```
┌─────────────────────────────────────────────────────────────────┐
│                     WASM Linear Memory                          │
├─────────────────────────────────────────────────────────────────┤
│  ...heap data...  │  gxBuffer[size]   │  ...more heap...        │
│                   ↑                                             │
│                   └── xsnap_buffer() returns this pointer       │
└─────────────────────────────────────────────────────────────────┘
```

**Buffer properties:**
- **Default size**: 64 KiB (65,536 bytes)
- **Maximum size**: 4 MiB (4,194,304 bytes)
- **Alignment**: 8-byte aligned
- **Ownership**: Alternates between host and guest during operations
- **Dynamic resizing**: Use `xsnap_resize_buffer()` to grow as needed

**Usage pattern:**
1. Host optionally calls `xsnap_resize_buffer(needed_size)` if data is large
2. Host gets buffer pointer via `xsnap_buffer()` (pointer may change after resize!)
3. Host writes data to buffer
4. Host calls an export function with the data length
5. Guest processes, may call back to host (guest writes to buffer)
6. Function returns, host reads result from buffer

### Pointer Conventions

All pointers are 32-bit unsigned integers (WASM32 target):

| Type | Size | Description |
|------|------|-------------|
| `i32` | 4 bytes | Pointers, lengths, status codes |
| `i64` | 8 bytes | Timestamps (milliseconds since epoch) |
| `f64` | 8 bytes | Floating-point values, timeouts |

## Exported Functions

The module exports these functions from the `xsnap` namespace:

### `xsnap_buffer() → i32`

Returns a pointer to the shared message buffer.

**Returns:** Pointer to the buffer region in WASM linear memory.

**Note:** The pointer may change after calling `xsnap_resize_buffer()`. Always call this function after resizing to get the current pointer.

**Example (JavaScript):**
```javascript
const bufferPtr = instance.exports.xsnap_buffer();
const bufferSize = instance.exports.xsnap_buffer_size();
const buffer = new Uint8Array(instance.exports.memory.buffer, bufferPtr, bufferSize);
```

### `xsnap_buffer_size() → i32`

Returns the current size of the shared buffer.

**Returns:** Current buffer size in bytes (default 65,536, max 4,194,304).

### `xsnap_buffer_max_size() → i32`

Returns the maximum allowed buffer size.

**Returns:** `4194304` (4 MiB constant).

### `xsnap_resize_buffer(requested_size: i32) → i32`

Resizes the shared buffer to at least the requested size.

**Parameters:**
- `requested_size`: Minimum buffer size needed (pass 0 to use default size)

**Returns:**
- Actual buffer size on success (may be larger than requested)
- `0` on failure (out of memory, exceeds maximum)

**Note:** After calling this function, you must call `xsnap_buffer()` again to get the new pointer, as the buffer may have been reallocated.

### `xsnap_create() → i32`

Creates and initializes a new XS JavaScript machine.

**Returns:**
- `0` on success
- `-1` on failure (out of memory, initialization error)

**Side effects:**
- Allocates heap memory for the XS machine
- Initializes JavaScript built-ins
- Installs host bindings (`issueCommand`, `print`, `gc`, `performance.now`, etc.)

**Note:** Only one machine can be active at a time in the current implementation.

### `xsnap_destroy()`

Destroys the current XS machine and frees associated memory.

**Returns:** Nothing (void)

**Note:** Safe to call multiple times or when no machine exists.

### `xsnap_evaluate(length: i32) → i32`

Evaluates JavaScript source code from the shared buffer.

**Parameters:**
- `length`: Number of bytes of JavaScript source code in the buffer

**Returns:**
- `0`: Success (no return value)
- `> 0`: Success with result (future: result length in buffer)
- `< 0`: Error occurred; absolute value is the length of the error message now stored in the buffer

**Protocol:**
1. Host writes UTF-8 encoded JavaScript source to buffer
2. Host calls `xsnap_evaluate(sourceLength)`
3. On success: function returns `0`
4. On error: function returns `-errorMessageLength`, and the buffer contains the UTF-8 error message

**Example (JavaScript):**
```javascript
const encoder = new TextEncoder();
const code = encoder.encode('1 + 1');

const buffer = new Uint8Array(memory.buffer, bufferPtr, 65536);
buffer.set(code);

const result = instance.exports.xsnap_evaluate(code.length);
if (result < 0) {
  const errorLength = -result;
  const decoder = new TextDecoder();
  const errorMessage = decoder.decode(buffer.subarray(0, errorLength));
  throw new Error(`JS Error: ${errorMessage}`);
}
```

### `xsnap_command(length: i32) → i32`

Sends a binary command to the JavaScript machine for processing by guest-registered handlers.

**Parameters:**
- `length`: Number of bytes of command data in the buffer

**Returns:**
- `≥ 0`: Success; value is response length in buffer
- `< 0`: Error occurred; absolute value is error message length

**Note:** Command format is application-defined (typically JSON or a binary protocol like CBOR/Syrup).

### `xsnap_status() → i32`

Returns the current machine status.

**Returns:**
- `1`: Machine is running
- `0`: Machine is not created or has been destroyed

## Required Host Imports

The module imports functions from the `env` namespace. The host must provide these before instantiation.

### Core Imports

#### `wasm_time_now_ms() → i64`

Returns the current time in milliseconds since the Unix epoch.

**Returns:** 64-bit signed integer representing milliseconds

**Used by:** `performance.now()`, date operations

#### `wasm_issue_command(length: i32) → i32`

Called by JavaScript's `issueCommand()` built-in to communicate with the host.

**Parameters:**
- `length`: Number of bytes of command data written to the shared buffer

**Returns:**
- `> 0`: Response length; host has written response to the buffer
- `0`: No response
- `< 0`: Error (interpretation is host-defined)

**Protocol:**
1. Guest writes command data to buffer
2. Guest calls host via `wasm_issue_command(length)`
3. Host reads command from buffer
4. Host writes response to buffer
5. Host returns response length
6. Guest reads response from buffer

#### `wasm_console_log(length: i32)`

Outputs a log message for the JavaScript `print()` built-in.

**Parameters:**
- `length`: Number of bytes of UTF-8 message in the buffer

**Returns:** Nothing (void)

#### `wasm_alloc(size: i32) → i32`

Optional. Requests memory allocation from the host.

**Parameters:**
- `size`: Number of bytes to allocate

**Returns:**
- Pointer to allocated memory, or
- `0` if allocation fails or feature is not used

**Note:** The current implementation uses a built-in bump allocator and may not call this function.

#### `wasm_free(ptr: i32)`

Optional. Releases memory previously allocated by `wasm_alloc`.

**Parameters:**
- `ptr`: Pointer returned by `wasm_alloc`

**Returns:** Nothing (void)

**Note:** The current bump allocator does not actually free memory.

### C Library Imports

The module requires host implementations of standard C library functions. These operate on WASM linear memory:

#### String Functions

| Import | Signature | Description |
|--------|-----------|-------------|
| `strlen` | `(s: i32) → i32` | Length of null-terminated string |
| `memcpy` | `(dst: i32, src: i32, n: i32) → i32` | Copy memory (returns dst) |
| `memset` | `(s: i32, c: i32, n: i32) → i32` | Fill memory (returns s) |
| `memmove` | `(dst: i32, src: i32, n: i32) → i32` | Copy overlapping memory |
| `strcmp` | `(s1: i32, s2: i32) → i32` | Compare strings |
| `strcpy` | `(dst: i32, src: i32) → i32` | Copy string |
| `strncmp` | `(s1: i32, s2: i32, n: i32) → i32` | Compare n bytes |
| `strcat` | `(dst: i32, src: i32) → i32` | Concatenate strings |
| `strchr` | `(s: i32, c: i32) → i32` | Find character in string |

#### Math Functions

| Import | Signature | Description |
|--------|-----------|-------------|
| `trunc` | `(x: f64) → f64` | Truncate to integer |
| `fmod` | `(x: f64, y: f64) → f64` | Floating-point remainder |
| `log` | `(x: f64) → f64` | Natural logarithm |
| `ceil` | `(x: f64) → f64` | Ceiling function |
| `floor` | `(x: f64) → f64` | Floor function |
| `fabs` | `(x: f64) → f64` | Absolute value |
| `round` | `(x: f64) → f64` | Round to nearest |
| `sqrt` | `(x: f64) → f64` | Square root |
| `pow` | `(x: f64, y: f64) → f64` | Power function |
| `sin`, `cos`, `tan` | `(x: f64) → f64` | Trigonometric functions |
| `asin`, `acos`, `atan` | `(x: f64) → f64` | Inverse trigonometric |
| `sinh`, `cosh`, `tanh` | `(x: f64) → f64` | Hyperbolic functions |
| `asinh`, `acosh`, `atanh` | `(x: f64) → f64` | Inverse hyperbolic |
| `atan2` | `(y: f64, x: f64) → f64` | Two-argument arctangent |
| `exp`, `expm1` | `(x: f64) → f64` | Exponential functions |
| `log1p`, `log10`, `log2` | `(x: f64) → f64` | Logarithm variants |
| `cbrt` | `(x: f64) → f64` | Cube root |
| `hypot` | `(x: f64, y: f64) → f64` | Hypotenuse |
| `nearbyint` | `(x: f64) → f64` | Round to nearest integer |

#### Exception Handling (Stubs)

| Import | Signature | Description |
|--------|-----------|-------------|
| `setjmp` | `(buf: i32) → i32` | Save execution context (returns 0) |
| `longjmp` | `(buf: i32, val: i32)` | Restore execution context |

**Note:** XS uses setjmp/longjmp for exception handling. The host should provide stub implementations that return 0 from setjmp. Full exception unwinding requires WASM exception handling proposal support.

#### Printf Functions (Optional)

| Import | Signature | Description |
|--------|-----------|-------------|
| `snprintf` | `(buf: i32, size: i32, fmt: i32, ...) → i32` | Formatted print (stub) |
| `vsnprintf` | `(buf: i32, size: i32, fmt: i32, args: i32) → i32` | Variadic formatted print (stub) |

These can be stubs returning 0 if full printf support is not needed.

#### Platform Functions (Stubs)

| Import | Signature | Description |
|--------|-----------|-------------|
| `fxAbort` | `(the: i32, status: i32)` | Fatal abort handler |
| `fxCreateSharedChunk` | `(size: i32) → i32` | SharedArrayBuffer (stub: return 0) |
| `fxLockSharedChunk` | `(data: i32)` | Lock shared memory (stub) |
| `fxUnlockSharedChunk` | `(data: i32)` | Unlock shared memory (stub) |
| `fxReleaseSharedChunk` | `(data: i32)` | Release shared memory (stub) |
| `fxNotifySharedChunk` | `(the: i32, data: i32, count: i32) → i32` | Atomics.notify (stub: return 0) |
| `fxWaitSharedChunk` | `(the: i32, addr: i32, timeout: f64, resolve: i32) → i32` | Atomics.wait (stub: return 0) |

#### Standard Library Functions

| Import | Signature | Description |
|--------|-----------|-------------|
| `rand` | `() → i32` | Random integer (for Math.random seeding) |
| `qsort` | `(base: i32, nel: i32, width: i32, compar: i32)` | Quicksort (stub if unused) |
| `bsearch` | `(key: i32, base: i32, nel: i32, width: i32, compar: i32) → i32` | Binary search (stub) |

## JavaScript Built-ins

The XS machine provides these global bindings to JavaScript code:

| Global | Description |
|--------|-------------|
| `issueCommand(data: ArrayBuffer)` | Send command to host, receive response ArrayBuffer |
| `print(...args)` | Output to console via `wasm_console_log` |
| `gc()` | Trigger garbage collection |
| `setImmediate(callback)` | Queue callback for next tick (promise-based) |
| `performance.now()` | High-resolution time in milliseconds |
| `currentMeterLimit()` | Get remaining computation meter (if metering enabled) |
| `resetMeter(limit)` | Reset computation meter to new limit |

## Message Passing Protocol

### Evaluate Flow

```
  Host                           WASM (Guest)
   │                                  │
   │  Write JS source to buffer       │
   │─────────────────────────────────>│
   │                                  │
   │  xsnap_evaluate(length)          │
   │═════════════════════════════════>│
   │                                  │
   │                            Parse & execute JS
   │                                  │
   │       [If JS calls print()]      │
   │<─ ─ wasm_console_log(len) ─ ─ ─ ─│
   │       Host reads & logs          │
   │─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─>│
   │                                  │
   │       [If JS calls issueCommand()]
   │<─ ─ wasm_issue_command(len) ─ ─ ─│
   │       Host reads command         │
   │       Host writes response       │
   │─ ─ ─ returns responseLen ─ ─ ─ ─>│
   │                                  │
   │       Result (0 or error len)    │
   │<═════════════════════════════════│
   │                                  │
   │  [If error] Read error message   │
   │<─────────────────────────────────│
   │                                  │
```

### Command Flow

```
  Host                           WASM (Guest)
   │                                  │
   │  Write command data to buffer    │
   │─────────────────────────────────>│
   │                                  │
   │  xsnap_command(length)           │
   │═════════════════════════════════>│
   │                                  │
   │                    Guest handler processes
   │                    May call back to host
   │                                  │
   │       Response (len or error)    │
   │<═════════════════════════════════│
   │                                  │
   │  Read response from buffer       │
   │<─────────────────────────────────│
```

## Build Configuration

### Compiler Flags

```makefile
# WASM target configuration
--target=wasm32
-nostdlib
-ffreestanding
-fno-builtin
-fvisibility=hidden
-mbulk-memory

# XS feature flags
-DINCLUDE_XSPLATFORM
-DXSPLATFORM="wasm32_xs.h"
-DmxNoConsole=1
-DmxParse=1
-DmxRun=1
```

### Optional Features

| Flag | Make Variable | Description |
|------|--------------|-------------|
| `-DmxLockdown=1` | `LOCKDOWN=1` | Enable Hardened JavaScript lockdown |
| `-DmxMetering=1` | `METERING=1` | Enable computation metering |
| `-DmxSnapshot=1` | `SNAPSHOT=1` | Enable heap snapshot support |
| `-DmxSloppy=1` | `SLOPPY=1` | Allow sloppy mode code |
| `-DmxBoundsCheck=1` | `BOUNDS_CHECK=1` | Enable bounds checking |

### Linker Flags

```makefile
wasm-ld \
  --no-entry \
  --export-dynamic \
  --allow-undefined \
  --export-memory \
  --initial-memory=16777216 \
  --max-memory=268435456
```

## Error Handling

### JavaScript Exceptions

JavaScript exceptions are caught and serialized:

1. XS catches the exception in `xsTry/xsCatch`
2. Exception is converted to string via `xsToString(xsException)`
3. String is written to the shared buffer
4. Function returns `-strlen(errorMessage)`
5. Host reads error message from buffer

### Fatal Errors

Fatal errors call `fxAbort(the, status)`:
- Host should log the status code
- Recovery is not possible; machine must be recreated

### Status Codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| `-1` | Generic error (machine not created, invalid length) |
| `< -1` | Error message available; length is `-result` |

## Thread Safety

The current implementation is **single-threaded**:

- One XS machine per WASM instance
- No concurrent access to the shared buffer
- Host must serialize all calls to WASM exports
- Atomics and SharedArrayBuffer functions are stubbed out

## Future Extensions

### Snapshot Support

When built with `SNAPSHOT=1`:
- `xsnap_snapshot(length: i32) → i32`: Create heap snapshot to buffer
- `xsnap_restore(length: i32) → i32`: Restore from snapshot in buffer

### Multi-Machine Support

Future versions may support:
- Machine handle parameter to all functions
- Multiple concurrent machines
- Machine-specific memory pools

### Streaming Evaluation

For code larger than 64 KiB:
- Chunked evaluation protocol
- Source map support for debugging

## See Also

- [XSnap WASM Build README](../../../c/xsnap-wasm/README.md) - Build instructions
- [Go Integration Example](../../../go/engo/cmd/xsnap-wasm-test/main.go) - Reference implementation
- [ENGO Project](../../../ENGO.md) - Project overview

