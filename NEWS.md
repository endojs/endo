User-visible changes in eventual-send:

## Release ???

Removed obsolete `HandledPromise.unwrap` and `E.unwrap` functions.

## Release 0.5.0 (17-Dec-2019)

Implement updated `HandledPromise` interface (#6):
  * use `new HandledPromise(...args)` instead of `Promise.makeHandled(...args)`
  * use `HandledPromise.resolve(x)` (exported also as `E.resolve(x)`) which
    returns x if it is already a HandledPromise or Promise, or x's corresponding
    HandledPromise, or a new HandledPromise
  * the promise handler now uses `get` instead of `GET` and `applyMethod` instead of `POST`
  * delete, has, and set traps and their corresponding `E` operations have been removed as per the spec
  * the `E.C` experimental "eventual chain" proxy has been removed

Moved from https://github.com/Agoric/eventual-send into the monorepo at
https://github.com/Agoric/agoric-sdk .
