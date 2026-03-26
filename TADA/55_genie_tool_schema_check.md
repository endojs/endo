# Work on @endo/genie command tool

- [x] `packages/genie/src/tools/common.js` circa line 90
  - Resolved by extracting the `MethodGuardPayload` from the tool's
    schema via `getMethodGuardPayload`, pre-computing a `paramsPattern`
    with `M.splitArray`, and calling `mustMatch(harden([args]),
    paramsPattern, label)` before dispatching to the underlying
    `execute`.  This follows the same validation approach used by
    `@endo/exo`'s `defendSyncArgs`.
