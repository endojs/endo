---
'@endo/bundle-source': minor
'@endo/captp': minor
'@endo/check-bundle': minor
'@endo/common': minor
'@endo/eventual-send': minor
'@endo/exo': minor
'@endo/import-bundle': minor
'@endo/lp32': minor
'@endo/marshal': minor
'@endo/memoize': minor
'@endo/nat': minor
'@endo/netstring': minor
'@endo/pass-style': minor
'@endo/patterns': minor
'@endo/promise-kit': minor
'@endo/stream-node': minor
'@endo/stream': minor
'@endo/zip': minor
---

- Relaxes dependence on a global, post-lockdown `harden` function by taking a
  dependency on the new `@endo/harden` package.
  Consequently, bundles will now entrain a `harden` implementation that is
  superfluous if the bundled program is guaranteed to run in a post-lockdown
  HardenedJS environment.
  To compensate, use `bundle-source` with `-C hardened` or the analogous feature
  for packaging conditions with your preferred bundler tool.
  This will hollow out `@endo/harden` and defer exclusively to the global
  `harden`.
