
## Next

- Introduces support for a source map cache.
  `bundleSource` now generates source maps.
  To debug a bundle on the same host that generated the bundle, pass a
  `computeSourceMapLocation` capability into the `powers` of `importBundle`.
  The `@endo/import-bundle/source-map-node.js` module exports such a
  capability for Node.js.

## Release ?? (date)

- first release
