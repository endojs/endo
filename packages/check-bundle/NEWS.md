
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

# 0.2.0 (2022-04-11)

- *BREAKING:* the `@endo/check-bundle` module exports Node.js convenience
  functions that reach for Node.js specific powerful modules like `fs` and
  `crypto`.  The `checkBundle` function now accepts a bundle object,
  `checkBundleFile` accepts a path, and `checkBundleBytes` accepts a
  TypedArray.
- *BREAKING:* bundles must now consist entirely of string type value properties
  and must not have any accessors, in addition to frozen.
