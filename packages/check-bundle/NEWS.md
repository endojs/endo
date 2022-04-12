
# 0.2.0 (2022-04-11)

- *BREAKING:* the `@endo/check-bundle` module exports Node.js convenience
  functions that reach for Node.js specific powerful modules like `fs` and
  `crypto`.  The `checkBundle` function now accepts a bundle object,
  `checkBundleFile` accepts a path, and `checkBundleBytes` accepts a
  TypedArray.
- *BREAKING:* bundles must now consist entirely of string type value properties
  and must not have any accessors, in addition to frozen.
