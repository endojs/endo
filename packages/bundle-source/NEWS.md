# Next release

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
