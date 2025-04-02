User-visible changes to `@endo/import-bundle`:

# Next release

- The `'endoZipBase64'` moduleFormat now utilizes the `importHook` option.

# v1.4.0 (2025-03-11)

- Adds support for `test` format bundles, which simply return a promise for an
  object that resembles a module exports namespace with the objects specified
  on the symbol-named property @exports, which is deliberately not JSON
  serializable or passable.
- Exports a `typedImportBundle<ExpectedNamespaceType>` function so consumers
  can subscribe to a narrower type.

# v1.3.0 (2024-10-10)

- Adds support for `endoScript` format bundles.

# v1.2.1 (2024-08-01)

- Fixes support for `inescapableGlobalProperties` in the `endoZipBase64` format
  that had been lost due to changes to the `Compartment` interface.

# v1.2.0 (2024-07-30)

- The `inescapableGlobalProperties` option is changed from supporting only
  string-named enumerable own properties to supporting all own properties
  whether string-named or symbol-named, and whether enumerable or not.
  But, see
  https://github.com/endojs/endo/blob/master/packages/import-bundle/src/compartment-wrapper.md
  for the longer term plan.

# 0.4.0 (2023-08-07)

- Introduces support for a source map cache.
  `bundleSource` now generates source maps.
  To debug a bundle on the same host that generated the bundle, pass a
  `computeSourceMapLocation` capability into the `powers` of `importBundle`.
  The `@endo/import-bundle/source-map-node.js` module exports such a
  capability for Node.js.

# Release ?? (date)

- first release
