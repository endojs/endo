# @endo/pass-style

## [1.6.3](https://github.com/endojs/endo/compare/@endo/pass-style@1.6.2...@endo/pass-style@1.6.3) (2025-07-12)

- The exported function name `isObject` is ambiguous. It is unclear whether it
  includes functions or not. (It does.) To avoid this confusion, we're
  deprecating `isObject` and suggesting to use the new export `isPrimitive`
  instead, that has the opposite answer. IOW, for all `x`, `isObject(x) ===
  !isPrimitive(x)`

## [1.6.2](https://github.com/endojs/endo/compare/@endo/pass-style@1.6.1...@endo/pass-style@1.6.2) (2025-06-17)

- Fixes, without qualification, so that the package initializes on platforms
  that lack `ArrayBuffer.prototype.transferToImmutable` and recognizes
  immutable ArrayBuffers as having a pass-style of `byteArray` on platforms
  have a `sliceToImmutable`, even if that is emulated with a shim using
  `slice`, even if they lack `transferToImmutable`.

## 1.6.1 (2024-06-17)

**BROKEN BUT PATCHED** in 1.6.2, contains a fix but published with broken
dependency versions.
Inadvertently published without amending workspace protocol dependencies.

- Fixes so that the package initializes on platforms that lack
  `ArrayBuffer.prototype.transferToImmutable` and recognizes immutable
  ArrayBuffers as having a pass-style of `byteArray` on platforms have a
  `sliceToImmutable`, even if that is emulated with a shim using `slice`, even
  if they lack `transferToImmutable`.

## [1.6.0](https://github.com/endojs/endo/compare/@endo/pass-style@1.5.0...@endo/pass-style@1.6.0) (2025-06-02)

**BROKEN BUT PATCHED** in 1.6.2, this version introduced a dependence on the
underlying platform supporting `ArrayBuffer.prototype.transferToImmutable`.
The patch restores the ability to use `pass-style` on older platforms without
the immutable `ArrayBuffer` shim (as entrained by `ses`).

- Introduces support for `byteArray`.

## [1.5.0](https://github.com/endojs/endo/compare/@endo/pass-style@1.4.8...@endo/pass-style@1.5.0) (2025-03-24)

### Features

* **patterns:** M.containerHas(el,n) to support want patterns ([#2710](https://github.com/endojs/endo/issues/2710)) ([01529a5](https://github.com/endojs/endo/commit/01529a53fae5c4259901fdf85335013939aa09d2)), closes [#2002](https://github.com/endojs/endo/issues/2002) [#2008](https://github.com/endojs/endo/issues/2008) [#2113](https://github.com/endojs/endo/issues/2113) [#1739](https://github.com/endojs/endo/issues/1739) [#2008](https://github.com/endojs/endo/issues/2008) [#2008](https://github.com/endojs/endo/issues/2008) [#2002](https://github.com/endojs/endo/issues/2002) [#2008](https://github.com/endojs/endo/issues/2008)

## [1.4.8](https://github.com/endojs/endo/compare/@endo/pass-style@1.4.7...@endo/pass-style@1.4.8) (2025-01-24)

**Note:** Version bump only for package @endo/pass-style

## [1.4.7](https://github.com/endojs/endo/compare/@endo/pass-style@1.4.6...@endo/pass-style@1.4.7) (2024-11-13)

**Note:** Version bump only for package @endo/pass-style

## [1.4.6](https://github.com/endojs/endo/compare/@endo/pass-style@2.0.0...@endo/pass-style@1.4.6) (2024-10-22)

### Bug Fixes

* **pass-style:** Version 1.4.5 ([5ed625c](https://github.com/endojs/endo/commit/5ed625c8b74983339afe306c89070992f328a410))

## [1.4.5](https://github.com/endojs/endo/compare/@endo/pass-style@1.4.4...@endo/pass-style@1.4.5) (2024-10-22)

**Also erroneously published as 2.0.0**

### Bug Fixes

* **marshal:** Update compareRank to terminate comparability at the first remotable ([#2597](https://github.com/endojs/endo/issues/2597)) ([1dea84d](https://github.com/endojs/endo/commit/1dea84d316eb412d864042ffb08b4b6420092a7c)), closes [#2588](https://github.com/endojs/endo/issues/2588)

## [1.4.4](https://github.com/endojs/endo/compare/@endo/pass-style@1.4.3...@endo/pass-style@1.4.4) (2024-10-10)

**Note:** Version bump only for package @endo/pass-style

## [1.4.3](https://github.com/endojs/endo/compare/@endo/pass-style@1.4.2...@endo/pass-style@1.4.3) (2024-08-27)

### Bug Fixes

* **types:** void is Passable ([1ecb0e7](https://github.com/endojs/endo/commit/1ecb0e7732978f8907ec58a166d792f19b4c8054))

## [1.4.2](https://github.com/endojs/endo/compare/@endo/pass-style@1.4.1...@endo/pass-style@1.4.2) (2024-08-01)

**Note:** Version bump only for package @endo/pass-style

## [1.4.1](https://github.com/endojs/endo/compare/@endo/pass-style@1.4.0...@endo/pass-style@1.4.1) (2024-07-30)

- `deeplyFulfilled` moved from @endo/marshal to @endo/pass-style. @endo/marshal still reexports it, to avoid breaking old importers. But importers should be upgraded to import `deeplyFulfilled` directly from @endo/pass-style.

## [1.4.0](https://github.com/endojs/endo/compare/@endo/pass-style@1.3.1...@endo/pass-style@1.4.0) (2024-05-07)

- Adds `toThrowable` as a generalization of `toPassableError` that also admits copy data containing passable errors, but still without passable caps, i.e, without remotables or promises. This is in support of the exo boundary throwing only throwables, to ease security review.

## [1.3.1](https://github.com/endojs/endo/compare/@endo/pass-style@1.3.0...@endo/pass-style@1.3.1) (2024-04-04)

**Note:** Version bump only for package @endo/pass-style

## [1.3.0](https://github.com/endojs/endo/compare/@endo/pass-style@1.2.0...@endo/pass-style@1.3.0) (2024-03-20)

- Exports `isWellFormedString` and `assertWellFormedString`. Unfortunately the [standard `String.prototype.isWellFormed`](https://tc39.es/proposal-is-usv-string/) first coerces its input to string, leading it to claim that some non-strings are well-formed strings. By contrast, `isWellFormedString` and `assertWellFormedString` will not judge any non-strings to be well-formed strings.
  - Previously, all JavaScript strings were considered Passable with `passStyleOf(str) === 'string'`. Our tentative plan is that only well-formed Unicode strings will be considered Passable. For all others, `passStyleOf(str)` throws a diagnostic error. This would bring us into closer conformance to the OCapN standard, which prohibits sending non-well-formed strings, and requires non-well-formed strings to be rejected when received. Applications that had previously handled non-well-formed strings successfully (even if inadvertantly) may then start experiences these failure. We are also uncertain about the performance impact of this extra check, since it is linear in the size of strings.
  - Thus, in this release we introduce the environment option `ONLY_WELL_FORMED_STRINGS_PASSABLE` as a feature flag. To abstract over this switch, we also export `assertPassableString`. For now, if `ONLY_WELL_FORMED_STRINGS_PASSABLE` environment option is `'enabled'`, then `assertPassableString` is the same as `assertWellFormedString`. Otherwise `assertPassableString` just asserts that `str` is a string. In a bash shell, for example, you could set
      ```sh
      export ONLY_WELL_FORMED_STRINGS_PASSABLE=enabled
      ```
      to turn this feature on.
  - Currently, `ONLY_WELL_FORMED_STRINGS_PASSABLE` defaults to `'disabled'` because we do not yet know the performance impact. Later, if we decide we can afford it, we'll first change the default to `'enabled'` and ultimately remove the switch altogether. Be prepared for these changes.

## [1.2.0](https://github.com/endojs/endo/compare/@endo/pass-style@1.1.1...@endo/pass-style@1.2.0) (2024-02-23)

- Now supports `AggegateError`, `error.errors`, `error.cause`.
  - A `Passable` error can now include an `error.cause` property whose
    value is a `Passable` error.
  - An `AggregateError` can be a `Passable` error.
  - A `Passable` error can now include an `error.errors` property whose
    value is a `CopyArray` of `Passable` errors.
  - The previously internal `toPassableError` is more general and exported
    for general use. If its error agument is already `Passable`,
    `toPassableError` will return it. Otherwise, it will extract from it
    info for making a `Passable` error, and use `annotateError` to attach
    the original error to the returned `Passable` error as a note. This
    node will show up on the SES `console` as additional diagnostic info
    associated with the returned `Passable` error.

## [1.1.1](https://github.com/endojs/endo/compare/@endo/pass-style@1.1.0...@endo/pass-style@1.1.1) (2024-02-15)

### Bug Fixes

* Add repository directory to all package descriptors ([e5f36e7](https://github.com/endojs/endo/commit/e5f36e7a321c13ee25e74eb74d2a5f3d7517119c))

## [1.1.0](https://github.com/endojs/endo/compare/@endo/pass-style@1.0.1...@endo/pass-style@1.1.0) (2024-01-18)

### Features

* **eventual-send:** breakpoint on delivery by env-options ([#1860](https://github.com/endojs/endo/issues/1860)) ([b191aaf](https://github.com/endojs/endo/commit/b191aaf3d8b9015801d3f6793f0dd21995aba48e))
* **types:** generic Passable ([ae6ad15](https://github.com/endojs/endo/commit/ae6ad156e43fafb11df394f901df372760f9cbcc))

## [1.0.1](https://github.com/endojs/endo/compare/@endo/pass-style@1.0.0...@endo/pass-style@1.0.1) (2023-12-20)

**Note:** Version bump only for package @endo/pass-style

## [1.0.0](https://github.com/endojs/endo/compare/@endo/pass-style@0.1.7...@endo/pass-style@1.0.0) (2023-12-12)

### Features

* **pass-style:** Far GET_METHOD_NAMES meta method ([b079812](https://github.com/endojs/endo/commit/b07981215a64766b2813f92f6d6c430d181b5512))
* **pass-style:** Safe promises can override @[@to](https://github.com/to)StringTag with a string ([55e094c](https://github.com/endojs/endo/commit/55e094c689b3460dae29baf04f7934b60c594c60))
* **pass-style:** Use endowed passStyleOf if at global symbol ([53658ea](https://github.com/endojs/endo/commit/53658ea0b5c54e66883135ea872d0295b1487445))

### Bug Fixes

* Adjust type generation in release process and CI ([9465be3](https://github.com/endojs/endo/commit/9465be369e53167815ca444f6293a8e9eb48501d))
* **exo:** allow richer behaviorMethods ([fde26da](https://github.com/endojs/endo/commit/fde26da22f03a18045807d833c8e03c4409fd877))
* **pass-style:** Make __getMethodNames__ non-enumerable ([75c26fb](https://github.com/endojs/endo/commit/75c26fb971b381a1f6e303a9d8cb4b0883c37102))
* review suggestions ([25ded7a](https://github.com/endojs/endo/commit/25ded7a14b82103ca58be15b8ec0195bdc9dd434))

## [0.1.7](https://github.com/endojs/endo/compare/@endo/pass-style@0.1.6...@endo/pass-style@0.1.7) (2023-09-12)

### Bug Fixes

* **pass-style:** passable error validation ([df67cb0](https://github.com/endojs/endo/commit/df67cb064e49d40274d733c9e286c0adcb88d577))

## [0.1.6](https://github.com/endojs/endo/compare/@endo/pass-style@0.1.4...@endo/pass-style@0.1.6) (2023-08-07)

**Note:** Version bump only for package @endo/pass-style

## [0.1.5](https://github.com/endojs/endo/compare/@endo/pass-style@0.1.4...@endo/pass-style@0.1.5) (2023-08-07)

**Note:** Version bump only for package @endo/pass-style

## [0.1.4](https://github.com/endojs/endo/compare/@endo/pass-style@0.1.3...@endo/pass-style@0.1.4) (2023-07-19)

### Bug Fixes

* warning free lint ([a20ee00](https://github.com/endojs/endo/commit/a20ee00d2b378b710d758b2c7c7b65498276ae59))

## [0.1.3](https://github.com/endojs/endo/compare/@endo/pass-style@0.1.2...@endo/pass-style@0.1.3) (2023-04-20)

### Bug Fixes

- **pass-style:** correct types ([4bf9cec](https://github.com/endojs/endo/commit/4bf9cecfb79db11274fdf6a0708ad3f3205cc245))

## [0.1.2](https://github.com/endojs/endo/compare/@endo/pass-style@0.1.1...@endo/pass-style@0.1.2) (2023-04-14)

### Features

- **pass-style,exo:** label remotable instances ([56edc68](https://github.com/endojs/endo/commit/56edc68444ac3e0d94d43028bc7d53fe804bb332))
- **ses:** option to fake harden unsafely ([697bf58](https://github.com/endojs/endo/commit/697bf5855e4a6578db4cbca40bfeca253a6a2cfe))

### Bug Fixes

- sort type confusion between `pass-style` and `marshal` ([db09e13](https://github.com/endojs/endo/commit/db09e13463806b4524951cd694272243958a7182))

## 0.1.1 (2023-03-07)

### Features

- **pass-style:** Extract passStyleOf and friends from marshal into the new pass-style package ([#1439](https://github.com/endojs/endo/issues/1439)) ([ccd003c](https://github.com/endojs/endo/commit/ccd003c96f3d969d919104118d8a34b3c1126aef))

### Bug Fixes

- Fix hackerone.com links in SECURITY.md ([#1472](https://github.com/endojs/endo/issues/1472)) ([389733d](https://github.com/endojs/endo/commit/389733dbc7a74992f909c38d27ea7e8e68623959))
- move arb-passable to pass-style ([#1448](https://github.com/endojs/endo/issues/1448)) ([09235a9](https://github.com/endojs/endo/commit/09235a9a339229636fb37b4483ccddbe3b60d5ee))
