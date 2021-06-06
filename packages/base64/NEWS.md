User-visible changes in base64:

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
