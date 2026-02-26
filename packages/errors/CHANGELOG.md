# @endo/errors

## 1.3.0

### Minor Changes

- [#3082](https://github.com/endojs/endo/pull/3082) [`2e00276`](https://github.com/endojs/endo/commit/2e00276ce0f08beb5e5259b8df195063fe008fe7) Thanks [@boneskull](https://github.com/boneskull)! - - Exports `assert.details` under its own name (i.e., `details`).
  - `hideAndHardenFunction` - If a function `foo` is first frozen with `hideAndHardenFunction(foo)` rather than `freeze(foo)` or `harden(foo)`, then `foo.name` is changed from `'foo'` to `'__HIDE_foo'`. When `stackFiltering: 'concise'` or `stackFiltering: 'omit-frames'`, then (currently only on v8), the stack frames for that function are omitted from the stacks reported by our causal console.
  - The new `Rejector` type supports the confirmFoo/reject pattern:

    ```js
    @import {FAIL, hideAndHardenFunction} from '@endo@errors';
    @import {Rejector} from '@endo/errors/rejector.js';

    const confirmFoo = (specimen, reject: Rejector) =>
      test(specimen) || reject && reject`explanation of what went wrong`;

    export const isFoo = specimen => confirmFoo(specimen, false);
    hideAndHardenFunction(isFoo);

    export const assertFoo = specimen => {
      confirmFoo(specimen, FAIL);
    };
    hideAndHardenFunction(assertFoo);
    ```

    Both `false` and `Fail` satisfy the `Rejector` type.
    We also deprecate the old checkFoo/assertChecker pattern from @endo/common.
    The exported `isFoo` and `assertFoo` behave the same as they had when then they were using the checkFoo/assertChecker pattern, but are now internally faster and clearer.

### Patch Changes

- Updated dependencies [[`2e00276`](https://github.com/endojs/endo/commit/2e00276ce0f08beb5e5259b8df195063fe008fe7), [`029dcc4`](https://github.com/endojs/endo/commit/029dcc464cd93bc7380da45e694585ab2f7aa139), [`a29ecd4`](https://github.com/endojs/endo/commit/a29ecd44c788440faf016f1f8e658a5a364d6181)]:
  - ses@1.15.0
  - @endo/harden@1.1.0

## [1.2.13](https://github.com/endojs/endo/compare/@endo/errors@1.2.12...@endo/errors@1.2.13) (2025-07-12)

**Note:** Version bump only for package @endo/errors

## [1.2.12](https://github.com/endojs/endo/compare/@endo/errors@1.2.11...@endo/errors@1.2.12) (2025-06-17)

**Note:** Version bump only for package @endo/errors

## [1.2.11](https://github.com/endojs/endo/compare/@endo/errors@1.2.10...@endo/errors@1.2.11) (2025-06-02)

**Note:** Version bump only for package @endo/errors

## [1.2.10](https://github.com/endojs/endo/compare/@endo/errors@1.2.9...@endo/errors@1.2.10) (2025-03-24)

**Note:** Version bump only for package @endo/errors

## [1.2.9](https://github.com/endojs/endo/compare/@endo/errors@1.2.8...@endo/errors@1.2.9) (2025-01-24)

**Note:** Version bump only for package @endo/errors

## [1.2.8](https://github.com/endojs/endo/compare/@endo/errors@1.2.7...@endo/errors@1.2.8) (2024-11-13)

**Note:** Version bump only for package @endo/errors

## [1.2.7](https://github.com/endojs/endo/compare/@endo/errors@1.2.6...@endo/errors@1.2.7) (2024-10-22)

**Note:** Version bump only for package @endo/errors

## [1.2.6](https://github.com/endojs/endo/compare/@endo/errors@1.2.5...@endo/errors@1.2.6) (2024-10-10)

**Note:** Version bump only for package @endo/errors

## [1.2.5](https://github.com/endojs/endo/compare/@endo/errors@1.2.4...@endo/errors@1.2.5) (2024-08-27)

**Note:** Version bump only for package @endo/errors

## [1.2.4](https://github.com/endojs/endo/compare/@endo/errors@1.2.3...@endo/errors@1.2.4) (2024-08-01)

**Note:** Version bump only for package @endo/errors

## [1.2.3](https://github.com/endojs/endo/compare/@endo/errors@1.2.2...@endo/errors@1.2.3) (2024-07-30)

**Note:** Version bump only for package @endo/errors

## [1.2.2](https://github.com/endojs/endo/compare/@endo/errors@1.2.1...@endo/errors@1.2.2) (2024-05-07)

**Note:** Version bump only for package @endo/errors

## [1.2.1](https://github.com/endojs/endo/compare/@endo/errors@1.2.0...@endo/errors@1.2.1) (2024-04-04)

**Note:** Version bump only for package @endo/errors

## [1.2.0](https://github.com/endojs/endo/compare/@endo/errors@1.1.0...@endo/errors@1.2.0) (2024-03-20)

### Features

- **ses-ava:** import test from @endo/ses-ava/prepare-endo.js ([#2133](https://github.com/endojs/endo/issues/2133)) ([9d3a7ce](https://github.com/endojs/endo/commit/9d3a7ce150b6fd6fe7c8c4cc43da411e981731ac))

## [1.1.0](https://github.com/endojs/endo/compare/@endo/errors@1.0.3...@endo/errors@1.1.0) (2024-02-23)

### Features

- **ses:** permit Promise.any, AggregateError ([6a8c4d8](https://github.com/endojs/endo/commit/6a8c4d8795c991cdaf542d5dcb691aae4e989d79))

### Bug Fixes

- **errors:** Fix backward-compat for bare export ([ef7b9f0](https://github.com/endojs/endo/commit/ef7b9f041e8e3dc2ba92660b0ea918612d7c5bef))
- **ses,pass-style,marshal:** tolerate platforms prior to AggregateError ([5762dd4](https://github.com/endojs/endo/commit/5762dd48e814e2e8435f666019e527d982eddbbd))

## [1.0.3](https://github.com/endojs/endo/compare/@endo/errors@1.0.2...@endo/errors@1.0.3) (2024-02-15)

### Bug Fixes

- Add repository directory to all package descriptors ([e5f36e7](https://github.com/endojs/endo/commit/e5f36e7a321c13ee25e74eb74d2a5f3d7517119c))

## [1.0.2](https://github.com/endojs/endo/compare/@endo/errors@1.0.1...@endo/errors@1.0.2) (2024-01-18)

**Note:** Version bump only for package @endo/errors

## [1.0.1](https://github.com/endojs/endo/compare/@endo/errors@1.0.0...@endo/errors@1.0.1) (2023-12-20)

**Note:** Version bump only for package @endo/errors

## [1.0.0](https://github.com/endojs/endo/compare/@endo/errors@0.1.1...@endo/errors@1.0.0) (2023-12-12)

### Bug Fixes

- Adjust type generation in release process and CI ([9465be3](https://github.com/endojs/endo/commit/9465be369e53167815ca444f6293a8e9eb48501d))

## 0.1.1 (2023-09-12)

### Bug Fixes

- **assert:** mistyped assert.fail ([e1ebe75](https://github.com/endojs/endo/commit/e1ebe75845e21470b2b732a6417d35c4106df6b8))
