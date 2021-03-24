# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [0.4.1](https://github.com/Agoric/agoric-sdk/compare/@agoric/marshal@0.4.0...@agoric/marshal@0.4.1) (2021-03-24)


### Bug Fixes

* **marshal:** remove Data ([81dd9a4](https://github.com/Agoric/agoric-sdk/commit/81dd9a492bd70f63e71647a29356eb890063641d)), closes [#2018](https://github.com/Agoric/agoric-sdk/issues/2018)





# [0.4.0](https://github.com/Agoric/agoric-sdk/compare/@agoric/marshal@0.3.2...@agoric/marshal@0.4.0) (2021-03-16)


### Bug Fixes

* fix ibids. test ibids and slots ([#2625](https://github.com/Agoric/agoric-sdk/issues/2625)) ([891d9fd](https://github.com/Agoric/agoric-sdk/commit/891d9fd236ca86b63947384064b675c52e960abd))
* make separate 'test:xs' target, remove XS from 'test' target ([b9c1a69](https://github.com/Agoric/agoric-sdk/commit/b9c1a6987093fc8e09e8aba7acd2a1618413bac8)), closes [#2647](https://github.com/Agoric/agoric-sdk/issues/2647)
* **marshal:** add Data marker, tolerate its presence ([d7b190f](https://github.com/Agoric/agoric-sdk/commit/d7b190f340ba336bd0d76a2ca8ed4829f227be61))
* **marshal:** add placeholder warnings ([8499b8e](https://github.com/Agoric/agoric-sdk/commit/8499b8e4584f3ae155913f95614980a483c487e2))
* **marshal:** serialize empty objects as data, not pass-by-reference ([aeee1ad](https://github.com/Agoric/agoric-sdk/commit/aeee1adf561d44ed3bc738989be605b683b3b656)), closes [#2018](https://github.com/Agoric/agoric-sdk/issues/2018)
* separate ibid tables ([#2596](https://github.com/Agoric/agoric-sdk/issues/2596)) ([e0704eb](https://github.com/Agoric/agoric-sdk/commit/e0704eb640a54ceec11b39fc924488108cb10cee))


### Features

* **marshal:** add Data() to all unserialized empty records ([946fd6f](https://github.com/Agoric/agoric-sdk/commit/946fd6f1b811c55ee39668100755db24f1b52329))
* **marshal:** allow marshalSaveError function to be specified ([c93bb04](https://github.com/Agoric/agoric-sdk/commit/c93bb046aecf476dc9ccc537671a14f446b89ed4))
* **marshal:** Data({}) is pass-by-copy ([03d7b5e](https://github.com/Agoric/agoric-sdk/commit/03d7b5eed8ecd3f24725d6ea63919f4398d8a2f8))





## [0.3.2](https://github.com/Agoric/agoric-sdk/compare/@agoric/marshal@0.3.1...@agoric/marshal@0.3.2) (2021-02-22)

**Note:** Version bump only for package @agoric/marshal





## [0.3.1](https://github.com/Agoric/agoric-sdk/compare/@agoric/marshal@0.3.0...@agoric/marshal@0.3.1) (2021-02-16)


### Bug Fixes

* **marshal:** reject getters in pass-by-ref, even if it returns a function ([#2438](https://github.com/Agoric/agoric-sdk/issues/2438)) ([b9368b6](https://github.com/Agoric/agoric-sdk/commit/b9368b6ee16a5562a622551539eff2b8708f0fdd)), closes [#2436](https://github.com/Agoric/agoric-sdk/issues/2436)
* Correlate sent errors with received errors ([73b9cfd](https://github.com/Agoric/agoric-sdk/commit/73b9cfd33cf7842bdc105a79592028649cb1c92a))
* Far and Remotable do unverified local marking rather than WeakMap ([#2361](https://github.com/Agoric/agoric-sdk/issues/2361)) ([ab59ab7](https://github.com/Agoric/agoric-sdk/commit/ab59ab779341b9740827b7c4cca4680e7b7212b2))
* review comments ([7db7e5c](https://github.com/Agoric/agoric-sdk/commit/7db7e5c4c569dfedff8d748dd58893218b0a2458))
* use assert rather than FooError constructors ([f860c5b](https://github.com/Agoric/agoric-sdk/commit/f860c5bf5add165a08cb5bd543502857c3f57998))





# [0.3.0](https://github.com/Agoric/agoric-sdk/compare/@agoric/marshal@0.2.7...@agoric/marshal@0.3.0) (2020-12-10)


### Bug Fixes

* minor tweaks for dapp-oracle ([b8169c1](https://github.com/Agoric/agoric-sdk/commit/b8169c1f39bc0c0d7c07099df2ac23ee7df05733))


### Features

* **import-bundle:** Preliminary support Endo zip hex bundle format ([#1983](https://github.com/Agoric/agoric-sdk/issues/1983)) ([983681b](https://github.com/Agoric/agoric-sdk/commit/983681bfc4bf512b6bd90806ed9220cd4fefc13c))





## [0.2.7](https://github.com/Agoric/agoric-sdk/compare/@agoric/marshal@0.2.7-dev.0...@agoric/marshal@0.2.7) (2020-11-07)

**Note:** Version bump only for package @agoric/marshal





## [0.2.7-dev.0](https://github.com/Agoric/agoric-sdk/compare/@agoric/marshal@0.2.6...@agoric/marshal@0.2.7-dev.0) (2020-10-19)

**Note:** Version bump only for package @agoric/marshal





## [0.2.6](https://github.com/Agoric/agoric-sdk/compare/@agoric/marshal@0.2.6-dev.2...@agoric/marshal@0.2.6) (2020-10-11)

**Note:** Version bump only for package @agoric/marshal





## [0.2.6-dev.2](https://github.com/Agoric/agoric-sdk/compare/@agoric/marshal@0.2.6-dev.1...@agoric/marshal@0.2.6-dev.2) (2020-09-18)

**Note:** Version bump only for package @agoric/marshal





## [0.2.6-dev.1](https://github.com/Agoric/agoric-sdk/compare/@agoric/marshal@0.2.6-dev.0...@agoric/marshal@0.2.6-dev.1) (2020-09-18)

**Note:** Version bump only for package @agoric/marshal





## [0.2.6-dev.0](https://github.com/Agoric/agoric-sdk/compare/@agoric/marshal@0.2.5...@agoric/marshal@0.2.6-dev.0) (2020-09-18)

**Note:** Version bump only for package @agoric/marshal





## [0.2.5](https://github.com/Agoric/agoric-sdk/compare/@agoric/marshal@0.2.4...@agoric/marshal@0.2.5) (2020-09-16)

**Note:** Version bump only for package @agoric/marshal





## [0.2.4](https://github.com/Agoric/agoric-sdk/compare/@agoric/marshal@0.2.3...@agoric/marshal@0.2.4) (2020-08-31)


### Bug Fixes

* add "TODO unimplemented"s ([#1580](https://github.com/Agoric/agoric-sdk/issues/1580)) ([7795f93](https://github.com/Agoric/agoric-sdk/commit/7795f9302843a2c94d4a2f42cb22affe1e91d41d))
* clean up E.when and E.resolve ([#1561](https://github.com/Agoric/agoric-sdk/issues/1561)) ([634046c](https://github.com/Agoric/agoric-sdk/commit/634046c0fc541fc1db258105a75c7313b5668aa0))
* excise @agoric/harden from the codebase ([eee6fe1](https://github.com/Agoric/agoric-sdk/commit/eee6fe1153730dec52841c9eb4c056a8c5438b0f))
* minor: rearrange asserts in Remotable ([#1642](https://github.com/Agoric/agoric-sdk/issues/1642)) ([c43a08f](https://github.com/Agoric/agoric-sdk/commit/c43a08fb1733596172a7dc5ca89353d837033e23))
* reduce inconsistency among our linting rules ([#1492](https://github.com/Agoric/agoric-sdk/issues/1492)) ([b6b675e](https://github.com/Agoric/agoric-sdk/commit/b6b675e2de110e2af19cad784a66220cab21dacf))
* rename producePromise to makePromiseKit ([#1329](https://github.com/Agoric/agoric-sdk/issues/1329)) ([1d2925a](https://github.com/Agoric/agoric-sdk/commit/1d2925ad640cce7b419751027b44737bd46a6d59))
* send and receive Remotable tags ([#1628](https://github.com/Agoric/agoric-sdk/issues/1628)) ([1bae122](https://github.com/Agoric/agoric-sdk/commit/1bae1220c2c35f48f279cb3aeab6012bce8ddb5a))
* stricter marshal requirements ([#1499](https://github.com/Agoric/agoric-sdk/issues/1499)) ([9d8ba97](https://github.com/Agoric/agoric-sdk/commit/9d8ba9763defb290de71668d08faa8619200d117))
* use REMOTE_STYLE rather than 'presence' to prepare ([#1577](https://github.com/Agoric/agoric-sdk/issues/1577)) ([6b97ae8](https://github.com/Agoric/agoric-sdk/commit/6b97ae8670303631313a65d12393d7ad226b941d))
* **marshal:** make toString and Symbol.toStringTag non-enumerable ([fc616ef](https://github.com/Agoric/agoric-sdk/commit/fc616eff1c3f61cd96e24644eeb76d8f8469a05c))





## [0.2.3](https://github.com/Agoric/agoric-sdk/compare/@agoric/marshal@0.2.2...@agoric/marshal@0.2.3) (2020-06-30)

**Note:** Version bump only for package @agoric/marshal





## [0.2.2](https://github.com/Agoric/agoric-sdk/compare/@agoric/marshal@0.2.1...@agoric/marshal@0.2.2) (2020-05-17)

**Note:** Version bump only for package @agoric/marshal





## [0.2.1](https://github.com/Agoric/agoric-sdk/compare/@agoric/marshal@0.2.0...@agoric/marshal@0.2.1) (2020-05-10)

**Note:** Version bump only for package @agoric/marshal





# [0.2.0](https://github.com/Agoric/agoric-sdk/compare/@agoric/marshal@0.1.5...@agoric/marshal@0.2.0) (2020-05-04)


### Bug Fixes

* address PR comments ([358952a](https://github.com/Agoric/agoric-sdk/commit/358952ab0f85ec9969a206a716fa91aa8b56c1e2))
* propagate Go errors all the way to the caller ([ea5ba38](https://github.com/Agoric/agoric-sdk/commit/ea5ba381e4e510bb9c9053bfb681e778f782a801))
* use getErrorConstructor to deep-copy an Error ([8ae1994](https://github.com/Agoric/agoric-sdk/commit/8ae1994f8ad9ee6dda34643b6323ed8422751115))


### Features

* add Presence, getInterfaceOf, deepCopyData to marshal ([aac1899](https://github.com/Agoric/agoric-sdk/commit/aac1899b6cefc4241af04911a92ffc50fbac3429))





## [0.1.5](https://github.com/Agoric/agoric-sdk/compare/@agoric/marshal@0.1.5-alpha.0...@agoric/marshal@0.1.5) (2020-04-13)

**Note:** Version bump only for package @agoric/marshal





## [0.1.5-alpha.0](https://github.com/Agoric/agoric-sdk/compare/@agoric/marshal@0.1.4...@agoric/marshal@0.1.5-alpha.0) (2020-04-12)

**Note:** Version bump only for package @agoric/marshal





## [0.1.4](https://github.com/Agoric/agoric-sdk/compare/@agoric/marshal@0.1.4-alpha.0...@agoric/marshal@0.1.4) (2020-04-02)

**Note:** Version bump only for package @agoric/marshal





## [0.1.4-alpha.0](https://github.com/Agoric/agoric-sdk/compare/@agoric/marshal@0.1.3...@agoric/marshal@0.1.4-alpha.0) (2020-04-02)

**Note:** Version bump only for package @agoric/marshal





## 0.1.3 (2020-03-26)


### Bug Fixes

* first draft use collection equality ([6acbde7](https://github.com/Agoric/marshal/commit/6acbde71ec82101ec8da9eaafc729bab1fdd6df9))
* symbols no longer passable ([7290a90](https://github.com/Agoric/marshal/commit/7290a90444f70d2a9a2f5c1e2782d18bea00039d))
* **eventual-send:** Update the API throughout agoric-sdk ([97fc1e7](https://github.com/Agoric/marshal/commit/97fc1e748d8e3955b29baf0e04bfa788d56dad9f))
* **SwingSet:** passing all tests ([341718b](https://github.com/Agoric/marshal/commit/341718be335e16b58aa5e648b51a731ea065c1d6))
