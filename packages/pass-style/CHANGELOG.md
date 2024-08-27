# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

### [1.4.3](https://github.com/endojs/endo/compare/@endo/pass-style@1.4.2...@endo/pass-style@1.4.3) (2024-08-27)


### Bug Fixes

* **types:** void is Passable ([1ecb0e7](https://github.com/endojs/endo/commit/1ecb0e7732978f8907ec58a166d792f19b4c8054))



### [1.4.2](https://github.com/endojs/endo/compare/@endo/pass-style@1.4.1...@endo/pass-style@1.4.2) (2024-08-01)

**Note:** Version bump only for package @endo/pass-style





### [1.4.1](https://github.com/endojs/endo/compare/@endo/pass-style@1.4.0...@endo/pass-style@1.4.1) (2024-07-30)


### Performance Improvements

* **pass-style:** Eliminate redundant work to validate copyArrays and copyRecords ([59e2ba8](https://github.com/endojs/endo/commit/59e2ba85965e136097737099947f02d5b976ccb6))
* **pass-style:** Make a rejector only when needed ([3c3e4b7](https://github.com/endojs/endo/commit/3c3e4b701dbf23263125f00f02864016ef0e8f8b))
* **pass-style:** Use more property descriptor value extraction ([5fabd3f](https://github.com/endojs/endo/commit/5fabd3f4dc7ecf76283c759f60017ebbac7c314f))



## [1.4.0](https://github.com/endojs/endo/compare/@endo/pass-style@1.3.1...@endo/pass-style@1.4.0) (2024-05-07)


### Features

* **pass-style,exo:** exo boundary only throws throwables ([#2266](https://github.com/endojs/endo/issues/2266)) ([2f0888e](https://github.com/endojs/endo/commit/2f0888e789edca35de86fa9726e6bbd70af8be2f)), closes [#2223](https://github.com/endojs/endo/issues/2223)
* **types:** fromCapData is Passable, but unknown is more practical ([5fa54f0](https://github.com/endojs/endo/commit/5fa54f0287b467d3d6baf354a36263a4aa36ec55))
* **types:** generic Passable ([fa59e05](https://github.com/endojs/endo/commit/fa59e05fc5621410a184c1eb4f4ee850bddce09c))


### Bug Fixes

* **pass-style:** remove redundant vestigial [@returns](https://github.com/returns) declaration ([#1958](https://github.com/endojs/endo/issues/1958)) ([8911ba8](https://github.com/endojs/endo/commit/8911ba89a1669796b6e09e90e24bb4f4c7b33697)), closes [#1933](https://github.com/endojs/endo/issues/1933)
* **pass-style:** toPassableError fixed. (is/assert)PassableError removed. ([#2156](https://github.com/endojs/endo/issues/2156)) ([205e45f](https://github.com/endojs/endo/commit/205e45f9adc43a795d4689627c830ba0ee9178f9))
* **ses:** `harden` hacks v8 `stack` own accessor problem ([#2232](https://github.com/endojs/endo/issues/2232)) ([4b529e0](https://github.com/endojs/endo/commit/4b529e0ee07d6997f9f25e469a2c53576b0106ea)), closes [#2198](https://github.com/endojs/endo/issues/2198) [#2230](https://github.com/endojs/endo/issues/2230) [#2200](https://github.com/endojs/endo/issues/2200) [#2229](https://github.com/endojs/endo/issues/2229) [#2231](https://github.com/endojs/endo/issues/2231) [#2229](https://github.com/endojs/endo/issues/2229) [#2229](https://github.com/endojs/endo/issues/2229)
* **ses:** makeError defaults to making passable errors ([#2200](https://github.com/endojs/endo/issues/2200)) ([3b0f766](https://github.com/endojs/endo/commit/3b0f76675b32bae4a428aada739b62a5dae02192))



### [1.3.1](https://github.com/endojs/endo/compare/@endo/pass-style@1.3.0...@endo/pass-style@1.3.1) (2024-04-04)

**Note:** Version bump only for package @endo/pass-style





## [1.3.0](https://github.com/endojs/endo/compare/@endo/pass-style@1.2.0...@endo/pass-style@1.3.0) (2024-03-20)


### Features

* **pass-style:** feature flag: only well-formed strings are passable ([#2002](https://github.com/endojs/endo/issues/2002)) ([bca1e3f](https://github.com/endojs/endo/commit/bca1e3f92d4a37f1b9927c7e6045968beb925964))
* **ses-ava:** import test from @endo/ses-ava/prepare-endo.js ([#2133](https://github.com/endojs/endo/issues/2133)) ([9d3a7ce](https://github.com/endojs/endo/commit/9d3a7ce150b6fd6fe7c8c4cc43da411e981731ac))



## [1.2.0](https://github.com/endojs/endo/compare/@endo/pass-style@1.1.1...@endo/pass-style@1.2.0) (2024-02-23)


### Features

* **ses:** permit Promise.any, AggregateError ([6a8c4d8](https://github.com/endojs/endo/commit/6a8c4d8795c991cdaf542d5dcb691aae4e989d79))


### Bug Fixes

* **ses,pass-style,marshal:** tolerate platforms prior to AggregateError ([5762dd4](https://github.com/endojs/endo/commit/5762dd48e814e2e8435f666019e527d982eddbbd))



### [1.1.1](https://github.com/endojs/endo/compare/@endo/pass-style@1.1.0...@endo/pass-style@1.1.1) (2024-02-15)


### Bug Fixes

* Add repository directory to all package descriptors ([e5f36e7](https://github.com/endojs/endo/commit/e5f36e7a321c13ee25e74eb74d2a5f3d7517119c))



## [1.1.0](https://github.com/endojs/endo/compare/@endo/pass-style@1.0.1...@endo/pass-style@1.1.0) (2024-01-18)


### Features

* **eventual-send:** breakpoint on delivery by env-options ([#1860](https://github.com/endojs/endo/issues/1860)) ([b191aaf](https://github.com/endojs/endo/commit/b191aaf3d8b9015801d3f6793f0dd21995aba48e))
* **types:** generic Passable ([ae6ad15](https://github.com/endojs/endo/commit/ae6ad156e43fafb11df394f901df372760f9cbcc))



### [1.0.1](https://github.com/endojs/endo/compare/@endo/pass-style@1.0.0...@endo/pass-style@1.0.1) (2023-12-20)

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



### [0.1.7](https://github.com/endojs/endo/compare/@endo/pass-style@0.1.6...@endo/pass-style@0.1.7) (2023-09-12)


### Bug Fixes

* **pass-style:** passable error validation ([df67cb0](https://github.com/endojs/endo/commit/df67cb064e49d40274d733c9e286c0adcb88d577))



### [0.1.6](https://github.com/endojs/endo/compare/@endo/pass-style@0.1.4...@endo/pass-style@0.1.6) (2023-08-07)

**Note:** Version bump only for package @endo/pass-style





### [0.1.5](https://github.com/endojs/endo/compare/@endo/pass-style@0.1.4...@endo/pass-style@0.1.5) (2023-08-07)

**Note:** Version bump only for package @endo/pass-style





### [0.1.4](https://github.com/endojs/endo/compare/@endo/pass-style@0.1.3...@endo/pass-style@0.1.4) (2023-07-19)


### Bug Fixes

* warning free lint ([a20ee00](https://github.com/endojs/endo/commit/a20ee00d2b378b710d758b2c7c7b65498276ae59))



### [0.1.3](https://github.com/endojs/endo/compare/@endo/pass-style@0.1.2...@endo/pass-style@0.1.3) (2023-04-20)

### Bug Fixes

- **pass-style:** correct types ([4bf9cec](https://github.com/endojs/endo/commit/4bf9cecfb79db11274fdf6a0708ad3f3205cc245))

### [0.1.2](https://github.com/endojs/endo/compare/@endo/pass-style@0.1.1...@endo/pass-style@0.1.2) (2023-04-14)

### Features

- **pass-style,exo:** label remotable instances ([56edc68](https://github.com/endojs/endo/commit/56edc68444ac3e0d94d43028bc7d53fe804bb332))
- **ses:** option to fake harden unsafely ([697bf58](https://github.com/endojs/endo/commit/697bf5855e4a6578db4cbca40bfeca253a6a2cfe))

### Bug Fixes

- sort type confusion between `pass-style` and `marshal` ([db09e13](https://github.com/endojs/endo/commit/db09e13463806b4524951cd694272243958a7182))

### 0.1.1 (2023-03-07)

### Features

- **pass-style:** Extract passStyleOf and friends from marshal into the new pass-style package ([#1439](https://github.com/endojs/endo/issues/1439)) ([ccd003c](https://github.com/endojs/endo/commit/ccd003c96f3d969d919104118d8a34b3c1126aef))

### Bug Fixes

- Fix hackerone.com links in SECURITY.md ([#1472](https://github.com/endojs/endo/issues/1472)) ([389733d](https://github.com/endojs/endo/commit/389733dbc7a74992f909c38d27ea7e8e68623959))
- move arb-passable to pass-style ([#1448](https://github.com/endojs/endo/issues/1448)) ([09235a9](https://github.com/endojs/endo/commit/09235a9a339229636fb37b4483ccddbe3b60d5ee))

### 0.1.1 (2023-03-07)

### Features

- **pass-style:** Extract passStyleOf and friends from marshal into the new pass-style package ([#1439](https://github.com/endojs/endo/issues/1439)) ([ccd003c](https://github.com/endojs/endo/commit/ccd003c96f3d969d919104118d8a34b3c1126aef))

### Bug Fixes

- Fix hackerone.com links in SECURITY.md ([#1472](https://github.com/endojs/endo/issues/1472)) ([389733d](https://github.com/endojs/endo/commit/389733dbc7a74992f909c38d27ea7e8e68623959))
- move arb-passable to pass-style ([#1448](https://github.com/endojs/endo/issues/1448)) ([09235a9](https://github.com/endojs/endo/commit/09235a9a339229636fb37b4483ccddbe3b60d5ee))
