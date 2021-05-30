
# Next release

* *BREAKING CHANGE* This package has been renamed `@endo/static-module-record`.
* *BREAKING CHANGE* This package now only exports a `StaticModuleRecord`
  constructor, suitable for use with the SES shim `importHook` starting with
  version 0.13.0.
* *BREAKING*: Removes CommonJS and UMD downgrade compatibility.
  Supporting both Node.js ESM and the `node -r esm` shim requires the main
  entry point module to be ESM regardless of environment.
  UMD and CommonJS facets will likely return after all dependees have migrated
  away from depending upon the `esm` JavaScript module emulator.

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
