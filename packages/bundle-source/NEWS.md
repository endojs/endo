
# Next release

- Bundles generated with the module format `endoZipBase64` (the current
  default) will now also contain an `endoZipBase64Sha512` property with a
  consistent hash suitable for verifying the integrity of a bundle.
  The hash is that of the `compartment-map.json` in the bundle zip archive,
  which in turn contains the hashes of every other file in the archive.
  A new package, `@endo/check-bundle` will provide a mechanism for
  verifying bundle integrity.
