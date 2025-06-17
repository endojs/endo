User visible changes in `@endo/immutable-arraybuffer`:

# 1.1.1 (2025-06-17)

- Captures `structuredClone` early so that scuttling all properties of `globalThis`
  after initializing `@endo/immutable-arraybuffer` or
  `@endo/immutable-arraybuffer/shim.js` does not interfere with this module's
  designed behavior.

# 1.0.0 (2025-05-07)

First release.
