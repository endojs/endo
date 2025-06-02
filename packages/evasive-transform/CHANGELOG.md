# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [2.0.0](https://github.com/endojs/endo/compare/@endo/evasive-transform@1.4.0...@endo/evasive-transform@2.0.0) (2025-06-02)


### ⚠ BREAKING CHANGES

* **evasive-transform:** This restricts the possible values of the `sourceType` option to `script` and `module` only. Types have been changed to reflect this.

*BREAKING*: Do not provide a `sourceType` of `unambiguous`; use `module`, `script`, or omit.

### Features

* **evasive-transform:** allow returns outside functions in CommonJS sources ([1d47e08](https://github.com/endojs/endo/commit/1d47e0881cd88fe678a94dc1cd7a5ea8748fcc7c))



## [1.4.0](https://github.com/endojs/endo/compare/@endo/evasive-transform@1.3.4...@endo/evasive-transform@1.4.0) (2025-03-24)


### Features

* **evasive-transform:** Preserve format with Babel ([ee78005](https://github.com/endojs/endo/commit/ee780058d3b08a21e0eaa76f0d8fb99238295a17))



### [1.3.4](https://github.com/endojs/endo/compare/@endo/evasive-transform@1.3.3...@endo/evasive-transform@1.3.4) (2025-01-24)

**Note:** Version bump only for package @endo/evasive-transform





### [1.3.3](https://github.com/endojs/endo/compare/@endo/evasive-transform@1.3.2...@endo/evasive-transform@1.3.3) (2024-11-13)

**Note:** Version bump only for package @endo/evasive-transform





### [1.3.2](https://github.com/endojs/endo/compare/@endo/evasive-transform@1.3.1...@endo/evasive-transform@1.3.2) (2024-10-22)

**Note:** Version bump only for package @endo/evasive-transform





### [1.3.1](https://github.com/endojs/endo/compare/@endo/evasive-transform@1.3.0...@endo/evasive-transform@1.3.1) (2024-10-10)

**Note:** Version bump only for package @endo/evasive-transform





## [1.3.0](https://github.com/endojs/endo/compare/@endo/evasive-transform@1.2.1...@endo/evasive-transform@1.3.0) (2024-08-27)


### Features

* **evasive-transform:** elideComments option ([69ba3d7](https://github.com/endojs/endo/commit/69ba3d768ac9cae9acc99a2322e4691d14a658c2))



### [1.2.1](https://github.com/endojs/endo/compare/@endo/evasive-transform@1.2.0...@endo/evasive-transform@1.2.1) (2024-08-01)

**Note:** Version bump only for package @endo/evasive-transform





## [1.2.0](https://github.com/endojs/endo/compare/@endo/evasive-transform@1.1.2...@endo/evasive-transform@1.2.0) (2024-07-30)


### Features

* **evasive-transform:** expose evadeCensorSync ([2f141cd](https://github.com/endojs/endo/commit/2f141cdb3469f06739f53354b5872cd727ae9ebf))



### [1.1.2](https://github.com/endojs/endo/compare/@endo/evasive-transform@1.1.1...@endo/evasive-transform@1.1.2) (2024-05-07)

**Note:** Version bump only for package @endo/evasive-transform





### [1.1.1](https://github.com/endojs/endo/compare/@endo/evasive-transform@1.1.0...@endo/evasive-transform@1.1.1) (2024-04-04)

**Note:** Version bump only for package @endo/evasive-transform





## [1.1.0](https://github.com/endojs/endo/compare/@endo/evasive-transform@1.0.4...@endo/evasive-transform@1.1.0) (2024-03-20)


### Features

* **ses-ava:** import test from @endo/ses-ava/prepare-endo.js ([#2133](https://github.com/endojs/endo/issues/2133)) ([9d3a7ce](https://github.com/endojs/endo/commit/9d3a7ce150b6fd6fe7c8c4cc43da411e981731ac))



### [1.0.4](https://github.com/endojs/endo/compare/@endo/evasive-transform@1.0.3...@endo/evasive-transform@1.0.4) (2024-02-23)

**Note:** Version bump only for package @endo/evasive-transform





### [1.0.3](https://github.com/endojs/endo/compare/@endo/evasive-transform@1.0.2...@endo/evasive-transform@1.0.3) (2024-02-15)


### Bug Fixes

* Add repository directory to all package descriptors ([e5f36e7](https://github.com/endojs/endo/commit/e5f36e7a321c13ee25e74eb74d2a5f3d7517119c))



### [1.0.2](https://github.com/endojs/endo/compare/@endo/evasive-transform@1.0.1...@endo/evasive-transform@1.0.2) (2024-01-18)

**Note:** Version bump only for package @endo/evasive-transform





### [1.0.1](https://github.com/endojs/endo/compare/@endo/evasive-transform@1.0.0...@endo/evasive-transform@1.0.1) (2023-12-20)


### Bug Fixes

* **evasive-transform:** Do not use ?? nor ?. operators ([9c2445e](https://github.com/endojs/endo/commit/9c2445eba86b0f6d2dee00d1f66e94df420924cb))
* **evasive-transform:** RESM treatment ([db660ce](https://github.com/endojs/endo/commit/db660ceaf1b0dbc8af32af001373386d7806d6de))



## 1.0.0 (2023-12-12)


### Features

* **evasive-transform:** isolate source transform system into its own package ([55e0b88](https://github.com/endojs/endo/commit/55e0b88d322af978a9ef7af0fe4585ad1469ab1d))


### Bug Fixes

* Adjust type generation in release process and CI ([9465be3](https://github.com/endojs/endo/commit/9465be369e53167815ca444f6293a8e9eb48501d))
* **evasive-transform:** replace homoglyphs with boring ascii ([dc00caa](https://github.com/endojs/endo/commit/dc00caa88de5b162cb8bf6aa26071f17c6457de7))
* Import types explicitly throughout ([631d087](https://github.com/endojs/endo/commit/631d087e291262ce3e798f7a15482c534cb7233b))



### [0.1.3](https://github.com/endojs/endo/compare/@endo/transforms@0.1.2...@endo/transforms@0.1.3) (2023-09-12)

**Note:** Version bump only for package @endo/transforms





### 0.1.2 (2023-08-07)


### Bug Fixes

* Fix scaffold and transforms yarn pack ([42439e7](https://github.com/endojs/endo/commit/42439e7d452e839b9856eac0e852766c237219d0))



### 0.1.1 (2023-08-07)


### Bug Fixes

* Fix scaffold and transforms yarn pack ([42439e7](https://github.com/endojs/endo/commit/42439e7d452e839b9856eac0e852766c237219d0))
