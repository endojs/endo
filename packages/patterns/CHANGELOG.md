# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [1.4.0](https://github.com/endojs/endo/compare/@endo/patterns@1.3.1...@endo/patterns@1.4.0) (2024-05-07)


### Features

* **types:** generic Passable ([fa59e05](https://github.com/endojs/endo/commit/fa59e05fc5621410a184c1eb4f4ee850bddce09c))
* **types:** ScalarKey ([a02734a](https://github.com/endojs/endo/commit/a02734a45cae94e24d991adaf061059b72623cb6))



### [1.3.1](https://github.com/endojs/endo/compare/@endo/patterns@1.3.0...@endo/patterns@1.3.1) (2024-04-04)


### Bug Fixes

* wrap a raw <T> tag in `` so it won't confuse vitepress ([0bc9430](https://github.com/endojs/endo/commit/0bc9430a20cd7bf308ca26976bbd8ef0e3a54889))



## [1.3.0](https://github.com/endojs/endo/compare/@endo/patterns@1.2.0...@endo/patterns@1.3.0) (2024-03-20)


### Features

* **ses-ava:** import test from @endo/ses-ava/prepare-endo.js ([#2133](https://github.com/endojs/endo/issues/2133)) ([9d3a7ce](https://github.com/endojs/endo/commit/9d3a7ce150b6fd6fe7c8c4cc43da411e981731ac))



## [1.2.0](https://github.com/endojs/endo/compare/@endo/patterns@1.1.1...@endo/patterns@1.2.0) (2024-02-23)


### Features

* **patterns:** New `M.tagged` pattern maker ([#2091](https://github.com/endojs/endo/issues/2091)) ([4394e6e](https://github.com/endojs/endo/commit/4394e6e3d1a953c22934d5f327ce173f32b4f3a1))


### Bug Fixes

* **ses,pass-style,marshal:** tolerate platforms prior to AggregateError ([5762dd4](https://github.com/endojs/endo/commit/5762dd48e814e2e8435f666019e527d982eddbbd))



### [1.1.1](https://github.com/endojs/endo/compare/@endo/patterns@1.1.0...@endo/patterns@1.1.1) (2024-02-15)


### Bug Fixes

* Add repository directory to all package descriptors ([e5f36e7](https://github.com/endojs/endo/commit/e5f36e7a321c13ee25e74eb74d2a5f3d7517119c))
* **patterns,exo:** Tolerate old guard format ([#2038](https://github.com/endojs/endo/issues/2038)) ([d5b31d9](https://github.com/endojs/endo/commit/d5b31d9ffcf7950c79070a7e792d466bd36ef5ff))



## [1.1.0](https://github.com/endojs/endo/compare/@endo/patterns@1.0.1...@endo/patterns@1.1.0) (2024-01-18)


### Features

* **types:** generic Passable ([ae6ad15](https://github.com/endojs/endo/commit/ae6ad156e43fafb11df394f901df372760f9cbcc))


### Bug Fixes

* **common:** fix @endo/common integration breakage ([#1963](https://github.com/endojs/endo/issues/1963)) ([73b5059](https://github.com/endojs/endo/commit/73b50590b7aef7eaffe2c435286fb291bf9b22bf))



### [1.0.1](https://github.com/endojs/endo/compare/@endo/patterns@1.0.0...@endo/patterns@1.0.1) (2023-12-20)

**Note:** Version bump only for package @endo/patterns





## [1.0.0](https://github.com/endojs/endo/compare/@endo/patterns@0.2.6...@endo/patterns@1.0.0) (2023-12-12)


### ⚠ BREAKING CHANGES

* **patterns:** tag and retype guards

### Features

* **defaultGuards:** absorb `sloppy` and `raw` ([58a3d42](https://github.com/endojs/endo/commit/58a3d42a92102336d814690430e0feb3773227d4))
* **defendSyncMethod:** implement raw exo methods ([c8126dc](https://github.com/endojs/endo/commit/c8126dc9d863fbb69cc53d57514368ba931df7fe))
* **exo:** opt out individual arguments ([bf593d8](https://github.com/endojs/endo/commit/bf593d8e83ba7eb231b4d3a909c41751ab24fe66))
* **patterns:** export kindOf ([#1834](https://github.com/endojs/endo/issues/1834)) ([f746e99](https://github.com/endojs/endo/commit/f746e996dfa827170b408ab276c1c438500c9ca1))


### Bug Fixes

* Adjust type generation in release process and CI ([9465be3](https://github.com/endojs/endo/commit/9465be369e53167815ca444f6293a8e9eb48501d))
* **exo:** allow richer behaviorMethods ([fde26da](https://github.com/endojs/endo/commit/fde26da22f03a18045807d833c8e03c4409fd877))
* **exo:** tighten typing ([c50ee18](https://github.com/endojs/endo/commit/c50ee18b543c8da921cd095cdc65b56df1761b9f))
* Import types explicitly throughout ([631d087](https://github.com/endojs/endo/commit/631d087e291262ce3e798f7a15482c534cb7233b))
* **patterns:** `M.rawValue()` -> `M.raw()` ([5b94530](https://github.com/endojs/endo/commit/5b9453042aec993f5876deeed4488f4d32dc4803))
* **patterns:** pass type parameter from interface guard to payload ([7d294eb](https://github.com/endojs/endo/commit/7d294eb7edb24da3034f96872e25e49d1553f73d))
* **patterns:** remove `defaultGuards: 'never'` for `undefined` ([77d04b2](https://github.com/endojs/endo/commit/77d04b2902ddf539f10688dfb84fe2aa9e841f16))
* **patterns:** tag and retype guards ([3e514c5](https://github.com/endojs/endo/commit/3e514c59b011d2a69778c2fb01c7262681d2bdee))
* review suggestions ([25ded7a](https://github.com/endojs/endo/commit/25ded7a14b82103ca58be15b8ec0195bdc9dd434))



### [0.2.6](https://github.com/endojs/endo/compare/@endo/patterns@0.2.5...@endo/patterns@0.2.6) (2023-09-12)


### Features

* **patterns:** Implement CopyMap comparison ([13028b2](https://github.com/endojs/endo/commit/13028b2b7e18b82cb313f58b66dfb7f35e2efde2))
* **patterns:** Support CopyMap Patterns ([aacac44](https://github.com/endojs/endo/commit/aacac4483c827c06a9962a17841bb93aa3f85019)), closes [#1727](https://github.com/endojs/endo/issues/1727)


### Bug Fixes

* **exo:** Extend InterfaceGuard to support symbol-keyed methods ([d6ea36b](https://github.com/endojs/endo/commit/d6ea36b120f6118a59f32c7c63c339d354bbd4e7)), closes [#1728](https://github.com/endojs/endo/issues/1728)
* **patterns,exo:** abstract guard getters ([dcf1071](https://github.com/endojs/endo/commit/dcf1071d7c8cc531c21cf1778fc54fdbdc6d6d18))
* **patterns:** type guards ([c2cd034](https://github.com/endojs/endo/commit/c2cd0343bf42b212d4a144f570f493286ec280ba))



### [0.2.5](https://github.com/endojs/endo/compare/@endo/patterns@0.2.3...@endo/patterns@0.2.5) (2023-08-07)


### Bug Fixes

* **ses:** normalize bestEffortsStringify property order ([137daff](https://github.com/endojs/endo/commit/137dafff089b7ff5bea74a398caa238f4d313f5e))



### [0.2.4](https://github.com/endojs/endo/compare/@endo/patterns@0.2.3...@endo/patterns@0.2.4) (2023-08-07)


### Bug Fixes

* **ses:** normalize bestEffortsStringify property order ([137daff](https://github.com/endojs/endo/commit/137dafff089b7ff5bea74a398caa238f4d313f5e))



### [0.2.3](https://github.com/endojs/endo/compare/@endo/patterns@0.2.2...@endo/patterns@0.2.3) (2023-07-19)


### Features

* **ses:** Add assert.raw for embedding unquoted strings in details ([652df0c](https://github.com/endojs/endo/commit/652df0ca6a2fbca5db3026d26141da41cdde318e))
* **types:** parameterize InterfaceGuard ([645a7a8](https://github.com/endojs/endo/commit/645a7a80a45303e6412405b9c4feeb1406592c0c))


### Bug Fixes

* mismatch errors should not redact the pattern ([a95e7fb](https://github.com/endojs/endo/commit/a95e7fb2229fc2b129e32f62ff5faf3db651a326))
* **patterns:** Allow `matches(nonKey, key)` to reject successfully ([cebc442](https://github.com/endojs/endo/commit/cebc44209bdc97543685d1609b566495684460d9))
* **patterns:** Implement M.null() and M.undefined() as Key Patterns ([88f3ce9](https://github.com/endojs/endo/commit/88f3ce962886564bc0ae00ae39b4b7b1050062a4)), closes [#1601](https://github.com/endojs/endo/issues/1601)



### [0.2.2](https://github.com/endojs/endo/compare/@endo/patterns@0.2.1...@endo/patterns@0.2.2) (2023-04-20)

### Bug Fixes

- **patterns:** correct types ([b73622b](https://github.com/endojs/endo/commit/b73622bf16f0dabc7f1e0ceee013c8bec5543a2f))

### [0.2.1](https://github.com/endojs/endo/compare/@endo/patterns@0.2.0...@endo/patterns@0.2.1) (2023-04-14)

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
