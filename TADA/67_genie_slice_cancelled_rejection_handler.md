# Genie slice: add rejection handler (or `allSettled`) on `cancelledP` teardown

**Status: done.**  Landed the two-arm `.then` shape (option A) on
`packages/genie/src/sandbox/slice.js` plus three pin tests in
`packages/genie/test/sandbox-slice-mint.test.js`.  `yarn lint` clean
on the changed files; `npx ava test/sandbox-slice-mint.test.js`
reports 8/8 passing (5 pre-existing + 3 new).

Follow-up from
[`60_genie_sandbox_review.md`](./60_genie_sandbox_review.md)
juror should-fix finding on `slice.js:386`.

`packages/genie/src/sandbox/slice.js:385-395` registers the slice
teardown as:

```js
if (cancelledP !== undefined) {
  cancelledP.then(() => {
    E(slice).dispose().catch(disposeErr => { ... });
  });
}
```

Today this is safe because `main.js`'s only call site
(`spawnAgent`) calls `cancel(undefined)` — the resolve path.  A future
caller that *rejects* the kit (e.g. to signal "tear down because the
worker is unhealthy") will leak the slice silently and trip the
node-level `unhandledRejection` warning.

## Plan

- [x] **Pick a teardown shape.**  Chose **option A** (two-arm
  `.then`).  The implementation now reads:

  ```js
  cancelledP
    .then(
      () => E(slice).dispose(),
      () => E(slice).dispose(),
    )
    .catch(disposeErr => {
      const message =
        /** @type {Error} */ (disposeErr).message || String(disposeErr);
      onWarn(`slice dispose error: ${message}`);
    });
  ```

  The chained `.catch` after the two-arm `.then` consumes a
  `dispose()` rejection from *either* arm with the same `"slice
  dispose error: …"` prefix the resolve path emitted before, so the
  warning surface stays byte-identical for existing callers.

- [x] **Test.**  Added three pin tests in
  `packages/genie/test/sandbox-slice-mint.test.js` under the
  "`cancelledP` teardown" heading:
  - **resolve path** — `cancel(undefined)` invokes `dispose()`
    exactly once (regression guard so the existing call site does
    not break).
  - **reject path** — `reject(new Error(...))` invokes `dispose()`
    exactly once **and** no `unhandledRejection` is captured by the
    `process.on('unhandledRejection', …)` listener registered for
    the test (a leak here would imply the reject arm or the
    chained `.catch` regressed).
  - **reject path + dispose error** — when `slice.dispose()` itself
    rejects on the reject arm, the chained `.catch` hands the
    failure to a spy `onWarn` with the existing `"slice dispose
    error: …"` prefix and *still* swallows the rejection (no
    `unhandledRejection`).

  Helpers (`makeInspectableSliceHandle`, `makeFactoryWithHandle`,
  `captureUnhandledRejections`) live next to the tests so future
  cancellation-shape tests have a ready-made fixture.

- [x] **JSDoc** on `MintGenieSliceOptions.cancelledP`: rewrote the
  prose to say "resolution **or** rejection" and called out the
  defense-in-depth rationale ("future caller that uses
  `reject(reason)` to signal 'tear down because the worker is
  unhealthy'") so the next reader does not delete the reject arm as
  dead code.  A sibling inline comment above the `.then` re-states
  the rationale at the call site.

## Out of scope

- Adding a separate `disposed` promise to `MintedGenieSlice` for
  callers that want to observe teardown completion.  No current call
  site needs it; defer until one does.
