User-visible changes to netstring:

# Next release

- *BREAKING*: This package is now hardened and depends on Hardened JavaScript.
  Use the `ses` shim and call `lockdown()` before initializing this module.

# 0.2.9 (2021-10-14)

- Adds support for concurrent writes.

# 0.2.0 (2021-06-01)

- *BREAKING*: Removes CommonJS and UMD downgrade compatibility.
  Supporting both Node.js ESM and the `node -r esm` shim requires the main
  entry point module to be ESM regardless of environment.
  UMD and CommonJS facets will likely return after all dependees have migrated
  away from depending upon the `esm` JavaScript module emulator.
- Fixes a problem with the external visibility of TypeScript types.

# 0.1.0 (2021-04-26)

- Initial release
