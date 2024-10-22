# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

### [1.6.1](https://github.com/endojs/endo/compare/@endo/marshal@2.0.0...@endo/marshal@1.6.1) (2024-10-22)


### Bug Fixes

* **marshal:** Manually intervene in choice of semver for 1.6.0 instead of 2.0.0 ([c242c28](https://github.com/endojs/endo/commit/c242c28a68d1af29475150e44b5f3e9d0feda8cd))



## [1.6.0](https://github.com/endojs/endo/compare/@endo/marshal@1.5.4...@endo/marshal@1.6.0) (2024-10-22)


* **marshal:** Update compareRank to terminate comparability at the first remotable ([#2597](https://github.com/endojs/endo/issues/2597)) ([1dea84d](https://github.com/endojs/endo/commit/1dea84d316eb412d864042ffb08b4b6420092a7c)), closes [#2588](https://github.com/endojs/endo/issues/2588)



### [1.5.4](https://github.com/endojs/endo/compare/@endo/marshal@1.5.3...@endo/marshal@1.5.4) (2024-10-10)

**Note:** Version bump only for package @endo/marshal





### [1.5.3](https://github.com/endojs/endo/compare/@endo/marshal@1.5.2...@endo/marshal@1.5.3) (2024-08-27)

**Note:** Version bump only for package @endo/marshal





### [1.5.2](https://github.com/endojs/endo/compare/@endo/marshal@1.5.1...@endo/marshal@1.5.2) (2024-08-01)

**Note:** Version bump only for package @endo/marshal





### [1.5.1](https://github.com/endojs/endo/compare/@endo/marshal@1.5.0...@endo/marshal@1.5.1) (2024-07-30)

**Note:** Version bump only for package @endo/marshal





## [1.5.0](https://github.com/endojs/endo/compare/@endo/marshal@1.4.1...@endo/marshal@1.5.0) (2024-05-07)


### Features

* **types:** fromCapData is Passable, but unknown is more practical ([5fa54f0](https://github.com/endojs/endo/commit/5fa54f0287b467d3d6baf354a36263a4aa36ec55))
* **types:** generic Passable ([fa59e05](https://github.com/endojs/endo/commit/fa59e05fc5621410a184c1eb4f4ee850bddce09c))


### Bug Fixes

* **ses:** makeError defaults to making passable errors ([#2200](https://github.com/endojs/endo/issues/2200)) ([3b0f766](https://github.com/endojs/endo/commit/3b0f76675b32bae4a428aada739b62a5dae02192))



### [1.4.1](https://github.com/endojs/endo/compare/@endo/marshal@1.4.0...@endo/marshal@1.4.1) (2024-04-04)

**Note:** Version bump only for package @endo/marshal





## [1.4.0](https://github.com/endojs/endo/compare/@endo/marshal@1.3.0...@endo/marshal@1.4.0) (2024-03-20)


### Features

* **ses-ava:** import test from @endo/ses-ava/prepare-endo.js ([#2133](https://github.com/endojs/endo/issues/2133)) ([9d3a7ce](https://github.com/endojs/endo/commit/9d3a7ce150b6fd6fe7c8c4cc43da411e981731ac))



## [1.3.0](https://github.com/endojs/endo/compare/@endo/marshal@1.2.0...@endo/marshal@1.3.0) (2024-02-23)


### Features

* **ses:** permit Promise.any, AggregateError ([6a8c4d8](https://github.com/endojs/endo/commit/6a8c4d8795c991cdaf542d5dcb691aae4e989d79))


### Bug Fixes

* **ses,pass-style,marshal:** tolerate platforms prior to AggregateError ([5762dd4](https://github.com/endojs/endo/commit/5762dd48e814e2e8435f666019e527d982eddbbd))



## [1.2.0](https://github.com/endojs/endo/compare/@endo/marshal@1.1.0...@endo/marshal@1.2.0) (2024-02-15)


### Features

* **marshal:** Introduce makePassableKit and support arbitrary remotable/promise/error compactOrdered encodings ([043039f](https://github.com/endojs/endo/commit/043039f273802cc74806de71294425fc01384a9d))
* **marshal:** tolerate extra error props ([#2052](https://github.com/endojs/endo/issues/2052)) ([70cdcd7](https://github.com/endojs/endo/commit/70cdcd7f314d459f9a53cf5cd76da2e1e00691c4))


### Bug Fixes

* Add repository directory to all package descriptors ([e5f36e7](https://github.com/endojs/endo/commit/e5f36e7a321c13ee25e74eb74d2a5f3d7517119c))
* **marshal:** Add a smaller and more efficient passable encoding ([a85616f](https://github.com/endojs/endo/commit/a85616fdf4c1cf4104ef4921cdade4fb040e4068)), closes [#1349](https://github.com/endojs/endo/issues/1349)


### Performance Improvements

* **marshal:** Avoid even more substring operations ([59b02aa](https://github.com/endojs/endo/commit/59b02aae5a87050819298bab77621cf4c7d39afa))
* **marshal:** Replace more XS-expensive string operations ([82e4770](https://github.com/endojs/endo/commit/82e47704707038ef930fbca598b02840dfeb62ef)), closes [#1982](https://github.com/endojs/endo/issues/1982) [#2001](https://github.com/endojs/endo/issues/2001)
* **marshal:** Replace XS-expensive string operations ([2dd3b43](https://github.com/endojs/endo/commit/2dd3b43a4c06fec94d46822dd8bbf9d4ab3db31f)), closes [#1982](https://github.com/endojs/endo/issues/1982)



## [1.1.0](https://github.com/endojs/endo/compare/@endo/marshal@1.0.1...@endo/marshal@1.1.0) (2024-01-18)


### Features

* **types:** generic Passable ([ae6ad15](https://github.com/endojs/endo/commit/ae6ad156e43fafb11df394f901df372760f9cbcc))



### [1.0.1](https://github.com/endojs/endo/compare/@endo/marshal@1.0.0...@endo/marshal@1.0.1) (2023-12-20)


### Bug Fixes

* Expressly forbid deep imports through captp, far, lockdown, marshal ([8fb4e97](https://github.com/endojs/endo/commit/8fb4e9734bfeb7c024cd0b9d4916b7410159152a))



## [1.0.0](https://github.com/endojs/endo/compare/@endo/marshal@0.8.9...@endo/marshal@1.0.0) (2023-12-12)


### Features

* **pass-style:** Far GET_METHOD_NAMES meta method ([b079812](https://github.com/endojs/endo/commit/b07981215a64766b2813f92f6d6c430d181b5512))
* **pass-style:** Safe promises can override @[@to](https://github.com/to)StringTag with a string ([55e094c](https://github.com/endojs/endo/commit/55e094c689b3460dae29baf04f7934b60c594c60))


### Bug Fixes

* Adjust type generation in release process and CI ([9465be3](https://github.com/endojs/endo/commit/9465be369e53167815ca444f6293a8e9eb48501d))
* Import types explicitly throughout ([631d087](https://github.com/endojs/endo/commit/631d087e291262ce3e798f7a15482c534cb7233b))
* review suggestions ([25ded7a](https://github.com/endojs/endo/commit/25ded7a14b82103ca58be15b8ec0195bdc9dd434))



### [0.8.9](https://github.com/endojs/endo/compare/@endo/marshal@0.8.8...@endo/marshal@0.8.9) (2023-09-12)


### Features

* **patterns:** Implement CopyMap comparison ([13028b2](https://github.com/endojs/endo/commit/13028b2b7e18b82cb313f58b66dfb7f35e2efde2))



### [0.8.8](https://github.com/endojs/endo/compare/@endo/marshal@0.8.6...@endo/marshal@0.8.8) (2023-08-07)


### Bug Fixes

* **ses:** normalize bestEffortsStringify property order ([137daff](https://github.com/endojs/endo/commit/137dafff089b7ff5bea74a398caa238f4d313f5e))



### [0.8.7](https://github.com/endojs/endo/compare/@endo/marshal@0.8.6...@endo/marshal@0.8.7) (2023-08-07)


### Bug Fixes

* **ses:** normalize bestEffortsStringify property order ([137daff](https://github.com/endojs/endo/commit/137dafff089b7ff5bea74a398caa238f4d313f5e))



### [0.8.6](https://github.com/endojs/endo/compare/@endo/marshal@0.8.5...@endo/marshal@0.8.6) (2023-07-19)


### Bug Fixes

* better wording ([3c5ccfc](https://github.com/endojs/endo/commit/3c5ccfc5aa7fb066a367e2876d17047fc394bed9))
* format ([7d1a1b0](https://github.com/endojs/endo/commit/7d1a1b01dff4cb96dbedfac1943b2c257c4acbc5))
* warning free lint ([a20ee00](https://github.com/endojs/endo/commit/a20ee00d2b378b710d758b2c7c7b65498276ae59))



### [0.8.5](https://github.com/endojs/endo/compare/@endo/marshal@0.8.4...@endo/marshal@0.8.5) (2023-04-20)

### Bug Fixes

- **marshal:** correct types ([2d3ba15](https://github.com/endojs/endo/commit/2d3ba1565927ab66922d71d05efc344f9307a709))

### [0.8.4](https://github.com/endojs/endo/compare/@endo/marshal@0.8.3...@endo/marshal@0.8.4) (2023-04-14)

### Features

- **pass-style,exo:** label remotable instances ([56edc68](https://github.com/endojs/endo/commit/56edc68444ac3e0d94d43028bc7d53fe804bb332))
- **ses:** option to fake harden unsafely ([697bf58](https://github.com/endojs/endo/commit/697bf5855e4a6578db4cbca40bfeca253a6a2cfe))

### Bug Fixes

- sort type confusion between `pass-style` and `marshal` ([db09e13](https://github.com/endojs/endo/commit/db09e13463806b4524951cd694272243958a7182))

### Reverts

- Revert "fix: parse positive bigints correctly despite XS parsing them wrong (#1325)" ([657c4aa](https://github.com/endojs/endo/commit/657c4aada2b87ae1427fd2dbb3e51ae1cc558799)), closes [#1325](https://github.com/endojs/endo/issues/1325)

### [0.8.3](https://github.com/endojs/endo/compare/@endo/marshal@0.8.2...@endo/marshal@0.8.3) (2023-03-07)

### Features

- **marshal:** display slot values if supplied ([6edaf4a](https://github.com/endojs/endo/commit/6edaf4ac5a81640f0dddef30027a7d24e88ff09c))
- **marshal:** new methods {to,from}CapData ([2c97bb9](https://github.com/endojs/endo/commit/2c97bb9484a594a7143c767d33c290dcfb8d1321))
- **pass-style:** Extract passStyleOf and friends from marshal into the new pass-style package ([#1439](https://github.com/endojs/endo/issues/1439)) ([ccd003c](https://github.com/endojs/endo/commit/ccd003c96f3d969d919104118d8a34b3c1126aef))

### Bug Fixes

- Fix hackerone.com links in SECURITY.md ([#1472](https://github.com/endojs/endo/issues/1472)) ([389733d](https://github.com/endojs/endo/commit/389733dbc7a74992f909c38d27ea7e8e68623959))
- make deeplyFulfilled an async function ([#1455](https://github.com/endojs/endo/issues/1455)) ([fdc3374](https://github.com/endojs/endo/commit/fdc33741414cb6b11bfa322cff8e027fe9c858b0))
- marshal export what others import ([#1447](https://github.com/endojs/endo/issues/1447)) ([e2a016f](https://github.com/endojs/endo/commit/e2a016f0b94d262256d30f67d48d3a194cb1b35d))
- move arb-passable to pass-style ([#1448](https://github.com/endojs/endo/issues/1448)) ([09235a9](https://github.com/endojs/endo/commit/09235a9a339229636fb37b4483ccddbe3b60d5ee))
- tools arb passable ([#1291](https://github.com/endojs/endo/issues/1291)) ([368d7cb](https://github.com/endojs/endo/commit/368d7cbd754efb5248248106773a625d5ec68504))

### [0.8.2](https://github.com/endojs/endo/compare/@endo/marshal@0.8.1...@endo/marshal@0.8.2) (2022-12-23)

### Bug Fixes

- **marshal:** Work around TypeScript issue ([56d3d81](https://github.com/endojs/endo/commit/56d3d8103238996c307b35a26bf6a3eaf3c40bcc))

### [0.8.1](https://github.com/endojs/endo/compare/@endo/marshal@0.8.0...@endo/marshal@0.8.1) (2022-11-14)

### Bug Fixes

- assert touchups ([#1350](https://github.com/endojs/endo/issues/1350)) ([3fcb5b1](https://github.com/endojs/endo/commit/3fcb5b117eccb326c6c81339ae6a293a6bcaa9d4))
- fail template ([#1334](https://github.com/endojs/endo/issues/1334)) ([725b987](https://github.com/endojs/endo/commit/725b987ffa812a070ff45fcd496cf8fd88df6963))
- Start migrating encodePassable and rankOrder from agoric-sdk to endo ([#1260](https://github.com/endojs/endo/issues/1260)) ([a025103](https://github.com/endojs/endo/commit/a025103e8ee14f20dd3455fed0a8dbc6b11b076d))

## [0.8.0](https://github.com/endojs/endo/compare/@endo/marshal@0.7.6...@endo/marshal@0.8.0) (2022-10-24)

### ⚠ BREAKING CHANGES

- **marshal:** Reject null as a substitute for Object.prototype

### Bug Fixes

- restore capdata leniency ([#1338](https://github.com/endojs/endo/issues/1338)) ([99a4d6c](https://github.com/endojs/endo/commit/99a4d6c83b9be4670e819ce496d7bff539b7587b))
- **marshal:** Check if input is an error before checking if it is remotable ([#1323](https://github.com/endojs/endo/issues/1323)) ([f3e0982](https://github.com/endojs/endo/commit/f3e09824e49cf3fb3c75358879853443bbde2c34)), closes [#1318](https://github.com/endojs/endo/issues/1318)
- **marshal:** Reject null as a substitute for Object.prototype ([1df4193](https://github.com/endojs/endo/commit/1df419350c2d18a9551a918b08dec5c43712043f)), closes [#1324](https://github.com/endojs/endo/issues/1324)

### Performance Improvements

- **marshal:** Memoize checkRemotable ([5e9bd3f](https://github.com/endojs/endo/commit/5e9bd3f2fb166e80cf2fa4cca81756a3aeef1bc2))

### [0.7.6](https://github.com/endojs/endo/compare/@endo/marshal@0.7.5...@endo/marshal@0.7.6) (2022-10-19)

### Bug Fixes

- **marshal:** Return a special error message from passStyleOf(typedArray) ([dbd498e](https://github.com/endojs/endo/commit/dbd498e30a5c3b0d2713d863bc7479ceef39cd79)), closes [#1326](https://github.com/endojs/endo/issues/1326)
- parse positive bigints correctly despite XS parsing them wrong ([#1325](https://github.com/endojs/endo/issues/1325)) ([ab31d51](https://github.com/endojs/endo/commit/ab31d51fc2df0355b45da8bbeff892c45d81c98a)), closes [#1309](https://github.com/endojs/endo/issues/1309)
- **marshal:** Add CapData encode/decode consistency assertions ([0b75021](https://github.com/endojs/endo/commit/0b75021acea174ce386c156f21de72a2150ad2dc))
- **marshal:** Consistently quote "[@qclass](https://github.com/qclass)" in error messages ([4ab6743](https://github.com/endojs/endo/commit/4ab67436e9eb3c5ad9dc39d9e050529272e8dad6))
- fix tiny typo ([#1321](https://github.com/endojs/endo/issues/1321)) ([7f3c371](https://github.com/endojs/endo/commit/7f3c371073d49b1b911d582cb8c63cbc9160d213))
- **marshal:** Detect unexpected nonenumerable properties on tagged records and remotables ([da0f11f](https://github.com/endojs/endo/commit/da0f11f73ae1f2b9f7ec8c39e56b2c244e81b45d)), closes [#1316](https://github.com/endojs/endo/issues/1316)
- unserialize makes copyRecords without problematic assign semantics ([#1304](https://github.com/endojs/endo/issues/1304)) ([5f0caf9](https://github.com/endojs/endo/commit/5f0caf95c40c55d8815818e66f63960788676cb0))

### Performance Improvements

- **marshal:** Extend new assert style to `check` calls ([11d9f97](https://github.com/endojs/endo/commit/11d9f976944b4faaea06037252cfd54e3dd91c37))
- **marshal:** Skip unnecessary assert.details calls ([053ca12](https://github.com/endojs/endo/commit/053ca12110c706439a5f3611592a0b49cb829ac6))

### [0.7.5](https://github.com/endojs/endo/compare/@endo/marshal@0.7.4...@endo/marshal@0.7.5) (2022-09-27)

### Bug Fixes

- import endo/init, not lockdown ([#1299](https://github.com/endojs/endo/issues/1299)) ([f6eb272](https://github.com/endojs/endo/commit/f6eb2723b4f3e48e6c51d98194798a3dcdfb94a0))
- Provide smallcaps encoding in addition to capData ([#1282](https://github.com/endojs/endo/issues/1282)) ([233dbe2](https://github.com/endojs/endo/commit/233dbe2e159e454fd3bcdd0e08b15c4439b56ba7))

### [0.7.4](https://github.com/endojs/endo/compare/@endo/marshal@0.7.3...@endo/marshal@0.7.4) (2022-09-14)

### Bug Fixes

- alt syntax for positive but faster assertions ([#1280](https://github.com/endojs/endo/issues/1280)) ([dc24f2f](https://github.com/endojs/endo/commit/dc24f2f2c3cac7ce239a64c503493c41a2334315))
- bad check defaults ([#1274](https://github.com/endojs/endo/issues/1274)) ([7229fcf](https://github.com/endojs/endo/commit/7229fcfee146f12be3c2455c303015aee163709d))
- tolerate more from async_hooks ([#1275](https://github.com/endojs/endo/issues/1275)) ([1a0b123](https://github.com/endojs/endo/commit/1a0b1230c9ca7a80d14ff1808986ef6d4a861553))

### [0.7.3](https://github.com/endojs/endo/compare/@endo/marshal@0.7.2...@endo/marshal@0.7.3) (2022-08-26)

**Note:** Version bump only for package @endo/marshal

### [0.7.2](https://github.com/endojs/endo/compare/@endo/marshal@0.7.1...@endo/marshal@0.7.2) (2022-08-26)

### Bug Fixes

- split marshal from its encoder ([#1259](https://github.com/endojs/endo/issues/1259)) ([1e3b7fc](https://github.com/endojs/endo/commit/1e3b7fcfffcb435c2c6b82c7c24e2c75382f3a18))

### [0.7.1](https://github.com/endojs/endo/compare/@endo/marshal@0.7.0...@endo/marshal@0.7.1) (2022-08-25)

### Bug Fixes

- **marshal:** handle async_hooks symbols on promises ([94cbce7](https://github.com/endojs/endo/commit/94cbce7a6780b58a1f160faf0a374ac938c15047))

## [0.7.0](https://github.com/endojs/endo/compare/@endo/marshal@0.6.9...@endo/marshal@0.7.0) (2022-08-23)

### ⚠ BREAKING CHANGES

- **marshal:** assertPure wrong but unused (#1242)

### Bug Fixes

- passStyleOf full input validation ([#1250](https://github.com/endojs/endo/issues/1250)) ([fb84bff](https://github.com/endojs/endo/commit/fb84bff75bbca277aaa90d88d29a811c2c6194ae))
- prepare for far classes ([#1251](https://github.com/endojs/endo/issues/1251)) ([c22476f](https://github.com/endojs/endo/commit/c22476f4209513a07b73503cc07fda15d2799676))
- remove dead environment-options module ([#1243](https://github.com/endojs/endo/issues/1243)) ([c43c939](https://github.com/endojs/endo/commit/c43c9396976ad6b0af5d99caed033b1abf448165))
- **marshal:** assertPure wrong but unused ([#1242](https://github.com/endojs/endo/issues/1242)) ([1895f5b](https://github.com/endojs/endo/commit/1895f5b0172cadacb4fc54b9f64c7e0c8314d041))

### [0.6.9](https://github.com/endojs/endo/compare/@endo/marshal@0.6.8...@endo/marshal@0.6.9) (2022-06-28)

**Note:** Version bump only for package @endo/marshal

### [0.6.8](https://github.com/endojs/endo/compare/@endo/marshal@0.6.7...@endo/marshal@0.6.8) (2022-06-11)

### Bug Fixes

- decodeToJustin accepts slot backrefs ([#1186](https://github.com/endojs/endo/issues/1186)) ([e4f71b4](https://github.com/endojs/endo/commit/e4f71b46a440bfb0e15bd24f709c58e94887b942))
- retire deprecated sending only ([#1187](https://github.com/endojs/endo/issues/1187)) ([af656b2](https://github.com/endojs/endo/commit/af656b20491969b8c3106f51276865690f702794))

### [0.6.7](https://github.com/endojs/endo/compare/@endo/marshal@0.6.6...@endo/marshal@0.6.7) (2022-04-15)

**Note:** Version bump only for package @endo/marshal

### [0.6.6](https://github.com/endojs/endo/compare/@endo/marshal@0.6.5...@endo/marshal@0.6.6) (2022-04-14)

**Note:** Version bump only for package @endo/marshal

### [0.6.5](https://github.com/endojs/endo/compare/@endo/marshal@0.6.4...@endo/marshal@0.6.5) (2022-04-13)

### Bug Fixes

- Revert dud release ([c8a7101](https://github.com/endojs/endo/commit/c8a71017d8d7af10a97909c9da9c5c7e59aed939))

### [0.6.4](https://github.com/endojs/endo/compare/@endo/marshal@0.6.3...@endo/marshal@0.6.4) (2022-04-12)

### Features

- **marshal:** stamp Remotable return with `RemotableBrand<L,R>` ([8b9b8fd](https://github.com/endojs/endo/commit/8b9b8fd9b1f40c22b1b9ddef46569db81dd7bff6))

### [0.6.3](https://github.com/endojs/endo/compare/@endo/marshal@0.6.2...@endo/marshal@0.6.3) (2022-03-07)

### Features

- **marshal:** have `Remotable` create `Remote<T>`-compatible objs ([1ba89ba](https://github.com/endojs/endo/commit/1ba89ba922275f08d3b7b8c82fae0dca31752321))

### [0.6.2](https://github.com/endojs/endo/compare/@endo/marshal@0.6.1...@endo/marshal@0.6.2) (2022-03-02)

**Note:** Version bump only for package @endo/marshal

### [0.6.1](https://github.com/endojs/endo/compare/@endo/marshal@0.6.0...@endo/marshal@0.6.1) (2022-02-20)

**Note:** Version bump only for package @endo/marshal

## [0.6.0](https://github.com/endojs/endo/compare/@endo/marshal@0.5.4...@endo/marshal@0.6.0) (2022-02-18)

### ⚠ BREAKING CHANGES

- **marshal:** Remove ambient types

### Bug Fixes

- Make jsconfigs less brittle ([861ca32](https://github.com/endojs/endo/commit/861ca32a72f0a48410fd93b1cbaaad9139590659))
- remove pureCopy, ALLOW_IMPLICIT_REMOTABLES ([#1061](https://github.com/endojs/endo/issues/1061)) ([f08cad9](https://github.com/endojs/endo/commit/f08cad99aa715aa36f78dfd67b9f581cdd22bb3c))
- **marshal:** Fix typing for TS 4.5 compatibility ([8513cfb](https://github.com/endojs/endo/commit/8513cfbaaa2308bee9f666585694e622e84fd24e))
- **marshal:** Remove ambient types ([2a9cf63](https://github.com/endojs/endo/commit/2a9cf6372042b1fb16e1c96af5f3f9526978570a))

### [0.5.4](https://github.com/endojs/endo/compare/@endo/marshal@0.5.3...@endo/marshal@0.5.4) (2022-01-31)

**Note:** Version bump only for package @endo/marshal

### [0.5.3](https://github.com/endojs/endo/compare/@endo/marshal@0.5.2...@endo/marshal@0.5.3) (2022-01-27)

### Bug Fixes

- Publish all materials consistently ([#1021](https://github.com/endojs/endo/issues/1021)) ([a2c74d9](https://github.com/endojs/endo/commit/a2c74d9de68a325761d62e1b2187a117ef884571))

### [0.5.2](https://github.com/endojs/endo/compare/@endo/marshal@0.5.1...@endo/marshal@0.5.2) (2022-01-25)

### Bug Fixes

- **marshal:** error serialization uses name from prototype ([#1010](https://github.com/endojs/endo/issues/1010)) ([aff3ff7](https://github.com/endojs/endo/commit/aff3ff71144df359e12949b0c2d8a1a5f491810a))
- assert that unserialize makes only passables ([#996](https://github.com/endojs/endo/issues/996)) ([b34817b](https://github.com/endojs/endo/commit/b34817b9910fd0c9092dc9c1d11a14709ff11542))
- only shallow freeze needed ([#994](https://github.com/endojs/endo/issues/994)) ([edeaf8a](https://github.com/endojs/endo/commit/edeaf8a111ad4dc625484555d317c38f38ae7641))
- remove more extraneous spaced-comment comments ([#1009](https://github.com/endojs/endo/issues/1009)) ([980a798](https://github.com/endojs/endo/commit/980a79898a4643a359d905c308eecf70d8ab2758))

### 0.5.1 (2022-01-23)

**Note:** Version bump only for package @endo/marshal

## [0.5.0](https://github.com/Agoric/agoric-sdk/compare/@agoric/marshal@0.4.28...@agoric/marshal@0.5.0) (2021-12-02)

### ⚠ BREAKING CHANGES

- **ERTP:** NatValues now only accept bigints, lower-case amountMath is removed, and AmountMath methods always follow the order of: brand, value

- chore: fix up INPUT_VALIDATON.md

- chore: address PR comments

### Bug Fixes

- default to disallowing implicit remotables ([#3736](https://github.com/Agoric/agoric-sdk/issues/3736)) ([d14a665](https://github.com/Agoric/agoric-sdk/commit/d14a66548f3981334f9738bbca3b906901c2e657))

### Miscellaneous Chores

- **ERTP:** additional input validation and clean up ([#3892](https://github.com/Agoric/agoric-sdk/issues/3892)) ([067ea32](https://github.com/Agoric/agoric-sdk/commit/067ea32b069596202d7f8e7c5e09d5ea7821f6b2))

### [0.4.28](https://github.com/Agoric/agoric-sdk/compare/@agoric/marshal@0.4.27...@agoric/marshal@0.4.28) (2021-10-13)

### Bug Fixes

- document copyRecord guarantees ([#3955](https://github.com/Agoric/agoric-sdk/issues/3955)) ([f4a0ba1](https://github.com/Agoric/agoric-sdk/commit/f4a0ba113dba913c33c37043e700825f3512cf73))

### [0.4.27](https://github.com/Agoric/agoric-sdk/compare/@agoric/marshal@0.4.26...@agoric/marshal@0.4.27) (2021-09-23)

**Note:** Version bump only for package @agoric/marshal

### [0.4.26](https://github.com/Agoric/agoric-sdk/compare/@agoric/marshal@0.4.25...@agoric/marshal@0.4.26) (2021-09-15)

**Note:** Version bump only for package @agoric/marshal

### [0.4.25](https://github.com/Agoric/agoric-sdk/compare/@agoric/marshal@0.4.24...@agoric/marshal@0.4.25) (2021-08-18)

**Note:** Version bump only for package @agoric/marshal

### [0.4.24](https://github.com/Agoric/agoric-sdk/compare/@agoric/marshal@0.4.23...@agoric/marshal@0.4.24) (2021-08-17)

**Note:** Version bump only for package @agoric/marshal

### [0.4.23](https://github.com/Agoric/agoric-sdk/compare/@agoric/marshal@0.4.22...@agoric/marshal@0.4.23) (2021-08-16)

**Note:** Version bump only for package @agoric/marshal

### [0.4.22](https://github.com/Agoric/agoric-sdk/compare/@agoric/marshal@0.4.19...@agoric/marshal@0.4.22) (2021-08-15)

### 0.26.10 (2021-07-28)

**Note:** Version bump only for package @agoric/marshal

### [0.4.21](https://github.com/Agoric/agoric-sdk/compare/@agoric/marshal@0.4.19...@agoric/marshal@0.4.21) (2021-08-14)

### 0.26.10 (2021-07-28)

**Note:** Version bump only for package @agoric/marshal

### [0.4.20](https://github.com/Agoric/agoric-sdk/compare/@agoric/marshal@0.4.19...@agoric/marshal@0.4.20) (2021-07-28)

**Note:** Version bump only for package @agoric/marshal

### [0.4.19](https://github.com/Agoric/agoric-sdk/compare/@agoric/marshal@0.4.18...@agoric/marshal@0.4.19) (2021-07-01)

**Note:** Version bump only for package @agoric/marshal

### [0.4.18](https://github.com/Agoric/agoric-sdk/compare/@agoric/marshal@0.4.17...@agoric/marshal@0.4.18) (2021-06-28)

**Note:** Version bump only for package @agoric/marshal

### [0.4.17](https://github.com/Agoric/agoric-sdk/compare/@agoric/marshal@0.4.16...@agoric/marshal@0.4.17) (2021-06-25)

**Note:** Version bump only for package @agoric/marshal

### [0.4.16](https://github.com/Agoric/agoric-sdk/compare/@agoric/marshal@0.4.15...@agoric/marshal@0.4.16) (2021-06-24)

**Note:** Version bump only for package @agoric/marshal

### [0.4.15](https://github.com/Agoric/agoric-sdk/compare/@agoric/marshal@0.4.14...@agoric/marshal@0.4.15) (2021-06-24)

**Note:** Version bump only for package @agoric/marshal

### [0.4.14](https://github.com/Agoric/agoric-sdk/compare/@agoric/marshal@0.4.13...@agoric/marshal@0.4.14) (2021-06-23)

**Note:** Version bump only for package @agoric/marshal

### [0.4.13](https://github.com/Agoric/agoric-sdk/compare/@agoric/marshal@0.4.12...@agoric/marshal@0.4.13) (2021-06-16)

**Note:** Version bump only for package @agoric/marshal

### [0.4.12](https://github.com/Agoric/agoric-sdk/compare/@agoric/marshal@0.4.11...@agoric/marshal@0.4.12) (2021-06-15)

### Bug Fixes

- Pin ESM to forked version ([54dbb55](https://github.com/Agoric/agoric-sdk/commit/54dbb55d64d7ff7adb395bc4bd9d1461dd2d3c17))

## [0.4.11](https://github.com/Agoric/agoric-sdk/compare/@agoric/marshal@0.4.10...@agoric/marshal@0.4.11) (2021-05-10)

**Note:** Version bump only for package @agoric/marshal

## [0.4.10](https://github.com/Agoric/agoric-sdk/compare/@agoric/marshal@0.4.9...@agoric/marshal@0.4.10) (2021-05-05)

**Note:** Version bump only for package @agoric/marshal

## [0.4.9](https://github.com/Agoric/agoric-sdk/compare/@agoric/marshal@0.4.8...@agoric/marshal@0.4.9) (2021-05-05)

### Bug Fixes

- **marshal:** [#2435](https://github.com/Agoric/agoric-sdk/issues/2435) make getInterfaceOf truthful ([ff19f93](https://github.com/Agoric/agoric-sdk/commit/ff19f9333ed30a99bcbe1a9bfc167dea8d73c057))
- add noIbids option ([#2886](https://github.com/Agoric/agoric-sdk/issues/2886)) ([39388bc](https://github.com/Agoric/agoric-sdk/commit/39388bc6b96c6b05b807d8c44614b9acb670467d))
- remove deprecated ibid support ([#2898](https://github.com/Agoric/agoric-sdk/issues/2898)) ([f865a2a](https://github.com/Agoric/agoric-sdk/commit/f865a2a8fb5d6cb1d16d9fc21ad4868ea6d5a294)), closes [#2896](https://github.com/Agoric/agoric-sdk/issues/2896) [#2896](https://github.com/Agoric/agoric-sdk/issues/2896) [#2896](https://github.com/Agoric/agoric-sdk/issues/2896)
- settle REMOTE_STYLE name ([#2900](https://github.com/Agoric/agoric-sdk/issues/2900)) ([3dc6638](https://github.com/Agoric/agoric-sdk/commit/3dc66385b85cb3e8a1056b8d6e64cd3e448c041f))
- split marshal module ([#2803](https://github.com/Agoric/agoric-sdk/issues/2803)) ([2e19e78](https://github.com/Agoric/agoric-sdk/commit/2e19e7878bc06dd71e166e13c9cce462b3d5ff7a))

## [0.4.8](https://github.com/Agoric/agoric-sdk/compare/@agoric/marshal@0.4.7...@agoric/marshal@0.4.8) (2021-04-22)

**Note:** Version bump only for package @agoric/marshal

## [0.4.7](https://github.com/Agoric/agoric-sdk/compare/@agoric/marshal@0.4.6...@agoric/marshal@0.4.7) (2021-04-18)

**Note:** Version bump only for package @agoric/marshal

## [0.4.6](https://github.com/Agoric/agoric-sdk/compare/@agoric/marshal@0.4.5...@agoric/marshal@0.4.6) (2021-04-16)

**Note:** Version bump only for package @agoric/marshal

## [0.4.5](https://github.com/Agoric/agoric-sdk/compare/@agoric/marshal@0.4.4...@agoric/marshal@0.4.5) (2021-04-14)

**Note:** Version bump only for package @agoric/marshal

## [0.4.4](https://github.com/Agoric/agoric-sdk/compare/@agoric/marshal@0.4.3...@agoric/marshal@0.4.4) (2021-04-13)

**Note:** Version bump only for package @agoric/marshal

## [0.4.3](https://github.com/Agoric/agoric-sdk/compare/@agoric/marshal@0.4.2...@agoric/marshal@0.4.3) (2021-04-07)

**Note:** Version bump only for package @agoric/marshal

## [0.4.2](https://github.com/Agoric/agoric-sdk/compare/@agoric/marshal@0.4.1...@agoric/marshal@0.4.2) (2021-04-06)

**Note:** Version bump only for package @agoric/marshal

## [0.4.1](https://github.com/Agoric/agoric-sdk/compare/@agoric/marshal@0.4.0...@agoric/marshal@0.4.1) (2021-03-24)

### Bug Fixes

- **marshal:** remove Data ([81dd9a4](https://github.com/Agoric/agoric-sdk/commit/81dd9a492bd70f63e71647a29356eb890063641d)), closes [#2018](https://github.com/Agoric/agoric-sdk/issues/2018)

# [0.4.0](https://github.com/Agoric/agoric-sdk/compare/@agoric/marshal@0.3.2...@agoric/marshal@0.4.0) (2021-03-16)

### Bug Fixes

- fix ibids. test ibids and slots ([#2625](https://github.com/Agoric/agoric-sdk/issues/2625)) ([891d9fd](https://github.com/Agoric/agoric-sdk/commit/891d9fd236ca86b63947384064b675c52e960abd))
- make separate 'test:xs' target, remove XS from 'test' target ([b9c1a69](https://github.com/Agoric/agoric-sdk/commit/b9c1a6987093fc8e09e8aba7acd2a1618413bac8)), closes [#2647](https://github.com/Agoric/agoric-sdk/issues/2647)
- **marshal:** add Data marker, tolerate its presence ([d7b190f](https://github.com/Agoric/agoric-sdk/commit/d7b190f340ba336bd0d76a2ca8ed4829f227be61))
- **marshal:** add placeholder warnings ([8499b8e](https://github.com/Agoric/agoric-sdk/commit/8499b8e4584f3ae155913f95614980a483c487e2))
- **marshal:** serialize empty objects as data, not pass-by-reference ([aeee1ad](https://github.com/Agoric/agoric-sdk/commit/aeee1adf561d44ed3bc738989be605b683b3b656)), closes [#2018](https://github.com/Agoric/agoric-sdk/issues/2018)
- separate ibid tables ([#2596](https://github.com/Agoric/agoric-sdk/issues/2596)) ([e0704eb](https://github.com/Agoric/agoric-sdk/commit/e0704eb640a54ceec11b39fc924488108cb10cee))

### Features

- **marshal:** add Data() to all unserialized empty records ([946fd6f](https://github.com/Agoric/agoric-sdk/commit/946fd6f1b811c55ee39668100755db24f1b52329))
- **marshal:** allow marshalSaveError function to be specified ([c93bb04](https://github.com/Agoric/agoric-sdk/commit/c93bb046aecf476dc9ccc537671a14f446b89ed4))
- **marshal:** Data({}) is pass-by-copy ([03d7b5e](https://github.com/Agoric/agoric-sdk/commit/03d7b5eed8ecd3f24725d6ea63919f4398d8a2f8))

## [0.3.2](https://github.com/Agoric/agoric-sdk/compare/@agoric/marshal@0.3.1...@agoric/marshal@0.3.2) (2021-02-22)

**Note:** Version bump only for package @agoric/marshal

## [0.3.1](https://github.com/Agoric/agoric-sdk/compare/@agoric/marshal@0.3.0...@agoric/marshal@0.3.1) (2021-02-16)

### Bug Fixes

- **marshal:** reject getters in pass-by-ref, even if it returns a function ([#2438](https://github.com/Agoric/agoric-sdk/issues/2438)) ([b9368b6](https://github.com/Agoric/agoric-sdk/commit/b9368b6ee16a5562a622551539eff2b8708f0fdd)), closes [#2436](https://github.com/Agoric/agoric-sdk/issues/2436)
- Correlate sent errors with received errors ([73b9cfd](https://github.com/Agoric/agoric-sdk/commit/73b9cfd33cf7842bdc105a79592028649cb1c92a))
- Far and Remotable do unverified local marking rather than WeakMap ([#2361](https://github.com/Agoric/agoric-sdk/issues/2361)) ([ab59ab7](https://github.com/Agoric/agoric-sdk/commit/ab59ab779341b9740827b7c4cca4680e7b7212b2))
- review comments ([7db7e5c](https://github.com/Agoric/agoric-sdk/commit/7db7e5c4c569dfedff8d748dd58893218b0a2458))
- use assert rather than FooError constructors ([f860c5b](https://github.com/Agoric/agoric-sdk/commit/f860c5bf5add165a08cb5bd543502857c3f57998))

# [0.3.0](https://github.com/Agoric/agoric-sdk/compare/@agoric/marshal@0.2.7...@agoric/marshal@0.3.0) (2020-12-10)

### Bug Fixes

- minor tweaks for dapp-oracle ([b8169c1](https://github.com/Agoric/agoric-sdk/commit/b8169c1f39bc0c0d7c07099df2ac23ee7df05733))

### Features

- **import-bundle:** Preliminary support Endo zip hex bundle format ([#1983](https://github.com/Agoric/agoric-sdk/issues/1983)) ([983681b](https://github.com/Agoric/agoric-sdk/commit/983681bfc4bf512b6bd90806ed9220cd4fefc13c))

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

- add "TODO unimplemented"s ([#1580](https://github.com/Agoric/agoric-sdk/issues/1580)) ([7795f93](https://github.com/Agoric/agoric-sdk/commit/7795f9302843a2c94d4a2f42cb22affe1e91d41d))
- clean up E.when and E.resolve ([#1561](https://github.com/Agoric/agoric-sdk/issues/1561)) ([634046c](https://github.com/Agoric/agoric-sdk/commit/634046c0fc541fc1db258105a75c7313b5668aa0))
- excise @agoric/harden from the codebase ([eee6fe1](https://github.com/Agoric/agoric-sdk/commit/eee6fe1153730dec52841c9eb4c056a8c5438b0f))
- minor: rearrange asserts in Remotable ([#1642](https://github.com/Agoric/agoric-sdk/issues/1642)) ([c43a08f](https://github.com/Agoric/agoric-sdk/commit/c43a08fb1733596172a7dc5ca89353d837033e23))
- reduce inconsistency among our linting rules ([#1492](https://github.com/Agoric/agoric-sdk/issues/1492)) ([b6b675e](https://github.com/Agoric/agoric-sdk/commit/b6b675e2de110e2af19cad784a66220cab21dacf))
- rename producePromise to makePromiseKit ([#1329](https://github.com/Agoric/agoric-sdk/issues/1329)) ([1d2925a](https://github.com/Agoric/agoric-sdk/commit/1d2925ad640cce7b419751027b44737bd46a6d59))
- send and receive Remotable tags ([#1628](https://github.com/Agoric/agoric-sdk/issues/1628)) ([1bae122](https://github.com/Agoric/agoric-sdk/commit/1bae1220c2c35f48f279cb3aeab6012bce8ddb5a))
- stricter marshal requirements ([#1499](https://github.com/Agoric/agoric-sdk/issues/1499)) ([9d8ba97](https://github.com/Agoric/agoric-sdk/commit/9d8ba9763defb290de71668d08faa8619200d117))
- use REMOTE_STYLE rather than 'presence' to prepare ([#1577](https://github.com/Agoric/agoric-sdk/issues/1577)) ([6b97ae8](https://github.com/Agoric/agoric-sdk/commit/6b97ae8670303631313a65d12393d7ad226b941d))
- **marshal:** make toString and Symbol.toStringTag non-enumerable ([fc616ef](https://github.com/Agoric/agoric-sdk/commit/fc616eff1c3f61cd96e24644eeb76d8f8469a05c))

## [0.2.3](https://github.com/Agoric/agoric-sdk/compare/@agoric/marshal@0.2.2...@agoric/marshal@0.2.3) (2020-06-30)

**Note:** Version bump only for package @agoric/marshal

## [0.2.2](https://github.com/Agoric/agoric-sdk/compare/@agoric/marshal@0.2.1...@agoric/marshal@0.2.2) (2020-05-17)

**Note:** Version bump only for package @agoric/marshal

## [0.2.1](https://github.com/Agoric/agoric-sdk/compare/@agoric/marshal@0.2.0...@agoric/marshal@0.2.1) (2020-05-10)

**Note:** Version bump only for package @agoric/marshal

# [0.2.0](https://github.com/Agoric/agoric-sdk/compare/@agoric/marshal@0.1.5...@agoric/marshal@0.2.0) (2020-05-04)

### Bug Fixes

- address PR comments ([358952a](https://github.com/Agoric/agoric-sdk/commit/358952ab0f85ec9969a206a716fa91aa8b56c1e2))
- propagate Go errors all the way to the caller ([ea5ba38](https://github.com/Agoric/agoric-sdk/commit/ea5ba381e4e510bb9c9053bfb681e778f782a801))
- use getErrorConstructor to deep-copy an Error ([8ae1994](https://github.com/Agoric/agoric-sdk/commit/8ae1994f8ad9ee6dda34643b6323ed8422751115))

### Features

- add Presence, getInterfaceOf, deepCopyData to marshal ([aac1899](https://github.com/Agoric/agoric-sdk/commit/aac1899b6cefc4241af04911a92ffc50fbac3429))

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

- first draft use collection equality ([6acbde7](https://github.com/Agoric/marshal/commit/6acbde71ec82101ec8da9eaafc729bab1fdd6df9))
- symbols no longer passable ([7290a90](https://github.com/Agoric/marshal/commit/7290a90444f70d2a9a2f5c1e2782d18bea00039d))
- **eventual-send:** Update the API throughout agoric-sdk ([97fc1e7](https://github.com/Agoric/marshal/commit/97fc1e748d8e3955b29baf0e04bfa788d56dad9f))
- **SwingSet:** passing all tests ([341718b](https://github.com/Agoric/marshal/commit/341718be335e16b58aa5e648b51a731ea065c1d6))
