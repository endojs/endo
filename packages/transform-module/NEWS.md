# Next release BREAKING CHANGES

* This version changes the contract of all functions that receive a Babel
  dependency from accepting an object implementing { transformSync and
  transformFromAstSync } to merely { transform and transformFromAst }.
  The former were exported by `@babel/core`, but we are now using the
  API that surfaces from `@babel/standalone` and our fork
  `@agoric/babel-standalone`.
* Module static records are now frozen.
