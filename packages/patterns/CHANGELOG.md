# @endo/patterns

## 1.8.0

### Minor Changes

- [#3082](https://github.com/endojs/endo/pull/3082) [`98f77e9`](https://github.com/endojs/endo/commit/98f77e9a77040cafe27f2facb5900f1c57043a20) Thanks [@boneskull](https://github.com/boneskull)! - `@endo/patterns` now exports a new `getNamedMethodGuards(interfaceGuard)` that returns that interface guard's record of method guards. The motivation is to support interface inheritance expressed by patterns like

  ```js
  const I2 = M.interface('I2', {
    ...getNamedMethodGuards(I1),
    doMore: M.call().returns(M.any()),
  });
  ```

  See `@endo/exo`'s `exo-wobbly-point.test.js` to see it in action together with an experiment in class inheritance.

- [#3008](https://github.com/endojs/endo/pull/3008) [`d83b1ab`](https://github.com/endojs/endo/commit/d83b1ab9fabc4f7b9b12fa9574749e46e03f26ea) Thanks [@kriskowal](https://github.com/kriskowal)! - - Relaxes dependence on a global, post-lockdown `harden` function by taking a
  dependency on the new `@endo/harden` package.
  Consequently, bundles will now entrain a `harden` implementation that is
  superfluous if the bundled program is guaranteed to run in a post-lockdown
  HardenedJS environment.
  To compensate, use `bundle-source` with `-C hardened` or the analogous feature
  for packaging conditions with your preferred bundler tool.
  This will hollow out `@endo/harden` and defer exclusively to the global
  `harden`.

### Patch Changes

- [#3082](https://github.com/endojs/endo/pull/3082) [`98f77e9`](https://github.com/endojs/endo/commit/98f77e9a77040cafe27f2facb5900f1c57043a20) Thanks [@boneskull](https://github.com/boneskull)! - The `sloppy` option for `@endo/patterns` interface guards is deprecated. Use `defaultGuards` instead.

- [#3065](https://github.com/endojs/endo/pull/3065) [`c488503`](https://github.com/endojs/endo/commit/c488503b4f84e499e05e361e21a78fa362f3fc66) Thanks [@gibson042](https://github.com/gibson042)! - - `containerHasSplit` now hardens its output(s) when working with copyArrays,
  ensuring that each output is itself a copyArray instance.
- Updated dependencies [[`2e00276`](https://github.com/endojs/endo/commit/2e00276ce0f08beb5e5259b8df195063fe008fe7), [`029dcc4`](https://github.com/endojs/endo/commit/029dcc464cd93bc7380da45e694585ab2f7aa139), [`2e00276`](https://github.com/endojs/endo/commit/2e00276ce0f08beb5e5259b8df195063fe008fe7), [`d83b1ab`](https://github.com/endojs/endo/commit/d83b1ab9fabc4f7b9b12fa9574749e46e03f26ea), [`98f77e9`](https://github.com/endojs/endo/commit/98f77e9a77040cafe27f2facb5900f1c57043a20)]:
  - @endo/errors@1.3.0
  - @endo/harden@1.1.0
  - @endo/common@1.3.0
  - @endo/eventual-send@1.4.0
  - @endo/marshal@1.9.0
  - @endo/pass-style@1.7.0
  - @endo/promise-kit@1.2.0

## [1.7.0](https://github.com/endojs/endo/compare/@endo/patterns@1.6.1...@endo/patterns@1.7.0) (2025-07-12)

- `@endo/marshal` introduces an environment variable config option `ENDO_RANK_STRINGS` to change the rank ordering of strings from the current (incorrect) ordering by UTF-16 code unit used by JavaScript's `<` and `.sort()` operations to (correct and OCapN-conformant) ordering by Unicode code point. It currently defaults to "utf16-code-unit-order", matching the previously-unconditional behavior.
  - `@endo/patterns` provides a `compareKeys` partial order that delegates some ordering, including strings, to the rank ordering provided by `@endo/marshal`. So when the `ENDO_RANK_STRINGS` default is not overridden, then `compareKeys` also follows the (incorrect) UTF-16 code unit order. But when it is overridden, then `compareKeys` also follows the (correct) Unicode code-point order.
- In errors explaining why a specimen does not match a pattern, sometimes the error message contains a quoted form of a nested pattern. This quoting was done with `q`, producing an uninformative rendering of these nested patterns. Now this quoting is done with `qp`, which renders these nested patterns into readable [Justin](https://github.com/endojs/Jessie/blob/main/packages/parse/src/quasi-justin.js) source code.

## [1.6.1](https://github.com/endojs/endo/compare/@endo/patterns@1.6.0...@endo/patterns@1.6.1) (2025-06-17)

### Bug Fixes

- **pass-style:** better byteArray support ([#2843](https://github.com/endojs/endo/issues/2843)) ([492551a](https://github.com/endojs/endo/commit/492551a936cf74fbeff0935b95fbd02ce02f796a)), closes [#2248](https://github.com/endojs/endo/issues/2248) [#2248](https://github.com/endojs/endo/issues/2248) [#2248](https://github.com/endojs/endo/issues/2248)

## [1.6.0](https://github.com/endojs/endo/compare/@endo/patterns@1.5.0...@endo/patterns@1.6.0) (2025-06-02)

### Features

- **marshal:** passable to quasi-quoted Justin expr ([#2799](https://github.com/endojs/endo/issues/2799)) ([f6c8b74](https://github.com/endojs/endo/commit/f6c8b74da04a7695f627e0592a779dc3c3dce1c9)), closes [#2793](https://github.com/endojs/endo/issues/2793)
- **pass-style,marshal:** ByteArray, a new binary Passable type ([#1538](https://github.com/endojs/endo/issues/1538)) ([1f568e2](https://github.com/endojs/endo/commit/1f568e2daf5c616ee51d7f231e9a004720f2a0f0)), closes [#1331](https://github.com/endojs/endo/issues/1331) [/github.com/ocapn/ocapn/issues/5#issuecomment-1492778252](https://github.com/endojs//github.com/ocapn/ocapn/issues/5/issues/issuecomment-1492778252) [#2414](https://github.com/endojs/endo/issues/2414)
- **patterns:** Expand special-casing of "optionality" patterns ([#2758](https://github.com/endojs/endo/issues/2758)) ([1c9cd7f](https://github.com/endojs/endo/commit/1c9cd7fd29a3bd38e4526f8d7e8e31691a4aa5fe))

### Bug Fixes

- **pass-style:** rename passable "Primitive" to ocapn "Atom" ([#2791](https://github.com/endojs/endo/issues/2791)) ([4c2d33c](https://github.com/endojs/endo/commit/4c2d33c799f24b261068ce4dff81205a27acec44))

## [1.5.0](https://github.com/endojs/endo/compare/@endo/patterns@1.4.8...@endo/patterns@1.5.0) (2025-03-24)

- New pattern: `M.containerHas(elementPatt, bound = 1n)` motivated to support want patterns in Zoe, to pull out only `bound` number of elements that match `elementPatt`. `bound` must be a positive bigint.
- Closely related, `@endo/patterns` now exports `containerHasSplit` to support ERTP's use of `M.containerHas` on non-fungible (`set`, `copySet`) and semifungible (`copyBag`) assets, respectively. See https://github.com/Agoric/agoric-sdk/pull/10952 .

## [1.4.8](https://github.com/endojs/endo/compare/@endo/patterns@1.4.7...@endo/patterns@1.4.8) (2025-01-24)

**Note:** Version bump only for package @endo/patterns

## [1.4.7](https://github.com/endojs/endo/compare/@endo/patterns@1.4.6...@endo/patterns@1.4.7) (2024-11-13)

**Note:** Version bump only for package @endo/patterns

## [1.4.6](https://github.com/endojs/endo/compare/@endo/patterns@2.0.0...@endo/patterns@1.4.6) (2024-10-22)

### Bug Fixes

- **patterns:** Version 1.4.5 ([5cdb873](https://github.com/endojs/endo/commit/5cdb873cab376192e311487f16a33068a1242161))

## [1.4.5](https://github.com/endojs/endo/compare/@endo/patterns@1.4.4...@endo/patterns@1.4.5) (2024-10-22)

**Also erroneously published as 2.0.0**

### Bug Fixes

- **marshal:** Update compareRank to terminate comparability at the first remotable ([#2597](https://github.com/endojs/endo/issues/2597)) ([1dea84d](https://github.com/endojs/endo/commit/1dea84d316eb412d864042ffb08b4b6420092a7c)), closes [#2588](https://github.com/endojs/endo/issues/2588)

## [1.4.4](https://github.com/endojs/endo/compare/@endo/patterns@1.4.3...@endo/patterns@1.4.4) (2024-10-10)

**Note:** Version bump only for package @endo/patterns

## [1.4.3](https://github.com/endojs/endo/compare/@endo/patterns@1.4.2...@endo/patterns@1.4.3) (2024-08-27)

**Note:** Version bump only for package @endo/patterns

## [1.4.2](https://github.com/endojs/endo/compare/@endo/patterns@1.4.1...@endo/patterns@1.4.2) (2024-08-01)

**Note:** Version bump only for package @endo/patterns

## [1.4.1](https://github.com/endojs/endo/compare/@endo/patterns@1.4.0...@endo/patterns@1.4.1) (2024-07-30)

**Note:** Version bump only for package @endo/patterns

## [1.4.0](https://github.com/endojs/endo/compare/@endo/patterns@1.3.1...@endo/patterns@1.4.0) (2024-05-07)

- `Passable` is now an accurate type instead of `any`. Downstream type checking may require changes ([example](https://github.com/Agoric/agoric-sdk/pull/8774))
- Some downstream types that take or return `Passable` were changed to `any` to defer downstream work to accomodate.

## [1.3.1](https://github.com/endojs/endo/compare/@endo/patterns@1.3.0...@endo/patterns@1.3.1) (2024-04-04)

### Bug Fixes

- wrap a raw <T> tag in `` so it won't confuse vitepress ([0bc9430](https://github.com/endojs/endo/commit/0bc9430a20cd7bf308ca26976bbd8ef0e3a54889))

## [1.3.0](https://github.com/endojs/endo/compare/@endo/patterns@1.2.0...@endo/patterns@1.3.0) (2024-03-20)

### Features

- **ses-ava:** import test from @endo/ses-ava/prepare-endo.js ([#2133](https://github.com/endojs/endo/issues/2133)) ([9d3a7ce](https://github.com/endojs/endo/commit/9d3a7ce150b6fd6fe7c8c4cc43da411e981731ac))

## [1.2.0](https://github.com/endojs/endo/compare/@endo/patterns@1.1.1...@endo/patterns@1.2.0) (2024-02-23)

- Add `M.tagged(tagPattern, payloadPattern)` for making patterns that match
  Passable Tagged objects.

## [1.1.1](https://github.com/endojs/endo/compare/@endo/patterns@1.1.0...@endo/patterns@1.1.1) (2024-02-15)

### Bug Fixes

- Add repository directory to all package descriptors ([e5f36e7](https://github.com/endojs/endo/commit/e5f36e7a321c13ee25e74eb74d2a5f3d7517119c))
- **patterns,exo:** Tolerate old guard format ([#2038](https://github.com/endojs/endo/issues/2038)) ([d5b31d9](https://github.com/endojs/endo/commit/d5b31d9ffcf7950c79070a7e792d466bd36ef5ff))

## [1.1.0](https://github.com/endojs/endo/compare/@endo/patterns@1.0.1...@endo/patterns@1.1.0) (2024-01-18)

### Features

- **types:** generic Passable ([ae6ad15](https://github.com/endojs/endo/commit/ae6ad156e43fafb11df394f901df372760f9cbcc))

### Bug Fixes

- **common:** fix @endo/common integration breakage ([#1963](https://github.com/endojs/endo/issues/1963)) ([73b5059](https://github.com/endojs/endo/commit/73b50590b7aef7eaffe2c435286fb291bf9b22bf))

## [1.0.1](https://github.com/endojs/endo/compare/@endo/patterns@1.0.0...@endo/patterns@1.0.1) (2023-12-20)

**Note:** Version bump only for package @endo/patterns

## [1.0.0](https://github.com/endojs/endo/compare/@endo/patterns@0.2.6...@endo/patterns@1.0.0) (2023-12-12)

### ⚠ BREAKING CHANGES

- **patterns:** tag and retype guards

### Features

- **defaultGuards:** absorb `sloppy` and `raw` ([58a3d42](https://github.com/endojs/endo/commit/58a3d42a92102336d814690430e0feb3773227d4))
- **defendSyncMethod:** implement raw exo methods ([c8126dc](https://github.com/endojs/endo/commit/c8126dc9d863fbb69cc53d57514368ba931df7fe))
- **exo:** opt out individual arguments ([bf593d8](https://github.com/endojs/endo/commit/bf593d8e83ba7eb231b4d3a909c41751ab24fe66))
- **patterns:** export kindOf ([#1834](https://github.com/endojs/endo/issues/1834)) ([f746e99](https://github.com/endojs/endo/commit/f746e996dfa827170b408ab276c1c438500c9ca1))

### Bug Fixes

- Adjust type generation in release process and CI ([9465be3](https://github.com/endojs/endo/commit/9465be369e53167815ca444f6293a8e9eb48501d))
- **exo:** allow richer behaviorMethods ([fde26da](https://github.com/endojs/endo/commit/fde26da22f03a18045807d833c8e03c4409fd877))
- **exo:** tighten typing ([c50ee18](https://github.com/endojs/endo/commit/c50ee18b543c8da921cd095cdc65b56df1761b9f))
- Import types explicitly throughout ([631d087](https://github.com/endojs/endo/commit/631d087e291262ce3e798f7a15482c534cb7233b))
- **patterns:** `M.rawValue()` -> `M.raw()` ([5b94530](https://github.com/endojs/endo/commit/5b9453042aec993f5876deeed4488f4d32dc4803))
- **patterns:** pass type parameter from interface guard to payload ([7d294eb](https://github.com/endojs/endo/commit/7d294eb7edb24da3034f96872e25e49d1553f73d))
- **patterns:** remove `defaultGuards: 'never'` for `undefined` ([77d04b2](https://github.com/endojs/endo/commit/77d04b2902ddf539f10688dfb84fe2aa9e841f16))
- **patterns:** tag and retype guards ([3e514c5](https://github.com/endojs/endo/commit/3e514c59b011d2a69778c2fb01c7262681d2bdee))
- review suggestions ([25ded7a](https://github.com/endojs/endo/commit/25ded7a14b82103ca58be15b8ec0195bdc9dd434))

## [0.2.6](https://github.com/endojs/endo/compare/@endo/patterns@0.2.5...@endo/patterns@0.2.6) (2023-09-12)

- Adds support for CopyMap patterns (e.g., `matches(specimen, makeCopyMap([]))`).

## [0.2.5](https://github.com/endojs/endo/compare/@endo/patterns@0.2.3...@endo/patterns@0.2.5) (2023-08-07)

### Bug Fixes

- **ses:** normalize bestEffortsStringify property order ([137daff](https://github.com/endojs/endo/commit/137dafff089b7ff5bea74a398caa238f4d313f5e))

## [0.2.4](https://github.com/endojs/endo/compare/@endo/patterns@0.2.3...@endo/patterns@0.2.4) (2023-08-07)

### Bug Fixes

- **ses:** normalize bestEffortsStringify property order ([137daff](https://github.com/endojs/endo/commit/137dafff089b7ff5bea74a398caa238f4d313f5e))

## [0.2.3](https://github.com/endojs/endo/compare/@endo/patterns@0.2.2...@endo/patterns@0.2.3) (2023-07-19)

### Features

- **ses:** Add assert.raw for embedding unquoted strings in details ([652df0c](https://github.com/endojs/endo/commit/652df0ca6a2fbca5db3026d26141da41cdde318e))
- **types:** parameterize InterfaceGuard ([645a7a8](https://github.com/endojs/endo/commit/645a7a80a45303e6412405b9c4feeb1406592c0c))

### Bug Fixes

- mismatch errors should not redact the pattern ([a95e7fb](https://github.com/endojs/endo/commit/a95e7fb2229fc2b129e32f62ff5faf3db651a326))
- **patterns:** Allow `matches(nonKey, key)` to reject successfully ([cebc442](https://github.com/endojs/endo/commit/cebc44209bdc97543685d1609b566495684460d9))
- **patterns:** Implement M.null() and M.undefined() as Key Patterns ([88f3ce9](https://github.com/endojs/endo/commit/88f3ce962886564bc0ae00ae39b4b7b1050062a4)), closes [#1601](https://github.com/endojs/endo/issues/1601)

## [0.2.2](https://github.com/endojs/endo/compare/@endo/patterns@0.2.1...@endo/patterns@0.2.2) (2023-04-20)

### Bug Fixes

- **patterns:** correct types ([b73622b](https://github.com/endojs/endo/commit/b73622bf16f0dabc7f1e0ceee013c8bec5543a2f))

## [0.2.1](https://github.com/endojs/endo/compare/@endo/patterns@0.2.0...@endo/patterns@0.2.1) (2023-04-14)

### Bug Fixes

- copy collection param type defaults ([98634b0](https://github.com/endojs/endo/commit/98634b033901714eecf5d0f85a74e143a2a42f56))
- sync with shadows in agoric-sdk ([19e2833](https://github.com/endojs/endo/commit/19e28339e359791fd2a9f78d2c3801598e3894ca))

## 0.2.0 (2023-03-07)

### ⚠ BREAKING CHANGES

- rename 'fit' to 'mustMatch' (#1464)

### Features

- **exo:** start migrating exo from @agoric/store ([#1459](https://github.com/endojs/endo/issues/1459)) ([a882b7c](https://github.com/endojs/endo/commit/a882b7ca88863d7f85310074c38f3cc0032e1e0e))
- **patterns:** Start migrating patterns from @agoric/store to new @endo/patterns ([#1451](https://github.com/endojs/endo/issues/1451)) ([69b61e3](https://github.com/endojs/endo/commit/69b61e3f9a0af9a9714413708ddb9bcf68772846))

### Bug Fixes

- Fix hackerone.com links in SECURITY.md ([#1472](https://github.com/endojs/endo/issues/1472)) ([389733d](https://github.com/endojs/endo/commit/389733dbc7a74992f909c38d27ea7e8e68623959))

### Miscellaneous Chores

- rename 'fit' to 'mustMatch' ([#1464](https://github.com/endojs/endo/issues/1464)) ([a4f88f8](https://github.com/endojs/endo/commit/a4f88f8ef1e7d62b993900244e260d90113f9759))
