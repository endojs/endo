# @endo/common

## [1.2.13](https://github.com/endojs/endo/compare/@endo/common@1.2.12...@endo/common@1.2.13) (2025-07-12)

**Note:** Version bump only for package @endo/common

## [1.2.12](https://github.com/endojs/endo/compare/@endo/common@1.2.11...@endo/common@1.2.12) (2025-06-17)

**Note:** Version bump only for package @endo/common

## [1.2.11](https://github.com/endojs/endo/compare/@endo/common@1.2.10...@endo/common@1.2.11) (2025-06-02)

**Note:** Version bump only for package @endo/common

## [1.2.10](https://github.com/endojs/endo/compare/@endo/common@1.2.9...@endo/common@1.2.10) (2025-03-24)

**Note:** Version bump only for package @endo/common

## [1.2.9](https://github.com/endojs/endo/compare/@endo/common@1.2.8...@endo/common@1.2.9) (2025-01-24)

**Note:** Version bump only for package @endo/common

## [1.2.8](https://github.com/endojs/endo/compare/@endo/common@1.2.7...@endo/common@1.2.8) (2024-11-13)

**Note:** Version bump only for package @endo/common

## [1.2.7](https://github.com/endojs/endo/compare/@endo/common@1.2.6...@endo/common@1.2.7) (2024-10-22)

**Note:** Version bump only for package @endo/common

## [1.2.6](https://github.com/endojs/endo/compare/@endo/common@1.2.5...@endo/common@1.2.6) (2024-10-10)

**Note:** Version bump only for package @endo/common

## [1.2.5](https://github.com/endojs/endo/compare/@endo/common@1.2.4...@endo/common@1.2.5) (2024-08-27)

**Note:** Version bump only for package @endo/common

## [1.2.4](https://github.com/endojs/endo/compare/@endo/common@1.2.3...@endo/common@1.2.4) (2024-08-01)

**Note:** Version bump only for package @endo/common

## [1.2.3](https://github.com/endojs/endo/compare/@endo/common@1.2.2...@endo/common@1.2.3) (2024-07-30)

### Bug Fixes

* **types:** fromUniqueEntries ([e465ffb](https://github.com/endojs/endo/commit/e465ffb7a48fbebf0525a86a2423a5b84d8b1feb))

## [1.2.2](https://github.com/endojs/endo/compare/@endo/common@1.2.1...@endo/common@1.2.2) (2024-05-07)

**Note:** Version bump only for package @endo/common

## [1.2.1](https://github.com/endojs/endo/compare/@endo/common@1.2.0...@endo/common@1.2.1) (2024-04-04)

**Note:** Version bump only for package @endo/common

## [1.2.0](https://github.com/endojs/endo/compare/@endo/common@1.1.0...@endo/common@1.2.0) (2024-03-20)

### Features

* **ses-ava:** import test from @endo/ses-ava/prepare-endo.js ([#2133](https://github.com/endojs/endo/issues/2133)) ([9d3a7ce](https://github.com/endojs/endo/commit/9d3a7ce150b6fd6fe7c8c4cc43da411e981731ac))

## [1.1.0](https://github.com/endojs/endo/compare/@endo/common@1.0.3...@endo/common@1.1.0) (2024-02-23)

- `throwLabeled` parameterized error construction
  - Like the assertion functions/methods that were parameterized by an error
    constructor (`makeError`, `assert`, `assert.fail`, `assert.equal`),
    `throwLabeled` now also accepts named options `cause` and `errors` in its
    immediately succeeding `options` argument.
  - Like those assertion functions, the error constructor argument to
    `throwLabeled` can now be an `AggregateError`.
    If `throwLabeled` makes an error instance, it encapsulates the
    non-uniformity of the `AggregateError` construction arguments, allowing
    all the error constructors to be used polymorphically
    (generic / interchangeable).
  - The error constructor argument is now typed `GenericErrorConstructor`,
    effectively the common supertype of `ErrorConstructor` and
    `AggregateErrorConstructor`.

## [1.0.3](https://github.com/endojs/endo/compare/@endo/common@1.0.2...@endo/common@1.0.3) (2024-02-15)

**Note:** Version bump only for package @endo/common

## 1.0.2 (2024-01-18)

### Bug Fixes

* **common:** fix @endo/common integration breakage ([#1963](https://github.com/endojs/endo/issues/1963)) ([73b5059](https://github.com/endojs/endo/commit/73b50590b7aef7eaffe2c435286fb291bf9b22bf))
