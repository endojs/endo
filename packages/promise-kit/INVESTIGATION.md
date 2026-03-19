# Package Investigation: @endo/promise-kit

## Overview
`@endo/promise-kit` is a package that provides utilities for creating and managing promises with release semantics. It serves as a "ponyfill" for `Promise.withResolvers` while ensuring that the resulting promises can pipeline messages through `@endo/eventual-send`.

## Package Metadata
- **Version:** 1.2.0
- **License:** Apache-2.0
- **Type:** ES Module
- **Repository:** https://github.com/endojs/endo/tree/master/packages/promise-kit
- **Main File:** `/index.js`
- **Dependencies:** `@endo/harden`, `ses`

## Purpose
The package provides essential promise utilities for asynchronous programming in the Endo ecosystem:
1. `makePromiseKit()` - Creates a promise with separate resolve/reject functions
2. `racePromises()` - Non-leaky version of `Promise.race()`
3. `isPromise()` - Type guard for promises
4. Type definitions for `PromiseKit`, `ERef`, etc.

## Key Features

### 1. `makePromiseKit()`
Creates a Promise object together with separate facets for resolving and rejecting it. This is particularly useful when you need to create a promise and resolve/reject it at a later point in time, such as in asynchronous callbacks or event handlers.

**Return Value:** An object containing:
- `promise`: The promise object itself
- `resolve`: A function to resolve the promise with a value
- `reject`: A function to reject the promise with a reason

**Implementation Details:**
- Uses `makeReleasingExecutorKit()` to create executor functions
- Falls back to `globalThis.HandledPromise || Promise` for the promise type
- Returns a hardened object for SES environments

### 2. `racePromises()`
A non-leaky version of `Promise.race()` that cleans up after itself. This prevents non-resolved values from holding onto the result promise, which is critical for memory management.

**How It Works:**
- Uses a `WeakMap` to track promises that are still racing
- Sets up finalization callbacks that remove tracking when a promise settles
- Uses `Promise.resolve()` to handle primitive values gracefully
- Uses `finally()` to clean up all tracked references once any promise settles

**Security Focus:**
- Prevents memory leaks from unresolved promises in races
- Properly handles primitives, objects, and thenables
- Ensures cleanup happens even if exceptions occur

### 3. `makeReleasingExecutorKit()`
Returns executor functions that drop references once they've been used, preventing them from staying in memory.

### 4. `isPromise()`
A type guard function that checks if a value is a Promise instance.

## Security Considerations

### Memory Leak Prevention
The package addresses a subtle memory leak issue in traditional `Promise.race()` implementations. Regular `Promise.race()` doesn't clean up references to unresolved promises, which can lead to memory leaks when racing with long-running or indefinite promises.

**Example of the Leak:**
```javascript
const longer = new Promise(() => {}); // Will never resolve
const faster = Promise.resolve('done');

// Even after 'done' resolves, 'longer' is still tracked
Promise.race([faster, longer]);

// 'longer' may not be garbage collected immediately
```

**Comparison:**
- **Standard `Promise.race()`:** Leaks reactions on non-resolved promises
- **`racePromises()`:** Cleans up all references after any promise settles

### Hardening for SES
The package uses `@endo/harden` to return hardened objects, ensuring proper encapsulation in SES (Secure ECMAScript) environments.

### Type Safety
Type definitions are provided for:
- `PromiseKit<T>` - Promise along with resolve/reject
- `ERef<T>` - A reference to a value that can be T or PromiseLike<T>

## Architecture and Implementation

### File Structure
```
@endo/promise-kit/
├── index.js                 # Main entry point
├── types/                   # TypeScript type definitions
├── lib/                     # Source files (bundled)
├── README.md               # Documentation
└── package.json
```

### Key Implementation Files (lib/):
1. `promiseKit.ts` - Main implementation
2. `nonLeakyRace.ts` - Race implementation
3. `isPromise.ts` - Type guard

### Dependencies:
- **@endo/harden:** Provides hardening utilities for SES
- **ses:** Secure ECMAScript execution environment

## Usage Examples

### Basic Promise Creation
```javascript
import { makePromiseKit } from '@endo/promise-kit';

const { promise, resolve } = makePromiseKit();

setTimeout(() => {
  resolve('Success!');
}, 100);

console.log(await promise); // Output: Success!
```

### Using racePromises
```javascript
import { racePromises } from '@endo/promise-kit';

const fast = Promise.resolve('won');
const slow = new Promise(r => setTimeout(r, 2000, 'lost'));

// 'won' wins, and 'slow' is cleaned up
const result = await racePromises([fast, slow]);

console.log(result); // Output: won
```

### Event Handling Pattern
```javascript
import { makePromiseKit } from '@endo/promise-kit';

function waitForEvent(eventName) {
  const { promise, resolve, reject } = makePromiseKit();

  const handler = (data) => {
    resolve(data);
    removeListener();
  };

  const removeListener = addListener(eventName, handler);

  return promise;
}

// Usage
const data = await waitForEvent('data');
```

## Testing Approach

### Test Coverage
Tests verify:
1. Basic promise creation and resolution/rejection
2. Memory cleanup in race scenarios
3. Handling primitives, objects, and thenables
4. Proper hardening behavior
5. Integration with SES environment

### Leak Detection Tests
The tests use FinalizationRegistry to detect when references are properly cleaned up:
- Creates promises that will never resolve
- Races them with other promises
- Verifies cleanup happens after race completes

## Migration Path

### From Promise.withResolvers()
In ES2023+, `Promise.withResolvers()` provides similar functionality:
```javascript
const { promise, resolve, reject } = Promise.withResolvers();
```

**Why still use @endo/promise-kit?**
1. Provides non-leaky `racePromises()`
2. More explicit type definitions
3. Better integration with SES
4. Consistent pattern within Endo ecosystem
5. Works in browsers without ES2023 support

### Old Package Names
Prior releases were:
- `@agoric/promise-kit`
- `@agoric/make-promise`
- `@agoric/produce-promise`

Migrated to `@endo/promise-kit` in 2021.

## Known Issues and Limitations

1. **SES Compatibility:** Requires proper hardening and may not work in all ES versions
2. **Complexity:** Non-leaky race implementation is more complex than native
3. **Version Support:** TypeScript version ~4.2 (in some releases)

## Performance Considerations

- **Overhead:** `racePromises()` has slightly more overhead than native `Promise.race()`
- **Memory:** Reduces memory pressure by cleaning up references
- **GC Impact:** Improves garbage collection efficiency

## Recommendations

### Use cases where this package is ideal:
1. **SES Environments:** When working with security-conscious code execution
2. **Memory-Constraint Systems:** Where memory leaks are unacceptable
3. **Race Conditions:** When safe race operations are required
4. **Event-Driven Systems:** Where promises need to be created dynamically

### Consider alternatives:
1. Native `Promise.withResolvers()` (ES2023+) for simple cases
2. Native `Promise.race()` for non-critical memory situations
3. Native `Promise.allSettled()` for complex race scenarios

## Dependencies Analysis

### @endo/harden
- Purpose: Provides hardening utilities for SES
- Impact: Security and encapsulation
- Version: Compatible with multiple SES versions

### ses
- Purpose: Secure ECMAScript execution environment
- Impact: Execution model and security
- Version: External dependency

## Conclusion

`@endo/promise-kit` is a critical package in the Endo ecosystem that provides safe, memory-efficient promise utilities. Its non-leaky race implementation addresses a significant security concern in traditional promise APIs, making it essential for production systems. While it has some performance overhead, the memory benefits and security advantages make it worth the cost in most scenarios, particularly in SES environments.

## Version History Highlights

- **1.2.0** (2023+): Latest version with proper hardening
- **0.2.60** (2023): Various bug fixes
- **0.2.43** (2022): Added non-leaky `racePromises()`
- **1.0.0** (2023): Major version after reorganization
- **0.0.1-0.2.41** (2020-2021): Evolution from `@agoric/promise-kit`

## References

- GitHub Repository: https://github.com/endojs/endo/tree/master/packages/promise-kit
- PRs related to promise-kit: #1241, #1465, #1983, #3397, #1021
- Security Issue Reports: HackerOne links throughout history
- TypeScript Issues: Type generation and compilation problems addressed

## Last Updated
Based on package version 1.2.0, current as of investigation date.