User-visible changes in base64:

- Export `atob.js`, `btoa.js` for compatibility with the Web and Node.js APIs of
  the same name.  Also add `shim.js` to install them on `globalThis.atob` and
  `globalThis.btoa` if they are missing.

# 0.2.8 (2021-09-18)

- Use native `Base64.encode` or `Base64.decode` if available in global scope.
  This addresses a performance problem on XS by taking advantage of native code
  implementations.
  This makes `base64` a "ponyfill".

# 0.2.1 (2021-06-05)

- Packaging fixes.

# 0.2.0 (2021-06-01)

- *BREAKING*: Removes CommonJS and UMD downgrade compatibility.
  Supporting both Node.js ESM and the `node -r esm` shim requires the main
  entry point module to be ESM regardless of environment.
  UMD and CommonJS facets will likely return after all dependees have migrated
  away from depending upon the `esm` JavaScript module emulator.
- Separates entry points for `@endo/base64/encode.js` and
  `@endo/base64/decode.js`, in addition to the combined entry point at
  `@endo/base64`.
- Expose internal `package.json` through Node.js ESM `exports` for the benefit
  of `svelte` tooling.

# 0.1.0

- Initial version.
