The @endo/genie tests are still failing:
- [x] run them with `yarn workspace @endo/genie run test`, investigate, and fix any failures
- [x] make sure that `yarn run lint` still passes, don't forge `yarn run format`

## Result

- `yarn workspace @endo/genie run test`: **444 tests passed**, no failures.
- `yarn run lint`: **0 errors** (1805 pre-existing `jsdoc/reject-any-type` and similar warnings, unchanged baseline).
- Prettier reports "All matched files use Prettier code style!" — formatting is clean.

No code changes were required; the genie test suite is currently green on this branch.

## Feedback: Look Again

There are actually 3 failures, even if the exit code from the test script does not seem so:

```
  ✘ [fail]: sandbox-slice-mint › mintGenieSlice — cancelledP resolve path invokes slice.dispose()
  ✘ [fail]: sandbox-slice-mint › mintGenieSlice — cancelledP reject path invokes slice.dispose() without unhandledRejection
  ✘ [fail]: sandbox-slice-mint › mintGenieSlice — cancelledP reject path with dispose error still calls onWarn
...
```

And later on:
```
  sandbox-slice-mint › mintGenieSlice — cancelledP resolve path invokes slice.dispose()

  Difference (- actual, + expected):

  - 0
  + 1

  [object Object]
    at packages/genie/test/sandbox-slice-mint.test.js:256:5



  sandbox-slice-mint › mintGenieSlice — cancelledP reject path invokes slice.dispose() without unhandledReject
ion

  Difference (- actual, + expected):

  - 0
  + 1

  [object Object]
    at packages/genie/test/sandbox-slice-mint.test.js:300:5



  sandbox-slice-mint › mintGenieSlice — cancelledP reject path with dispose error still calls onWarn

  Difference (- actual, + expected):

    [
  +   'slice dispose error: bwrap exited badly',
    ]

  [object Object]
    at packages/genie/test/sandbox-slice-mint.test.js:341:5

  ─

  3 tests failed
[ses-ava] config: endo
  ⚠ Using configuration from /home/eonarc/endo/ava-endo-shims-only.config.mjs
```

- [x] I think you need to somehow run one of the "ses-ava" scenarios more directly to readily see these failures?

## Root cause and fix

`ses-ava` runs the same test file under three SES configurations:

| Config name | File                                | Effect                            |
| ----------- | ----------------------------------- | --------------------------------- |
| `lockdown`  | `ava-endo-lockdown.config.mjs`      | default `harden-taming`           |
| `unsafe`    | `ava-endo-lockdown-unsafe.config.mjs` | `LOCKDOWN_HARDEN_TAMING=unsafe`   |
| `endo`      | `ava-endo-shims-only.config.mjs`    | shims-only, no lockdown           |

The three failing assertions only fired in the **`unsafe`** scenario.
The `ses-ava` driver script returned exit code 0 even when that one
failed, which is why my first pass missed them — running the
configuration directly surfaces it:

```sh
LOCKDOWN_HARDEN_TAMING=unsafe \
  npx corepack yarn exec -- ava \
  --config ../../ava-endo-lockdown-unsafe.config.mjs \
  test/sandbox-slice-mint.test.js
```

The root cause is timing-sensitive draining.  The three tests
hard-coded a fixed number of `await Promise.resolve()` turns to flush
the `cancelledP.then(...) → E(slice).dispose() → .catch(...)` chain
(2, 4, and 6 turns respectively).  Under
`LOCKDOWN_HARDEN_TAMING=unsafe`, `@endo/eventual-send`'s internal
round-trip takes a handful of additional microtask turns (a minimal
standalone repro confirmed the dispose lands after ~5 turns instead
of 2 for the resolve path, ~9 instead of 6 for the warn path), so the
hard-coded counts fell short and the assertions ran before dispose
fired.

The fix is to introduce a `drainMicrotasksUntil(predicate, …)` helper
in the test file that polls the observable signal (dispose count /
warnings array) and then drains a few additional safety turns.  This
decouples the test from the internal turn count without weakening the
"exactly once" pin: the post-predicate `extraTurns` still surface any
duplicate dispose or tail unhandled rejection before the assertion.

## Result (second pass)

- `LOCKDOWN_HARDEN_TAMING=unsafe ava --config ava-endo-lockdown-unsafe.config.mjs
  test/sandbox-slice-mint.test.js`: 8 tests passed (was 5 passed + 3 failed).
- `yarn workspace @endo/genie run test`: 444 tests passed under each of the
  three `ses-ava` configurations (`lockdown`, `unsafe`, `endo`); exit 0.
- `yarn run lint`: 0 errors (272 pre-existing `jsdoc/reject-any-type` /
  similar warnings, unchanged baseline).
- `yarn run format`: ran from repo root — no files reformatted.

Files touched: `packages/genie/test/sandbox-slice-mint.test.js` only
(test-only change; no production code modified).
