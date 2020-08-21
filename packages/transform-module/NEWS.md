
# Next release

* No changes yet

# v0.4.1 (2020-08-20)

* Removes extraneous dependencies that blocked installation.

# v0.4.0 (2020-08-20)

* This version changes the contract of all functions that receive a Babel
  dependency from accepting an object implementing { transformSync and
  transformFromAstSync } to merely { transform and transformFromAst }.
  The former were exported by `@babel/core`, but we are now using the
  API that surfaces from `@babel/standalone` and our fork
  `@agoric/babel-standalone`.
* Module static records are now frozen.
