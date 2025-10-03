User-visible changes to netstring:

# Next release

- Relaxes dependence on a global, post-lockdown `harden` function by taking a
  dependency on the new `@endo/harden` package.
  Consequently, bundles will now entrain a `harden` implementation that is
  superfluous if the bundled program is guaranteed to run in a post-lockdown
  HardenedJS environment.
  To compensate, use `bundle-source` with `-C hardened` or the analgous feature
  for packaging conditions with your preferred bundler tool.
  This will hollow out `@endo/harden` and defer exclusively to the global
  `harden`.

# v0.3.18 (2022-09-14)

- Adds a maxMessageLength option for protection against denial of service.
- Adds a chunked mode for writers.
- Allows allocation avoidance for writers that can forward an array of byte arrays.

# v0.3.0 (2022-01-21)

- *BREAKING*: This package is now hardened and depends on Hardened JavaScript
  and remotable promises (eventual send).
  Use `@endo/init` before initializing this module.

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
