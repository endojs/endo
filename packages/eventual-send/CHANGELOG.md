# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

### [0.16.6](https://github.com/endojs/endo/compare/@endo/eventual-send@0.16.5...@endo/eventual-send@0.16.6) (2022-10-19)

**Note:** Version bump only for package @endo/eventual-send





### [0.16.5](https://github.com/endojs/endo/compare/@endo/eventual-send@0.16.4...@endo/eventual-send@0.16.5) (2022-09-27)

**Note:** Version bump only for package @endo/eventual-send





### [0.16.4](https://github.com/endojs/endo/compare/@endo/eventual-send@0.16.3...@endo/eventual-send@0.16.4) (2022-09-14)

**Note:** Version bump only for package @endo/eventual-send





### [0.16.3](https://github.com/endojs/endo/compare/@endo/eventual-send@0.16.2...@endo/eventual-send@0.16.3) (2022-08-26)


### Bug Fixes

* **eventual-send:** Remove lingering ?. operator ([51b38c2](https://github.com/endojs/endo/commit/51b38c2ba4d3e3c1a69ad4ccf1a343dadd3eed93))



### [0.16.2](https://github.com/endojs/endo/compare/@endo/eventual-send@0.16.1...@endo/eventual-send@0.16.2) (2022-08-26)


### Bug Fixes

* **eventual-send:** Remove ?. and ?? operators for RESM ([15dc777](https://github.com/endojs/endo/commit/15dc777c64dce5e50386d3fa80e209e9991c516b))



### [0.16.1](https://github.com/endojs/endo/compare/@endo/eventual-send@0.16.0...@endo/eventual-send@0.16.1) (2022-08-25)


### Features

* **eventual-send:** Feature-flag track-turns ([e07019e](https://github.com/endojs/endo/commit/e07019e3c312391da26fbe6cce6a875484302288))


### Bug Fixes

* **eventual-send:** hoist closures to discourage argument retention ([7786d4c](https://github.com/endojs/endo/commit/7786d4c201cfc5e5fbd27cd456d45597c25284a2)), closes [#1245](https://github.com/endojs/endo/issues/1245)



## [0.16.0](https://github.com/endojs/endo/compare/@endo/eventual-send@0.15.5...@endo/eventual-send@0.16.0) (2022-08-23)


### ⚠ BREAKING CHANGES

* **eventual-send:** Disallow using E proxy methods as functions (#1255)

### Bug Fixes

* **eventual-send:** Disallow using E proxy methods as functions ([#1255](https://github.com/endojs/endo/issues/1255)) ([43b7962](https://github.com/endojs/endo/commit/43b796232634b54c9e7de1c0a2349d22c29fc384))
* typedef default onfulfilled handler for E.when ([c5582ca](https://github.com/endojs/endo/commit/c5582ca7473e0a5d94ef4753ff54e0626cdb1d0a))



### [0.15.5](https://github.com/endojs/endo/compare/@endo/eventual-send@0.15.4...@endo/eventual-send@0.15.5) (2022-06-28)

**Note:** Version bump only for package @endo/eventual-send





### [0.15.4](https://github.com/endojs/endo/compare/@endo/eventual-send@0.15.3...@endo/eventual-send@0.15.4) (2022-06-11)


### Bug Fixes

* **eventual-send:** no implicit rejection silencing; just harden ([ca07d81](https://github.com/endojs/endo/commit/ca07d8150fd1e12b9e90505a7c06ada6b25d0743))
* **eventual-send:** use `!Object.is(a, b)` instead of `a !== b` for NaNs ([2b7e418](https://github.com/endojs/endo/commit/2b7e4189182dcac17832bbdcfb6ac56e32fee456))



### [0.15.3](https://github.com/endojs/endo/compare/@endo/eventual-send@0.15.2...@endo/eventual-send@0.15.3) (2022-04-15)

**Note:** Version bump only for package @endo/eventual-send





### [0.15.2](https://github.com/endojs/endo/compare/@endo/eventual-send@0.15.1...@endo/eventual-send@0.15.2) (2022-04-14)

**Note:** Version bump only for package @endo/eventual-send





### [0.15.1](https://github.com/endojs/endo/compare/@endo/eventual-send@0.15.0...@endo/eventual-send@0.15.1) (2022-04-13)


### Bug Fixes

* Revert dud release ([c8a7101](https://github.com/endojs/endo/commit/c8a71017d8d7af10a97909c9da9c5c7e59aed939))



## [0.15.0](https://github.com/endojs/endo/compare/@endo/eventual-send@0.14.8...@endo/eventual-send@0.15.0) (2022-04-12)


### ⚠ BREAKING CHANGES

* **far:** rename `Remote` to `FarRef`

### Features

* **far:** rename `Remote` to `FarRef` ([7bde2bf](https://github.com/endojs/endo/commit/7bde2bf28e88935606564cebd1b8d284cd70e4ef))


### Bug Fixes

* **eventual-send:** evolve types based on marshal requirements ([ff388fa](https://github.com/endojs/endo/commit/ff388fa2f81446c1ae02618b78771dc17ce5c74b))
* **eventual-send:** unwrap promises more fully ([6ba799f](https://github.com/endojs/endo/commit/6ba799f77e8d55530ecd7617c3ccad22324bade2))



### [0.14.8](https://github.com/endojs/endo/compare/@endo/eventual-send@0.14.7...@endo/eventual-send@0.14.8) (2022-03-07)


### Features

* **eventual-send:** provide typing for `Remote<Primary, Local>` ([4d28509](https://github.com/endojs/endo/commit/4d285095a6ea1a78f1a3a4696bc822f5e4dfd43f))


### Bug Fixes

* **eventual-send:** properly declare `E` to be type `EProxy` ([3bdfdf7](https://github.com/endojs/endo/commit/3bdfdf77440f9ddea9bac1e783aaf015e9bcfa62))



### [0.14.7](https://github.com/endojs/endo/compare/@endo/eventual-send@0.14.6...@endo/eventual-send@0.14.7) (2022-03-02)

**Note:** Version bump only for package @endo/eventual-send





### [0.14.6](https://github.com/endojs/endo/compare/@endo/eventual-send@0.14.5...@endo/eventual-send@0.14.6) (2022-02-20)

**Note:** Version bump only for package @endo/eventual-send





### [0.14.5](https://github.com/endojs/endo/compare/@endo/eventual-send@0.14.4...@endo/eventual-send@0.14.5) (2022-02-18)


### Bug Fixes

* Make jsconfigs less brittle ([861ca32](https://github.com/endojs/endo/commit/861ca32a72f0a48410fd93b1cbaaad9139590659))
* **marshal:** Fix typing for TS 4.5 compatibility ([8513cfb](https://github.com/endojs/endo/commit/8513cfbaaa2308bee9f666585694e622e84fd24e))



### [0.14.4](https://github.com/endojs/endo/compare/@endo/eventual-send@0.14.3...@endo/eventual-send@0.14.4) (2022-01-31)

**Note:** Version bump only for package @endo/eventual-send





### [0.14.3](https://github.com/endojs/endo/compare/@endo/eventual-send@0.14.2...@endo/eventual-send@0.14.3) (2022-01-27)


### Bug Fixes

* Publish all materials consistently ([#1021](https://github.com/endojs/endo/issues/1021)) ([a2c74d9](https://github.com/endojs/endo/commit/a2c74d9de68a325761d62e1b2187a117ef884571))



### [0.14.2](https://github.com/endojs/endo/compare/@endo/eventual-send@0.14.1...@endo/eventual-send@0.14.2) (2022-01-25)


### Features

* **eventual-send:** harden things where possible under SES ([2394c71](https://github.com/endojs/endo/commit/2394c71673360ce8ec8a3c30f5fa47753fb9bec5))


### Bug Fixes

* remove more extraneous spaced-comment comments ([#1009](https://github.com/endojs/endo/issues/1009)) ([980a798](https://github.com/endojs/endo/commit/980a79898a4643a359d905c308eecf70d8ab2758))



### 0.14.1 (2022-01-23)


### Bug Fixes

* **eventual-send:** Accommodate TypeScript pickiness difference ([1c86bb0](https://github.com/endojs/endo/commit/1c86bb096c6fc8f4e5dd0220c2309534e8593b52))
* **eventual-send:** Remove unused files ([309965c](https://github.com/endojs/endo/commit/309965c79c23079cdcf578b91b265c82d7657b09))



## [0.14.0](https://github.com/Agoric/agoric-sdk/compare/@agoric/eventual-send@0.13.30...@agoric/eventual-send@0.14.0) (2021-12-02)


### ⚠ BREAKING CHANGES

* **eventual-send:** implement *SendOnly and handler defaults

### Features

* **eventual-send:** implement *SendOnly and handler defaults ([8d2fb33](https://github.com/Agoric/agoric-sdk/commit/8d2fb334df18c88663094510fb2fea809ed8a2ac))


### Bug Fixes

* **deps:** remove explicit `@agoric/babel-standalone` ([4f22453](https://github.com/Agoric/agoric-sdk/commit/4f22453a6f2de1a2c27ae8ad0d11b13116890dab))
* **eslint-config:** loosen no-extraneous-dependencies patterns ([71be149](https://github.com/Agoric/agoric-sdk/commit/71be149522823ec41900bcf96a0b39f75b38bfd9))
* **eventual-send:** do basic sanity of static method invocation ([596d77e](https://github.com/Agoric/agoric-sdk/commit/596d77ed4ed99a46133a78a437c76393665a4073))
* **eventual-send:** make local handlers more robust ([30d4db5](https://github.com/Agoric/agoric-sdk/commit/30d4db5ab10c6f4201332db866f612b84ac084e5))
* **eventual-send:** provide `returnedP` when it is available ([a779066](https://github.com/Agoric/agoric-sdk/commit/a7790660db426e1967f444c034c3dedd59ed33eb))
* **eventual-send:** remove WeakMap workaround for pre-xsnap XS ([dcad6ac](https://github.com/Agoric/agoric-sdk/commit/dcad6ac6ac946414f6411ec1ad73017e04875d6d))



### [0.13.30](https://github.com/Agoric/agoric-sdk/compare/@agoric/eventual-send@0.13.29...@agoric/eventual-send@0.13.30) (2021-10-13)

**Note:** Version bump only for package @agoric/eventual-send





### [0.13.29](https://github.com/Agoric/agoric-sdk/compare/@agoric/eventual-send@0.13.28...@agoric/eventual-send@0.13.29) (2021-09-23)

**Note:** Version bump only for package @agoric/eventual-send





### [0.13.28](https://github.com/Agoric/agoric-sdk/compare/@agoric/eventual-send@0.13.27...@agoric/eventual-send@0.13.28) (2021-09-15)

**Note:** Version bump only for package @agoric/eventual-send





### [0.13.27](https://github.com/Agoric/agoric-sdk/compare/@agoric/eventual-send@0.13.26...@agoric/eventual-send@0.13.27) (2021-08-18)

**Note:** Version bump only for package @agoric/eventual-send





### [0.13.26](https://github.com/Agoric/agoric-sdk/compare/@agoric/eventual-send@0.13.25...@agoric/eventual-send@0.13.26) (2021-08-17)


### Bug Fixes

* Remove dregs of node -r esm ([#3710](https://github.com/Agoric/agoric-sdk/issues/3710)) ([e30c934](https://github.com/Agoric/agoric-sdk/commit/e30c934a9de19e930677c7b65ad98abe0be16d56))



### [0.13.25](https://github.com/Agoric/agoric-sdk/compare/@agoric/eventual-send@0.13.22...@agoric/eventual-send@0.13.25) (2021-08-15)

### 0.26.10 (2021-07-28)

**Note:** Version bump only for package @agoric/eventual-send





### [0.13.24](https://github.com/Agoric/agoric-sdk/compare/@agoric/eventual-send@0.13.22...@agoric/eventual-send@0.13.24) (2021-08-14)

### 0.26.10 (2021-07-28)

**Note:** Version bump only for package @agoric/eventual-send





### [0.13.23](https://github.com/Agoric/agoric-sdk/compare/@agoric/eventual-send@0.13.22...@agoric/eventual-send@0.13.23) (2021-07-28)

**Note:** Version bump only for package @agoric/eventual-send





### [0.13.22](https://github.com/Agoric/agoric-sdk/compare/@agoric/eventual-send@0.13.21...@agoric/eventual-send@0.13.22) (2021-07-01)

**Note:** Version bump only for package @agoric/eventual-send





### [0.13.21](https://github.com/Agoric/agoric-sdk/compare/@agoric/eventual-send@0.13.20...@agoric/eventual-send@0.13.21) (2021-06-28)

**Note:** Version bump only for package @agoric/eventual-send





### [0.13.20](https://github.com/Agoric/agoric-sdk/compare/@agoric/eventual-send@0.13.19...@agoric/eventual-send@0.13.20) (2021-06-25)

**Note:** Version bump only for package @agoric/eventual-send





### [0.13.19](https://github.com/Agoric/agoric-sdk/compare/@agoric/eventual-send@0.13.18...@agoric/eventual-send@0.13.19) (2021-06-24)

**Note:** Version bump only for package @agoric/eventual-send





### [0.13.18](https://github.com/Agoric/agoric-sdk/compare/@agoric/eventual-send@0.13.17...@agoric/eventual-send@0.13.18) (2021-06-24)

**Note:** Version bump only for package @agoric/eventual-send





### [0.13.17](https://github.com/Agoric/agoric-sdk/compare/@agoric/eventual-send@0.13.16...@agoric/eventual-send@0.13.17) (2021-06-23)

**Note:** Version bump only for package @agoric/eventual-send





### [0.13.16](https://github.com/Agoric/agoric-sdk/compare/@agoric/eventual-send@0.13.15...@agoric/eventual-send@0.13.16) (2021-06-16)

**Note:** Version bump only for package @agoric/eventual-send





### [0.13.15](https://github.com/Agoric/agoric-sdk/compare/@agoric/eventual-send@0.13.14...@agoric/eventual-send@0.13.15) (2021-06-15)


### Bug Fixes

* Pin ESM to forked version ([54dbb55](https://github.com/Agoric/agoric-sdk/commit/54dbb55d64d7ff7adb395bc4bd9d1461dd2d3c17))
* upgrade acorn and babel parser ([048cc92](https://github.com/Agoric/agoric-sdk/commit/048cc925b3090f77e998fef1f3ac26846c4a8f26))



## [0.13.14](https://github.com/Agoric/agoric-sdk/compare/@agoric/eventual-send@0.13.13...@agoric/eventual-send@0.13.14) (2021-05-10)

**Note:** Version bump only for package @agoric/eventual-send





## [0.13.13](https://github.com/Agoric/agoric-sdk/compare/@agoric/eventual-send@0.13.12...@agoric/eventual-send@0.13.13) (2021-05-05)

**Note:** Version bump only for package @agoric/eventual-send





## [0.13.12](https://github.com/Agoric/agoric-sdk/compare/@agoric/eventual-send@0.13.11...@agoric/eventual-send@0.13.12) (2021-05-05)

**Note:** Version bump only for package @agoric/eventual-send





## [0.13.11](https://github.com/Agoric/agoric-sdk/compare/@agoric/eventual-send@0.13.10...@agoric/eventual-send@0.13.11) (2021-04-22)

**Note:** Version bump only for package @agoric/eventual-send





## [0.13.10](https://github.com/Agoric/agoric-sdk/compare/@agoric/eventual-send@0.13.9...@agoric/eventual-send@0.13.10) (2021-04-18)

**Note:** Version bump only for package @agoric/eventual-send





## [0.13.9](https://github.com/Agoric/agoric-sdk/compare/@agoric/eventual-send@0.13.8...@agoric/eventual-send@0.13.9) (2021-04-16)

**Note:** Version bump only for package @agoric/eventual-send





## [0.13.8](https://github.com/Agoric/agoric-sdk/compare/@agoric/eventual-send@0.13.7...@agoric/eventual-send@0.13.8) (2021-04-14)

**Note:** Version bump only for package @agoric/eventual-send





## [0.13.7](https://github.com/Agoric/agoric-sdk/compare/@agoric/eventual-send@0.13.6...@agoric/eventual-send@0.13.7) (2021-04-13)

**Note:** Version bump only for package @agoric/eventual-send





## [0.13.6](https://github.com/Agoric/agoric-sdk/compare/@agoric/eventual-send@0.13.5...@agoric/eventual-send@0.13.6) (2021-04-07)

**Note:** Version bump only for package @agoric/eventual-send





## [0.13.5](https://github.com/Agoric/agoric-sdk/compare/@agoric/eventual-send@0.13.4...@agoric/eventual-send@0.13.5) (2021-04-06)

**Note:** Version bump only for package @agoric/eventual-send





## [0.13.4](https://github.com/Agoric/agoric-sdk/compare/@agoric/eventual-send@0.13.3...@agoric/eventual-send@0.13.4) (2021-03-24)

**Note:** Version bump only for package @agoric/eventual-send





## [0.13.3](https://github.com/Agoric/agoric-sdk/compare/@agoric/eventual-send@0.13.2...@agoric/eventual-send@0.13.3) (2021-03-16)


### Bug Fixes

* make separate 'test:xs' target, remove XS from 'test' target ([b9c1a69](https://github.com/Agoric/agoric-sdk/commit/b9c1a6987093fc8e09e8aba7acd2a1618413bac8)), closes [#2647](https://github.com/Agoric/agoric-sdk/issues/2647)





## [0.13.2](https://github.com/Agoric/agoric-sdk/compare/@agoric/eventual-send@0.13.1...@agoric/eventual-send@0.13.2) (2021-02-22)

**Note:** Version bump only for package @agoric/eventual-send





## [0.13.1](https://github.com/Agoric/agoric-sdk/compare/@agoric/eventual-send@0.13.0...@agoric/eventual-send@0.13.1) (2021-02-16)


### Bug Fixes

* add placeholder for top-of-turn error logging ([#2163](https://github.com/Agoric/agoric-sdk/issues/2163)) ([f0c257c](https://github.com/Agoric/agoric-sdk/commit/f0c257ceb420f1d6fb4513ff9ef8c7c773b6e333))
* Correlate sent errors with received errors ([73b9cfd](https://github.com/Agoric/agoric-sdk/commit/73b9cfd33cf7842bdc105a79592028649cb1c92a))
* review comments ([7db7e5c](https://github.com/Agoric/agoric-sdk/commit/7db7e5c4c569dfedff8d748dd58893218b0a2458))
* use assert rather than FooError constructors ([f860c5b](https://github.com/Agoric/agoric-sdk/commit/f860c5bf5add165a08cb5bd543502857c3f57998))
* **eventual-send:** test static method rejections ([f6bd055](https://github.com/Agoric/agoric-sdk/commit/f6bd055ccc897dc49ae92f452dcd5abf45bfae14))





# [0.13.0](https://github.com/Agoric/agoric-sdk/compare/@agoric/eventual-send@0.12.0...@agoric/eventual-send@0.13.0) (2020-12-10)


### Features

* **import-bundle:** Preliminary support Endo zip hex bundle format ([#1983](https://github.com/Agoric/agoric-sdk/issues/1983)) ([983681b](https://github.com/Agoric/agoric-sdk/commit/983681bfc4bf512b6bd90806ed9220cd4fefc13c))





# [0.12.0](https://github.com/Agoric/agoric-sdk/compare/@agoric/eventual-send@0.12.0-dev.0...@agoric/eventual-send@0.12.0) (2020-11-07)

**Note:** Version bump only for package @agoric/eventual-send





# [0.12.0-dev.0](https://github.com/Agoric/agoric-sdk/compare/@agoric/eventual-send@0.11.1...@agoric/eventual-send@0.12.0-dev.0) (2020-10-19)


### Features

* **E:** . ([eddf51e](https://github.com/Agoric/agoric-sdk/commit/eddf51eb3c3c59e4cf9031ee0c21231c6585b7c2))
* **E:** . ([4ce1239](https://github.com/Agoric/agoric-sdk/commit/4ce12393a36c6d68046442e0cf6b517c9c97f03c))
* **E:** . ([672c593](https://github.com/Agoric/agoric-sdk/commit/672c59351cf04a174f2cfd553f026929613cffaf))
* **E:** . ([c0d8013](https://github.com/Agoric/agoric-sdk/commit/c0d80138bb66c047466b040c7c44ebe4626dd939))
* **E:** . adding tests for the sendOnly variant. ([19182b3](https://github.com/Agoric/agoric-sdk/commit/19182b35088928e1feb5ef559efb66edec587a9a))
* **E:** . another test added. ([162c0d7](https://github.com/Agoric/agoric-sdk/commit/162c0d7f26f113d8ed6608c229add9592265ff66))
* **E:** . continuing ([6c51052](https://github.com/Agoric/agoric-sdk/commit/6c51052c7497e932d0b72d97b3fe0747b53b14cc))
* **E:** . continuing onward ([2b1eb5b](https://github.com/Agoric/agoric-sdk/commit/2b1eb5b9715cb3bf8c7bf1e4617dc6b3fab2ecd3))
* **E:** . fixing E.js ([4d57814](https://github.com/Agoric/agoric-sdk/commit/4d57814035576fccdd1f41fd13d50e3ebf719123))
* **E:** . fixing test-e.js ([a48bb95](https://github.com/Agoric/agoric-sdk/commit/a48bb956f6e6d63c483c03a43aa561cf72eb3424))
* **E:** . test skipped for now until I am destumped ([fd9df0f](https://github.com/Agoric/agoric-sdk/commit/fd9df0f3d78863e271107a687765c56d77edd62d))
* **E:** . throwsAsync not asyncThrows ([aa62713](https://github.com/Agoric/agoric-sdk/commit/aa62713d8947c46868c4b511bd29f330d3a7a13b))
* **E:** . voiding voids ([3908652](https://github.com/Agoric/agoric-sdk/commit/390865279be9cf30f64bb27500d50f5107ef1c89))
* **E:** . was missing a closing paren. ([b87d485](https://github.com/Agoric/agoric-sdk/commit/b87d485e241f2bca9b147a8006c0e80a96c5036e))
* **E:** starting to add missing E.sendOnly() ([e04ee59](https://github.com/Agoric/agoric-sdk/commit/e04ee592b761dc433adc3a7ccb08df0ac3895616))





## [0.11.1](https://github.com/Agoric/agoric-sdk/compare/@agoric/eventual-send@0.11.1-dev.2...@agoric/eventual-send@0.11.1) (2020-10-11)


### Bug Fixes

* improved error message when eventual send target is undefined ([#1847](https://github.com/Agoric/agoric-sdk/issues/1847)) ([f33d30e](https://github.com/Agoric/agoric-sdk/commit/f33d30e46eeb209f039e81a92350c06611cc45a1))
* **eventual-send:** silence unhandled rejection for remote calls ([fb7c247](https://github.com/Agoric/agoric-sdk/commit/fb7c247688eacf09e975ca87ab7ef246cd240136))





## [0.11.1-dev.2](https://github.com/Agoric/agoric-sdk/compare/@agoric/eventual-send@0.11.1-dev.1...@agoric/eventual-send@0.11.1-dev.2) (2020-09-18)

**Note:** Version bump only for package @agoric/eventual-send





## [0.11.1-dev.1](https://github.com/Agoric/agoric-sdk/compare/@agoric/eventual-send@0.11.1-dev.0...@agoric/eventual-send@0.11.1-dev.1) (2020-09-18)

**Note:** Version bump only for package @agoric/eventual-send





## [0.11.1-dev.0](https://github.com/Agoric/agoric-sdk/compare/@agoric/eventual-send@0.11.0...@agoric/eventual-send@0.11.1-dev.0) (2020-09-18)

**Note:** Version bump only for package @agoric/eventual-send





# [0.11.0](https://github.com/Agoric/agoric-sdk/compare/@agoric/eventual-send@0.10.0...@agoric/eventual-send@0.11.0) (2020-09-16)


### Bug Fixes

* allow local Presences to receive deliveries as well ([93c8933](https://github.com/Agoric/agoric-sdk/commit/93c8933b5c2bdafec26b325e0d3fc6e88978d199)), closes [#1719](https://github.com/Agoric/agoric-sdk/issues/1719)
* implement epochs and make tolerant of restarts ([1c786b8](https://github.com/Agoric/agoric-sdk/commit/1c786b861a445891d09df2f1a47d689d641a0c5f))
* minor updates from PR review ([aa37b4f](https://github.com/Agoric/agoric-sdk/commit/aa37b4f4439faa846ced5653c7963798f44e872e))
* restoring most state, just need to isolate the plugin captp ([f92ee73](https://github.com/Agoric/agoric-sdk/commit/f92ee731afa69435b10b94cf4a483f25bed7a668))


### Features

* implement CapTP forwarding over a plugin device ([b4a1be8](https://github.com/Agoric/agoric-sdk/commit/b4a1be8f600d60191570a3bbf42bc4c82af47b06))
* implement makeLoopback and makeFar without a membrane ([b0bccba](https://github.com/Agoric/agoric-sdk/commit/b0bccbabecc2902c9d9f7319ffb0c509bccc2d01))





# [0.10.0](https://github.com/Agoric/agoric-sdk/compare/@agoric/eventual-send@0.9.3...@agoric/eventual-send@0.10.0) (2020-08-31)


### Bug Fixes

* `ERef<T>` is `T | PromiseLike<T>` ([#1383](https://github.com/Agoric/agoric-sdk/issues/1383)) ([8ef4d66](https://github.com/Agoric/agoric-sdk/commit/8ef4d662dc80daf80420c0c531c2abe41517b6cd))
* clean up E.when and E.resolve ([#1561](https://github.com/Agoric/agoric-sdk/issues/1561)) ([634046c](https://github.com/Agoric/agoric-sdk/commit/634046c0fc541fc1db258105a75c7313b5668aa0))
* don't early-bind the Promise constructor; metering changes it ([a703e6f](https://github.com/Agoric/agoric-sdk/commit/a703e6f1091b595d7f4fd368ec2c2407e5e89695))
* excise @agoric/harden from the codebase ([eee6fe1](https://github.com/Agoric/agoric-sdk/commit/eee6fe1153730dec52841c9eb4c056a8c5438b0f))
* need type decl for HandledPromise.reject ([#1406](https://github.com/Agoric/agoric-sdk/issues/1406)) ([aec2c99](https://github.com/Agoric/agoric-sdk/commit/aec2c9940b4ba580ec98f0a1f94b3cadde7fa2eb))
* reduce inconsistency among our linting rules ([#1492](https://github.com/Agoric/agoric-sdk/issues/1492)) ([b6b675e](https://github.com/Agoric/agoric-sdk/commit/b6b675e2de110e2af19cad784a66220cab21dacf))
* remove obsolete "unwrap" ([#1360](https://github.com/Agoric/agoric-sdk/issues/1360)) ([5796e0e](https://github.com/Agoric/agoric-sdk/commit/5796e0e6f8bfd00619f725bdac4ff5743610a52f))
* remove unnecessary types ([e242143](https://github.com/Agoric/agoric-sdk/commit/e24214342062f908ebee91a775c0427abc21e263))
* try to use HandledPromise for pipelineability ([848a90f](https://github.com/Agoric/agoric-sdk/commit/848a90f8d7427e2c31dc5764555da2fde42eac8d))
* update JS typings ([20941e6](https://github.com/Agoric/agoric-sdk/commit/20941e675302ee5905e4825638e661065ad5d3f9))
* upgrade to SES v0.10.1, and make HandledPromise shim work ([5d0adea](https://github.com/Agoric/agoric-sdk/commit/5d0adea1b3b7369ae8131df55f99b61e0c428542))
* use full harden when creating E ([adc8e73](https://github.com/Agoric/agoric-sdk/commit/adc8e73625975378e4856917146c8fd152d7c897))


### Features

* introduce the shim/no-shim exports to distinguish callers ([d2a6bff](https://github.com/Agoric/agoric-sdk/commit/d2a6bffd74042e02cf0fbca88d2caf334a8de261))





## [0.9.3](https://github.com/Agoric/agoric-sdk/compare/@agoric/eventual-send@0.9.2...@agoric/eventual-send@0.9.3) (2020-06-30)

**Note:** Version bump only for package @agoric/eventual-send





## [0.9.2](https://github.com/Agoric/agoric-sdk/compare/@agoric/eventual-send@0.9.1...@agoric/eventual-send@0.9.2) (2020-05-17)


### Bug Fixes

* don't stall extra turns while resolving to local objects ([04740d6](https://github.com/Agoric/agoric-sdk/commit/04740d6e1c2279f8ae1ab17ecc83bd6f772034a7))
* fix double invoke bug ([#1117](https://github.com/Agoric/agoric-sdk/issues/1117)) ([b8d462e](https://github.com/Agoric/agoric-sdk/commit/b8d462e56aa3f1080eb7617dd715a3ecbd2c9ae3))
* remove many build steps ([6c7d3bb](https://github.com/Agoric/agoric-sdk/commit/6c7d3bb0c70277c22f8eda40525d7240141a5434))





## [0.9.1](https://github.com/Agoric/agoric-sdk/compare/@agoric/eventual-send@0.9.0...@agoric/eventual-send@0.9.1) (2020-05-10)


### Bug Fixes

* be lazy in choosing which handler to use ([904b610](https://github.com/Agoric/agoric-sdk/commit/904b610685a50ba32dc0712e62f4c902f61e437a))
* be sure to propagate handler failures ([2b931fc](https://github.com/Agoric/agoric-sdk/commit/2b931fcb60afcb24fd7c331eadd12dbfc4592e85))





# [0.9.0](https://github.com/Agoric/agoric-sdk/compare/@agoric/eventual-send@0.8.0...@agoric/eventual-send@0.9.0) (2020-05-04)


### Bug Fixes

* lots and lots of improvements ([8f1c312](https://github.com/Agoric/agoric-sdk/commit/8f1c3128bbb4c3baf7f15b9ca632fc902acd238f))
* use the new (typed) harden package ([2eb1af0](https://github.com/Agoric/agoric-sdk/commit/2eb1af08fe3967629a3ce165752fd501a5c85a96))


### Features

* implement channel host handler ([4e68f44](https://github.com/Agoric/agoric-sdk/commit/4e68f441b46d70dee481387ab96e88f1e0b69bfa))





# [0.8.0](https://github.com/Agoric/agoric-sdk/compare/@agoric/eventual-send@0.8.0-alpha.0...@agoric/eventual-send@0.8.0) (2020-04-13)

**Note:** Version bump only for package @agoric/eventual-send





# [0.8.0-alpha.0](https://github.com/Agoric/agoric-sdk/compare/@agoric/eventual-send@0.7.0...@agoric/eventual-send@0.8.0-alpha.0) (2020-04-12)


### Bug Fixes

* shorten HandledPromises to propagate handlers ([2ed50d2](https://github.com/Agoric/agoric-sdk/commit/2ed50d24c1b80959748bcaf0d04f1c4cd25f4242))


### Features

* add the returnedP as the last argument to the handler ([1f83d99](https://github.com/Agoric/agoric-sdk/commit/1f83d994f48b659f3c49c4b5eb2b50ea7bb7b7a3))





# [0.7.0](https://github.com/Agoric/agoric-sdk/compare/@agoric/eventual-send@0.7.0-alpha.0...@agoric/eventual-send@0.7.0) (2020-04-02)

**Note:** Version bump only for package @agoric/eventual-send





# [0.7.0-alpha.0](https://github.com/Agoric/agoric-sdk/compare/@agoric/eventual-send@0.6.0...@agoric/eventual-send@0.7.0-alpha.0) (2020-04-02)


### Features

* add E.when(x, onfulfilled, onrejected) as a convenience ([4415f67](https://github.com/Agoric/agoric-sdk/commit/4415f67651f7770fddea85272ee7a02b69b9e8aa))





# 0.6.0 (2020-03-26)


### Bug Fixes

* **api:** remove many unnecessary methods ([cf10dc3](https://github.com/Agoric/eventual-send/commit/cf10dc3af79cbeb33a3bc4980e6b87ac28503cd4)), closes [#41](https://github.com/Agoric/eventual-send/issues/41)
* **E:** address PR comments ([a529982](https://github.com/Agoric/eventual-send/commit/a529982203e4842290b84f48831052fe1e6d30f9))
* **eventual-send:** Update the API throughout agoric-sdk ([97fc1e7](https://github.com/Agoric/eventual-send/commit/97fc1e748d8e3955b29baf0e04bfa788d56dad9f))
* **HandledPromise:** implement specified API ([8da7249](https://github.com/Agoric/eventual-send/commit/8da7249764da87b7c47b89b5ccb5c1f2125ef0d1)), closes [#42](https://github.com/Agoric/eventual-send/issues/42)
* **resolve:** protect against reentrancy attack ([#401](https://github.com/Agoric/eventual-send/issues/401)) ([d1f25ef](https://github.com/Agoric/eventual-send/commit/d1f25ef2511168bd9df8b6ca6a8edfef13f6dd2b)), closes [#9](https://github.com/Agoric/eventual-send/issues/9)
* **SwingSet:** passing all tests ([341718b](https://github.com/Agoric/eventual-send/commit/341718be335e16b58aa5e648b51a731ea065c1d6))
* **unwrap:** pass through non-Thenables before throwing ([67aba42](https://github.com/Agoric/eventual-send/commit/67aba42962b10af9250248f7f1b2abc579291de6)), closes [#518](https://github.com/Agoric/eventual-send/issues/518)
* address PR comments ([b9ed6b5](https://github.com/Agoric/eventual-send/commit/b9ed6b5a510433af968ba233d4e943b939defa1b))


### Features

* **E:** export E.resolve to use HandledPromise.resolve ([93c508d](https://github.com/Agoric/eventual-send/commit/93c508de8439d8d6b4b6030af3f95c370c46f91f))
* **HandledPromise:** add sync unwrap() to get presences ([5ec5b78](https://github.com/Agoric/eventual-send/commit/5ec5b78a038f11d26827358c70bb6c820ed04a2e)), closes [#412](https://github.com/Agoric/eventual-send/issues/412)
