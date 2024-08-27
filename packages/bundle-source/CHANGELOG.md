# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [3.4.0](https://github.com/endojs/endo/compare/@endo/bundle-source@3.3.0...@endo/bundle-source@3.4.0) (2024-08-27)


### Features

* **bundle-source:** --elide-comments ([0a59732](https://github.com/endojs/endo/commit/0a597328ce779ce95ab8d1675cdd84e4ece955f8))



## [3.3.0](https://github.com/endojs/endo/compare/@endo/bundle-source@3.2.3...@endo/bundle-source@3.3.0) (2024-07-30)


### Features

* **bundle-source:** Add `tag` command-line flag ([ba1f346](https://github.com/endojs/endo/commit/ba1f346513d0302c1e114925ed4abeb9d31d4afb))
* **bundle-source:** Add a no-cache mode for bundling to stdout ([25401c2](https://github.com/endojs/endo/commit/25401c232348aca94be0421940c9551365de0fc7))
* **bundle-source:** Entrain devDependencies with development condition ([308307e](https://github.com/endojs/endo/commit/308307e1b1b940d77f770daea5aa4b10e595a667))
* **bundle-source:** New endoScript format to obviate Rollup ([583c7e3](https://github.com/endojs/endo/commit/583c7e3ae4e12948a788f41f0c49aa2ff8e19584))
* **bundle-source:** Support JSON modules in nested evaluate and get export bundle formats ([33df698](https://github.com/endojs/endo/commit/33df6983cdd4331d5ade8ddc90e258557cb8b7d7))
* **bundle-source:** Zip original sources with --no-transforms ([2af54c3](https://github.com/endojs/endo/commit/2af54c36c0a62ee108dc691c3f09e928337bc0d3))
* **bundle-support:** CLI support for other formats ([80252b2](https://github.com/endojs/endo/commit/80252b26279181f20c88f1993feb4264f3fbb221))


### Bug Fixes

* **bundle-source:** Mention --no-transforms in bundle-source usage ([5da60c8](https://github.com/endojs/endo/commit/5da60c806b85264582ba5943fd1c0792b2a9f32b))
* **bundle-source:** Recognize default metadata ([5ee3a9b](https://github.com/endojs/endo/commit/5ee3a9b875d568f2045ae871dc6c2ad1ddd0c617))


### Performance Improvements

* **bundle-source:** Allow imports to run parallel ([f3afe94](https://github.com/endojs/endo/commit/f3afe942f1530ce0476ff83b82a62cfe04446df4))



### [3.2.3](https://github.com/endojs/endo/compare/@endo/bundle-source@3.2.2...@endo/bundle-source@3.2.3) (2024-05-07)

**Note:** Version bump only for package @endo/bundle-source





### [3.2.2](https://github.com/endojs/endo/compare/@endo/bundle-source@3.2.1...@endo/bundle-source@3.2.2) (2024-04-04)

**Note:** Version bump only for package @endo/bundle-source





## [3.2.0](https://github.com/endojs/endo/compare/@endo/bundle-source@3.1.0...@endo/bundle-source@3.2.0) (2024-03-20)


### Features

* **ses-ava:** import test from @endo/ses-ava/prepare-endo.js ([#2133](https://github.com/endojs/endo/issues/2133)) ([9d3a7ce](https://github.com/endojs/endo/commit/9d3a7ce150b6fd6fe7c8c4cc43da411e981731ac))


### Bug Fixes

* **bundle-source:** cacheSourceMaps option is optional ([c180049](https://github.com/endojs/endo/commit/c1800491ea20b34c2f073b371f4941c247db7de6))
* **bundle-source:** Export types properly ([50518da](https://github.com/endojs/endo/commit/50518dafc9e875277161827ae6d74fd627b6acf8))
* **bundle-source:** Revert breaking export types change ([58e82f0](https://github.com/endojs/endo/commit/58e82f09373464ddcc28dc060813628e7ea5c9d5))



## [3.1.0](https://github.com/endojs/endo/compare/@endo/bundle-source@3.0.3...@endo/bundle-source@3.1.0) (2024-02-23)


### Features

* endo bundle command supports specifying commonDeps ([d570060](https://github.com/endojs/endo/commit/d570060fd07bb5f01af478fb9b452671d0479a4d))



### [3.0.3](https://github.com/endojs/endo/compare/@endo/bundle-source@3.0.2...@endo/bundle-source@3.0.3) (2024-02-15)


### Bug Fixes

* Add repository directory to all package descriptors ([e5f36e7](https://github.com/endojs/endo/commit/e5f36e7a321c13ee25e74eb74d2a5f3d7517119c))
* **bundle-source:** apply eval evasion for cjs modules too ([5b159cb](https://github.com/endojs/endo/commit/5b159cb8b572ef739529638cfb38c167977df222))



### [3.0.2](https://github.com/endojs/endo/compare/@endo/bundle-source@3.0.1...@endo/bundle-source@3.0.2) (2024-01-18)


### Bug Fixes

* **bundle-source:** Accommodate Windows lack of atomic rename ([48135aa](https://github.com/endojs/endo/commit/48135aa7c2f39b1659afbca334ea26cbe7364596))
* realpathSync usage ([cebcf09](https://github.com/endojs/endo/commit/cebcf09ba70bebdf5bb26176f76cb21d130ea20a))



### [3.0.1](https://github.com/endojs/endo/compare/@endo/bundle-source@3.0.0...@endo/bundle-source@3.0.1) (2023-12-20)


### Bug Fixes

* **bundle-source:** Avoid ?? operator for RESM ([3355c04](https://github.com/endojs/endo/commit/3355c044dbf461ad52045c0b380917726f954aa7))
* **bundle-source:** Remove broken jessie linting for now ([74cfc5b](https://github.com/endojs/endo/commit/74cfc5b51e48edc144f6665eddfbd2b0e6145e56))



## [3.0.0](https://github.com/endojs/endo/compare/@endo/bundle-source@2.8.0...@endo/bundle-source@3.0.0) (2023-12-12)


### Bug Fixes

* Adjust type generation in release process and CI ([9465be3](https://github.com/endojs/endo/commit/9465be369e53167815ca444f6293a8e9eb48501d))



## [2.8.0](https://github.com/endojs/endo/compare/@endo/bundle-source@2.7.0...@endo/bundle-source@2.8.0) (2023-09-12)


### Features

* **bundle-source:** Cache sensitive to size ([40aaa36](https://github.com/endojs/endo/commit/40aaa36cc9d2120ec97a5427810e04ad2018f3a6))
* **bundle-source:** DEBUG=bundle-source ([7c81772](https://github.com/endojs/endo/commit/7c8177293b2914cc02d7663054c9eb274f6a526a))
* **bundle-source:** Synchronize fs ([16a27ed](https://github.com/endojs/endo/commit/16a27ed1b16211ab48d87c28b410f1351aab555d))


### Bug Fixes

* **bundle-source:** Add a nonce to cache scratch file names ([d7ee2a8](https://github.com/endojs/endo/commit/d7ee2a80e6dbe82daf98a4f04018d57fad76ef91))
* **bundle-source:** Backward-compatibility for cache pid argument ([08fb499](https://github.com/endojs/endo/commit/08fb4990de9db0ba9e05d31247e735115f279085))
* **bundle-source:** more typing and export refinements ([7499cfe](https://github.com/endojs/endo/commit/7499cfef7914cc87ec1f0b906c1355f80868e2c0))
* **bundle-source:** prevent `BundleMeta` typing from failing ([8998897](https://github.com/endojs/endo/commit/8998897ab496c3b6e1a5f385a2ea8df440c4796f))
* **bundle-source:** prevent cache read race ([2d4fbab](https://github.com/endojs/endo/commit/2d4fbab1880e23c2b88751db1acca02a7370ea44))
* **bundle-source:** Reduce test concurrency for CI ([62998df](https://github.com/endojs/endo/commit/62998df29f070f4e8b72aaeec9fb05cc4436a0cb))
* **bundle-source:** restore API compatibility ([4fe20b7](https://github.com/endojs/endo/commit/4fe20b75537a1064a67a960ba6b82be2b4578fe1))
* **bundle-source:** Sensitivity to any mtime change ([636b569](https://github.com/endojs/endo/commit/636b569d216eecc1679367afae118c99fefe55fb))



## [2.7.0](https://github.com/endojs/endo/compare/@endo/bundle-source@2.5.2...@endo/bundle-source@2.7.0) (2023-08-07)


### Features

* **bundle-source:** Generate a per-user source map cache ([c0b3c5e](https://github.com/endojs/endo/commit/c0b3c5ecf26fd8b9338f6788283616938ba8e9f0))


### Bug Fixes

* **bundle-source:** type `bundleSource` more comprehensively ([2e546d2](https://github.com/endojs/endo/commit/2e546d2569f5ad45910c4508a93c74b076963bca))



## [2.6.0](https://github.com/endojs/endo/compare/@endo/bundle-source@2.5.2...@endo/bundle-source@2.6.0) (2023-08-07)


### Features

* **bundle-source:** Generate a per-user source map cache ([c0b3c5e](https://github.com/endojs/endo/commit/c0b3c5ecf26fd8b9338f6788283616938ba8e9f0))


### Bug Fixes

* **bundle-source:** type `bundleSource` more comprehensively ([2e546d2](https://github.com/endojs/endo/commit/2e546d2569f5ad45910c4508a93c74b076963bca))



### [2.5.2](https://github.com/endojs/endo/compare/@endo/bundle-source@2.5.1...@endo/bundle-source@2.5.2) (2023-07-19)

**Note:** Version bump only for package @endo/bundle-source





### [2.5.1](https://github.com/endojs/endo/compare/@endo/bundle-source@2.5.0...@endo/bundle-source@2.5.1) (2023-04-20)

**Note:** Version bump only for package @endo/bundle-source

## [2.5.0](https://github.com/endojs/endo/compare/@endo/bundle-source@2.4.4...@endo/bundle-source@2.5.0) (2023-04-14)

### Features

- **bundle-source:** separate entrypoint from `cache.js` library ([0973f34](https://github.com/endojs/endo/commit/0973f34648a1b06894f6ddac58ab4d43d4cfbc9e))

### [2.4.4](https://github.com/endojs/endo/compare/@endo/bundle-source@2.4.3...@endo/bundle-source@2.4.4) (2023-03-07)

### Bug Fixes

- **bundle-source:** exit with error code on cli failure ([#1479](https://github.com/endojs/endo/issues/1479)) ([1f97e54](https://github.com/endojs/endo/commit/1f97e54e9aafdf349caec2a9732b2a4befa333f0))
- Fix hackerone.com links in SECURITY.md ([#1472](https://github.com/endojs/endo/issues/1472)) ([389733d](https://github.com/endojs/endo/commit/389733dbc7a74992f909c38d27ea7e8e68623959))
- Improve typing information ([765d262](https://github.com/endojs/endo/commit/765d2625ee278608494f7e998bcd3a3ee8b845a4))

### [2.4.3](https://github.com/endojs/endo/compare/@endo/bundle-source@2.4.2...@endo/bundle-source@2.4.3) (2022-12-23)

**Note:** Version bump only for package @endo/bundle-source

### [2.4.2](https://github.com/endojs/endo/compare/@endo/bundle-source@2.4.1...@endo/bundle-source@2.4.2) (2022-11-14)

**Note:** Version bump only for package @endo/bundle-source

### [2.4.1](https://github.com/endojs/endo/compare/@endo/bundle-source@2.4.0...@endo/bundle-source@2.4.1) (2022-10-24)

**Note:** Version bump only for package @endo/bundle-source

## [2.4.0](https://github.com/endojs/endo/compare/@endo/bundle-source@2.3.1...@endo/bundle-source@2.4.0) (2022-10-19)

### Features

- **bundle-source:** make nestedEvaluate API compatible with getExport ([ec279a4](https://github.com/endojs/endo/commit/ec279a4dd7275f12c7a448d120e8fdf743061f89))

### Bug Fixes

- **bundle-source:** strip longest common prefix from bundle names ([51d30d8](https://github.com/endojs/endo/commit/51d30d8e5b8455e0e9d689596255fed56113f900))

### [2.3.1](https://github.com/endojs/endo/compare/@endo/bundle-source@2.3.0...@endo/bundle-source@2.3.1) (2022-09-27)

**Note:** Version bump only for package @endo/bundle-source

## [2.3.0](https://github.com/endojs/endo/compare/@endo/bundle-source@2.2.6...@endo/bundle-source@2.3.0) (2022-09-14)

### Features

- **bundle-source:** Add JSON cache mode ([b73a7b8](https://github.com/endojs/endo/commit/b73a7b8f921818866bb2bf0b982fb93fefaa1860))

### Bug Fixes

- **bundle-source:** Remove redundant init devDependency ([1ef867c](https://github.com/endojs/endo/commit/1ef867cf277aeb6b6d40c196a0e362e08cce1b6c))

### [2.2.6](https://github.com/endojs/endo/compare/@endo/bundle-source@2.2.5...@endo/bundle-source@2.2.6) (2022-08-26)

**Note:** Version bump only for package @endo/bundle-source

### [2.2.5](https://github.com/endojs/endo/compare/@endo/bundle-source@2.2.4...@endo/bundle-source@2.2.5) (2022-08-26)

**Note:** Version bump only for package @endo/bundle-source

### [2.2.4](https://github.com/endojs/endo/compare/@endo/bundle-source@2.2.3...@endo/bundle-source@2.2.4) (2022-08-25)

**Note:** Version bump only for package @endo/bundle-source

### [2.2.3](https://github.com/endojs/endo/compare/@endo/bundle-source@2.2.2...@endo/bundle-source@2.2.3) (2022-08-23)

**Note:** Version bump only for package @endo/bundle-source

### [2.2.2](https://github.com/endojs/endo/compare/@endo/bundle-source@2.2.1...@endo/bundle-source@2.2.2) (2022-06-28)

**Note:** Version bump only for package @endo/bundle-source

### [2.2.1](https://github.com/endojs/endo/compare/@endo/bundle-source@2.2.0...@endo/bundle-source@2.2.1) (2022-06-11)

**Note:** Version bump only for package @endo/bundle-source

## [2.2.0](https://github.com/endojs/endo/compare/@endo/bundle-source@2.1.4...@endo/bundle-source@2.2.0) (2022-04-15)

### Features

- **bundle-source:** CLI tool with caching ([#1160](https://github.com/endojs/endo/issues/1160)) ([05fdfb5](https://github.com/endojs/endo/commit/05fdfb50861e747df9e40d71382b31ce78c48e72))

### Bug Fixes

- **bundle-source:** Limit public API to intentionally exported modules ([eabb877](https://github.com/endojs/endo/commit/eabb8771eb9309f19dbd7644ef795b85055abe81))

### [2.1.4](https://github.com/endojs/endo/compare/@endo/bundle-source@2.1.3...@endo/bundle-source@2.1.4) (2022-04-14)

### Bug Fixes

- **bundle-source:** Use a github reference instead of a bundled tarball for rollup patch ([1bf0c18](https://github.com/endojs/endo/commit/1bf0c187e04bfe015850a91d51a33074aeebfde4))

### [2.1.3](https://github.com/endojs/endo/compare/@endo/bundle-source@2.1.2...@endo/bundle-source@2.1.3) (2022-04-13)

### Bug Fixes

- Revert dud release ([c8a7101](https://github.com/endojs/endo/commit/c8a71017d8d7af10a97909c9da9c5c7e59aed939))

### [2.1.2](https://github.com/endojs/endo/compare/@endo/bundle-source@2.1.1...@endo/bundle-source@2.1.2) (2022-04-12)

**Note:** Version bump only for package @endo/bundle-source

### [2.1.1](https://github.com/endojs/endo/compare/@endo/bundle-source@2.1.0...@endo/bundle-source@2.1.1) (2022-03-07)

**Note:** Version bump only for package @endo/bundle-source

## [2.1.0](https://github.com/endojs/endo/compare/@endo/bundle-source@2.0.7...@endo/bundle-source@2.1.0) (2022-03-02)

### Features

- **bundle-source:** Add hash to Endo Zip Base64 bundle format ([b582931](https://github.com/endojs/endo/commit/b5829313daeaf1e910a9804e13acb3f1b413b4a6))
- **bundle-source:** use newer babel with Agoric fixes ([e68f794](https://github.com/endojs/endo/commit/e68f794a182182d8e64bce2829dd90b4d9e4d947))

### Bug Fixes

- **bundle-source:** c8 is a devDependency ([165ca62](https://github.com/endojs/endo/commit/165ca62738be5aff511a75347f68c5bcd923b908))
- **bundle-source:** Remove change detector test ([c687592](https://github.com/endojs/endo/commit/c687592bd9c04a0dda550adaa3c06a351b62b0d2))
- **bundle-source:** Upgrade babel-generator ([9feef03](https://github.com/endojs/endo/commit/9feef0372c6424870f86a7a14742eadb8aa57c53))

### [2.0.7](https://github.com/endojs/endo/compare/@endo/bundle-source@2.0.6...@endo/bundle-source@2.0.7) (2022-02-20)

**Note:** Version bump only for package @endo/bundle-source

### [2.0.6](https://github.com/endojs/endo/compare/@endo/bundle-source@2.0.5...@endo/bundle-source@2.0.6) (2022-02-18)

### Bug Fixes

- adds some missing hardens ([#1077](https://github.com/endojs/endo/issues/1077)) ([1b6d8fd](https://github.com/endojs/endo/commit/1b6d8fdb2ca24f95b4c972ed26446044158c2572))
- **bundle-source:** Add jsconfig for TypeScript ([952c415](https://github.com/endojs/endo/commit/952c4151b72d34ca274001d21f8234dd79be1b34))

### [2.0.5](https://github.com/endojs/endo/compare/@endo/bundle-source@2.0.4...@endo/bundle-source@2.0.5) (2022-01-31)

**Note:** Version bump only for package @endo/bundle-source

### [2.0.4](https://github.com/endojs/endo/compare/@endo/bundle-source@2.0.3...@endo/bundle-source@2.0.4) (2022-01-27)

### Bug Fixes

- Publish all materials consistently ([#1021](https://github.com/endojs/endo/issues/1021)) ([a2c74d9](https://github.com/endojs/endo/commit/a2c74d9de68a325761d62e1b2187a117ef884571))

### [2.0.3](https://github.com/endojs/endo/compare/@endo/bundle-source@2.0.2...@endo/bundle-source@2.0.3) (2022-01-25)

**Note:** Version bump only for package @endo/bundle-source

### 2.0.2 (2022-01-23)

### Bug Fixes

- **bundle-source:** Support Node.js 12 ([5f64d07](https://github.com/endojs/endo/commit/5f64d07dcfdcab6d1b599047b297c759b85466ea))
- **bundle-source:** Windows support for tests ([59f3fc1](https://github.com/endojs/endo/commit/59f3fc11f9a0d959f172469caffb86c4749c2fbe))

### [2.0.1](https://github.com/Agoric/agoric-sdk/compare/@agoric/bundle-source@2.0.0...@agoric/bundle-source@2.0.1) (2021-12-02)

### Bug Fixes

- **deps:** remove explicit `@agoric/babel-standalone` ([4f22453](https://github.com/Agoric/agoric-sdk/commit/4f22453a6f2de1a2c27ae8ad0d11b13116890dab))

## [2.0.0](https://github.com/Agoric/agoric-sdk/compare/@agoric/bundle-source@1.4.11...@agoric/bundle-source@2.0.0) (2021-10-13)

### ⚠ BREAKING CHANGES

- Switch default bundle type to endoZipBase64

### Code Refactoring

- Switch default bundle type to endoZipBase64 ([53cc1e5](https://github.com/Agoric/agoric-sdk/commit/53cc1e5a5af9861e96cff3b841e4269db8a302c0)), closes [#3859](https://github.com/Agoric/agoric-sdk/issues/3859)

### [1.4.11](https://github.com/Agoric/agoric-sdk/compare/@agoric/bundle-source@1.4.10...@agoric/bundle-source@1.4.11) (2021-09-23)

**Note:** Version bump only for package @agoric/bundle-source

### [1.4.10](https://github.com/Agoric/agoric-sdk/compare/@agoric/bundle-source@1.4.9...@agoric/bundle-source@1.4.10) (2021-09-15)

**Note:** Version bump only for package @agoric/bundle-source

### [1.4.9](https://github.com/Agoric/agoric-sdk/compare/@agoric/bundle-source@1.4.8...@agoric/bundle-source@1.4.9) (2021-08-18)

**Note:** Version bump only for package @agoric/bundle-source

### [1.4.8](https://github.com/Agoric/agoric-sdk/compare/@agoric/bundle-source@1.4.7...@agoric/bundle-source@1.4.8) (2021-08-17)

**Note:** Version bump only for package @agoric/bundle-source

### [1.4.7](https://github.com/Agoric/agoric-sdk/compare/@agoric/bundle-source@1.4.4...@agoric/bundle-source@1.4.7) (2021-08-15)

### 0.26.10 (2021-07-28)

### Bug Fixes

- **bundle-source:** Remove lingering package scaffold file ([e49edee](https://github.com/Agoric/agoric-sdk/commit/e49edee2d0e499e1710de2ac03ff59876e8252a9))

### [1.4.6](https://github.com/Agoric/agoric-sdk/compare/@agoric/bundle-source@1.4.4...@agoric/bundle-source@1.4.6) (2021-08-14)

### 0.26.10 (2021-07-28)

### Bug Fixes

- **bundle-source:** Remove lingering package scaffold file ([e49edee](https://github.com/Agoric/agoric-sdk/commit/e49edee2d0e499e1710de2ac03ff59876e8252a9))

### [1.4.5](https://github.com/Agoric/agoric-sdk/compare/@agoric/bundle-source@1.4.4...@agoric/bundle-source@1.4.5) (2021-07-28)

### Bug Fixes

- **bundle-source:** Remove lingering package scaffold file ([e49edee](https://github.com/Agoric/agoric-sdk/commit/e49edee2d0e499e1710de2ac03ff59876e8252a9))

### [1.4.4](https://github.com/Agoric/agoric-sdk/compare/@agoric/bundle-source@1.4.3...@agoric/bundle-source@1.4.4) (2021-07-01)

**Note:** Version bump only for package @agoric/bundle-source

### [1.4.3](https://github.com/Agoric/agoric-sdk/compare/@agoric/bundle-source@1.4.2...@agoric/bundle-source@1.4.3) (2021-06-28)

**Note:** Version bump only for package @agoric/bundle-source

### [1.4.2](https://github.com/Agoric/agoric-sdk/compare/@agoric/bundle-source@1.4.1...@agoric/bundle-source@1.4.2) (2021-06-25)

**Note:** Version bump only for package @agoric/bundle-source

### [1.4.1](https://github.com/Agoric/agoric-sdk/compare/@agoric/bundle-source@1.4.0...@agoric/bundle-source@1.4.1) (2021-06-24)

**Note:** Version bump only for package @agoric/bundle-source

## [1.4.0](https://github.com/Agoric/agoric-sdk/compare/@agoric/bundle-source@1.3.9...@agoric/bundle-source@1.4.0) (2021-06-23)

### Features

- **bundle-source:** Add dev mode option ([866b98a](https://github.com/Agoric/agoric-sdk/commit/866b98a5c3667a66700d6023a7765ac6d7edcda7))
- **bundle-source:** Endo support for following symlinks ([43dea96](https://github.com/Agoric/agoric-sdk/commit/43dea963a558f367a142fc103abc8fb11aac4482))

### [1.3.9](https://github.com/Agoric/agoric-sdk/compare/@agoric/bundle-source@1.3.8...@agoric/bundle-source@1.3.9) (2021-06-16)

**Note:** Version bump only for package @agoric/bundle-source

### [1.3.8](https://github.com/Agoric/agoric-sdk/compare/@agoric/bundle-source@1.3.7...@agoric/bundle-source@1.3.8) (2021-06-15)

### Bug Fixes

- Pin ESM to forked version ([54dbb55](https://github.com/Agoric/agoric-sdk/commit/54dbb55d64d7ff7adb395bc4bd9d1461dd2d3c17))
- Preinitialize Babel ([bb76808](https://github.com/Agoric/agoric-sdk/commit/bb768089c3588e54612d7c9a4528972b5688f4e6))
- remove references to @agoric/babel-parser ([e4b1e2b](https://github.com/Agoric/agoric-sdk/commit/e4b1e2b4bb13436ef53f055136a4a1d5d933d99e))
- solve nondeterminism in rollup2 output order ([c72b52d](https://github.com/Agoric/agoric-sdk/commit/c72b52d69d5ca4609ce648f24c9d30f66b200374))
- upgrade acorn and babel parser ([048cc92](https://github.com/Agoric/agoric-sdk/commit/048cc925b3090f77e998fef1f3ac26846c4a8f26))

## [1.3.7](https://github.com/Agoric/agoric-sdk/compare/@agoric/bundle-source@1.3.6...@agoric/bundle-source@1.3.7) (2021-05-10)

**Note:** Version bump only for package @agoric/bundle-source

## [1.3.6](https://github.com/Agoric/agoric-sdk/compare/@agoric/bundle-source@1.3.5...@agoric/bundle-source@1.3.6) (2021-05-05)

**Note:** Version bump only for package @agoric/bundle-source

## [1.3.5](https://github.com/Agoric/agoric-sdk/compare/@agoric/bundle-source@1.3.4...@agoric/bundle-source@1.3.5) (2021-05-05)

**Note:** Version bump only for package @agoric/bundle-source

## [1.3.4](https://github.com/Agoric/agoric-sdk/compare/@agoric/bundle-source@1.3.3...@agoric/bundle-source@1.3.4) (2021-04-22)

**Note:** Version bump only for package @agoric/bundle-source

## [1.3.3](https://github.com/Agoric/agoric-sdk/compare/@agoric/bundle-source@1.3.2...@agoric/bundle-source@1.3.3) (2021-04-18)

**Note:** Version bump only for package @agoric/bundle-source

## [1.3.2](https://github.com/Agoric/agoric-sdk/compare/@agoric/bundle-source@1.3.1...@agoric/bundle-source@1.3.2) (2021-04-16)

**Note:** Version bump only for package @agoric/bundle-source

## [1.3.1](https://github.com/Agoric/agoric-sdk/compare/@agoric/bundle-source@1.3.0...@agoric/bundle-source@1.3.1) (2021-04-07)

**Note:** Version bump only for package @agoric/bundle-source

# [1.3.0](https://github.com/Agoric/agoric-sdk/compare/@agoric/bundle-source@1.2.4...@agoric/bundle-source@1.3.0) (2021-04-06)

### Features

- **bundle-source:** Apply evasive transforms to Endo archives ([#2768](https://github.com/Agoric/agoric-sdk/issues/2768)) ([e15cee8](https://github.com/Agoric/agoric-sdk/commit/e15cee88cf1f74e2debd4426dbc22a99b88fb1d6))
- **bundle-source:** Specific ModuleFormat type ([#2767](https://github.com/Agoric/agoric-sdk/issues/2767)) ([6fe2ff7](https://github.com/Agoric/agoric-sdk/commit/6fe2ff7d535ef5749f4e9bf7056b5e7dab897a61))

## [1.2.4](https://github.com/Agoric/agoric-sdk/compare/@agoric/bundle-source@1.2.3...@agoric/bundle-source@1.2.4) (2021-03-24)

**Note:** Version bump only for package @agoric/bundle-source

## [1.2.3](https://github.com/Agoric/agoric-sdk/compare/@agoric/bundle-source@1.2.2...@agoric/bundle-source@1.2.3) (2021-03-16)

### Bug Fixes

- make separate 'test:xs' target, remove XS from 'test' target ([b9c1a69](https://github.com/Agoric/agoric-sdk/commit/b9c1a6987093fc8e09e8aba7acd2a1618413bac8)), closes [#2647](https://github.com/Agoric/agoric-sdk/issues/2647)
- upgrade ses to 0.12.3 to avoid console noise ([#2552](https://github.com/Agoric/agoric-sdk/issues/2552)) ([f59f5f5](https://github.com/Agoric/agoric-sdk/commit/f59f5f58d1567bb11710166b1dbc80f25c39a04f))

## [1.2.2](https://github.com/Agoric/agoric-sdk/compare/@agoric/bundle-source@1.2.1...@agoric/bundle-source@1.2.2) (2021-02-22)

### Bug Fixes

- **bundle-source:** Downgrade @rollup/plugin-commonjs for Windows ([2721da7](https://github.com/Agoric/agoric-sdk/commit/2721da770aad3077f1024b71c217883f31461641))

## [1.2.1](https://github.com/Agoric/agoric-sdk/compare/@agoric/bundle-source@1.2.0...@agoric/bundle-source@1.2.1) (2021-02-16)

### Bug Fixes

- explicit setting in test-sanity ([#2388](https://github.com/Agoric/agoric-sdk/issues/2388)) ([6be4e02](https://github.com/Agoric/agoric-sdk/commit/6be4e0212d19a542ead6cd4bcef4cb6688a9d7d3))
- take advantage of `/.../` being stripped from stack traces ([7acacc0](https://github.com/Agoric/agoric-sdk/commit/7acacc0d6ac06c37065ce984cc9147c945c572e5))

# [1.2.0](https://github.com/Agoric/agoric-sdk/compare/@agoric/bundle-source@1.1.10...@agoric/bundle-source@1.2.0) (2020-12-10)

### Features

- **import-bundle:** Preliminary support Endo zip hex bundle format ([#1983](https://github.com/Agoric/agoric-sdk/issues/1983)) ([983681b](https://github.com/Agoric/agoric-sdk/commit/983681bfc4bf512b6bd90806ed9220cd4fefc13c))

## [1.1.10](https://github.com/Agoric/agoric-sdk/compare/@agoric/bundle-source@1.1.10-dev.0...@agoric/bundle-source@1.1.10) (2020-11-07)

**Note:** Version bump only for package @agoric/bundle-source

## [1.1.10-dev.0](https://github.com/Agoric/agoric-sdk/compare/@agoric/bundle-source@1.1.9...@agoric/bundle-source@1.1.10-dev.0) (2020-10-19)

**Note:** Version bump only for package @agoric/bundle-source

## [1.1.9](https://github.com/Agoric/agoric-sdk/compare/@agoric/bundle-source@1.1.9-dev.2...@agoric/bundle-source@1.1.9) (2020-10-11)

**Note:** Version bump only for package @agoric/bundle-source

## [1.1.9-dev.2](https://github.com/Agoric/agoric-sdk/compare/@agoric/bundle-source@1.1.9-dev.1...@agoric/bundle-source@1.1.9-dev.2) (2020-09-18)

**Note:** Version bump only for package @agoric/bundle-source

## [1.1.9-dev.1](https://github.com/Agoric/agoric-sdk/compare/@agoric/bundle-source@1.1.9-dev.0...@agoric/bundle-source@1.1.9-dev.1) (2020-09-18)

**Note:** Version bump only for package @agoric/bundle-source

## [1.1.9-dev.0](https://github.com/Agoric/agoric-sdk/compare/@agoric/bundle-source@1.1.8...@agoric/bundle-source@1.1.9-dev.0) (2020-09-18)

**Note:** Version bump only for package @agoric/bundle-source

## [1.1.8](https://github.com/Agoric/agoric-sdk/compare/@agoric/bundle-source@1.1.7...@agoric/bundle-source@1.1.8) (2020-09-16)

**Note:** Version bump only for package @agoric/bundle-source

## [1.1.7](https://github.com/Agoric/agoric-sdk/compare/@agoric/bundle-source@1.1.6...@agoric/bundle-source@1.1.7) (2020-08-31)

### Bug Fixes

- **bundle-source:** fix comment misparse, make require optional ([e8f4127](https://github.com/Agoric/agoric-sdk/commit/e8f412767c5ad8a0e75aa29357a052fd2164e811)), closes [#1281](https://github.com/Agoric/agoric-sdk/issues/1281) [#362](https://github.com/Agoric/agoric-sdk/issues/362)
- get line numbers to be proper again ([8c31701](https://github.com/Agoric/agoric-sdk/commit/8c31701a6b4353e549b7e8891114a41ee48457c8))
- use Babel to strip comments and unmap line numbers ([24edbbc](https://github.com/Agoric/agoric-sdk/commit/24edbbc985500233ea876817228bbccc71b2bac3))
- use only loc.start to ensure nodes begin on the correct line ([dc3bc65](https://github.com/Agoric/agoric-sdk/commit/dc3bc658cc2900a1f074c8d23fd3e5bae9773e18))

## [1.1.6](https://github.com/Agoric/agoric-sdk/compare/@agoric/bundle-source@1.1.5...@agoric/bundle-source@1.1.6) (2020-06-30)

### Bug Fixes

- **bundle-source:** tests use install-ses ([f793424](https://github.com/Agoric/agoric-sdk/commit/f793424ea4314f5cf0fe61c6e49590b2d78e13c6))
- handle circular module references in nestedEvaluate ([9790320](https://github.com/Agoric/agoric-sdk/commit/97903204fa1bd2fd4fec339d7e27e234148ca126))

## [1.1.5](https://github.com/Agoric/agoric-sdk/compare/@agoric/bundle-source@1.1.4...@agoric/bundle-source@1.1.5) (2020-05-17)

### Bug Fixes

- make output from bundleSource correspond to source map lines ([c1ddd4a](https://github.com/Agoric/agoric-sdk/commit/c1ddd4a0a27de9561b3bd827213562d9741e61a8))
- remove many build steps ([6c7d3bb](https://github.com/Agoric/agoric-sdk/commit/6c7d3bb0c70277c22f8eda40525d7240141a5434))

## [1.1.4](https://github.com/Agoric/agoric-sdk/compare/@agoric/bundle-source@1.1.3...@agoric/bundle-source@1.1.4) (2020-05-10)

**Note:** Version bump only for package @agoric/bundle-source

## [1.1.3](https://github.com/Agoric/agoric-sdk/compare/@agoric/bundle-source@1.1.2...@agoric/bundle-source@1.1.3) (2020-05-04)

### Bug Fixes

- default to nestedEvaluate format for better debugging ([4502f39](https://github.com/Agoric/agoric-sdk/commit/4502f39a46096b6f02a3a251989060b3bce4c3b2))
- use the new (typed) harden package ([2eb1af0](https://github.com/Agoric/agoric-sdk/commit/2eb1af08fe3967629a3ce165752fd501a5c85a96))

## [1.1.2](https://github.com/Agoric/agoric-sdk/compare/@agoric/bundle-source@1.1.2-alpha.0...@agoric/bundle-source@1.1.2) (2020-04-13)

**Note:** Version bump only for package @agoric/bundle-source

## [1.1.2-alpha.0](https://github.com/Agoric/agoric-sdk/compare/@agoric/bundle-source@1.1.1...@agoric/bundle-source@1.1.2-alpha.0) (2020-04-12)

### Bug Fixes

- rewrite HTML comments and import expressions for SES's sake ([1a970f6](https://github.com/Agoric/agoric-sdk/commit/1a970f65b67e047711e53949a286f1587b9a2e75))

## [1.1.1](https://github.com/Agoric/agoric-sdk/compare/@agoric/bundle-source@1.1.1-alpha.0...@agoric/bundle-source@1.1.1) (2020-04-02)

**Note:** Version bump only for package @agoric/bundle-source

## [1.1.1-alpha.0](https://github.com/Agoric/agoric-sdk/compare/@agoric/bundle-source@1.1.0...@agoric/bundle-source@1.1.1-alpha.0) (2020-04-02)

**Note:** Version bump only for package @agoric/bundle-source

# 1.1.0 (2020-03-26)

### Bug Fixes

- make code clearer ([efc6b4a](https://github.com/Agoric/bundle-source/commit/efc6b4a369cc23813788f5626c61ec412e4e3f6a))
- remove 'Nat' from the set that SwingSet provides to kernel/vat code ([b4798d9](https://github.com/Agoric/bundle-source/commit/b4798d9e323c4cc16beca8c7f2547bce59334ae4))
- silence the builtin modules warning in agoric-cli deploy ([9043516](https://github.com/Agoric/bundle-source/commit/904351655f8acedd5720e5f0cc3ace83b5cf6192))
- **agoric-cli:** changes to make `agoric --sdk` basically work again ([#459](https://github.com/Agoric/bundle-source/issues/459)) ([1dc046a](https://github.com/Agoric/bundle-source/commit/1dc046a02d5e616d33f48954e307692b43008442))
- **bundle-source:** regain default 'getExport' ([f234d49](https://github.com/Agoric/bundle-source/commit/f234d49be14d50d13249d79f7302aa8e594e23d2))
- **bundle-source:** remove `"type": "module"` from package.json ([326b00a](https://github.com/Agoric/bundle-source/commit/326b00af1f01383df0b3cdf3dbb9f1c6d2273002)), closes [#219](https://github.com/Agoric/bundle-source/issues/219)

### Features

- **bundle-source:** make getExport evaluate separate modules ([bec9c66](https://github.com/Agoric/bundle-source/commit/bec9c661f9bf08ae676ba3ae3707c0e23599a58d))
