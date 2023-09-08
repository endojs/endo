
# Next

- The `@endo/bundle-source/cache.js` maker now accepts additional optional
  arguments: `pid` and `nonce`, with reasonable defaults.
  Providing the `pid` can make it easier to clean up scratch files if
  the bundler is interrupted, since deleting any scratch file with the PID of a
  non-running process is safe.

# v2.6.0 (2023-08-07)

- Introduces a `cacheSourceMaps` option that is `false` by default.
  This causes the bundler to cache a source map for each physical module and
  stores it in the Endo user's cache directory.
  Use `endo where cache` to find these artifacts (from `@endo/cli`).

# v2.5.0 (2023-04-14)

- Separates the `bundle-source` entrypoint from the new
  `@endo/bundle-source/cache.js` importable library.

# v2.3.0 (2022-09-14)

- Adds a `--cache-json` mode that:
  - Generates `.json` bundle files in JSON format.
  - Generates `-json-meta.json` meta files in JSON format.
- Adds a `--cache-js` mode that should replace `--to`:
  - Generates `.js` bundle files in JSON format.
    Adds a UNIX newline absent when using `--to`.
  - Generates `-json-meta.json` meta files in JSON format instead of
    `-meta.js`.

# v2.1.4 (2022-04-14)

- Adds a `bundle-source` command line tool that supports build caching.

# v2.1.0 (2022-03-01)

- Bundles generated with the module format `endoZipBase64` (the current
  default) will now also contain an `endoZipBase64Sha512` property with a
  consistent hash suitable for verifying the integrity of a bundle.
  The hash is that of the `compartment-map.json` in the bundle zip archive,
  which in turn contains the hashes of every other file in the archive.
  A new package, `@endo/check-bundle` will provide a mechanism for
  verifying bundle integrity.
