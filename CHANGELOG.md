# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [1.7.4](https://github.com/Agoric/agoric-sdk/compare/@agoric/captp@1.7.3...@agoric/captp@1.7.4) (2021-03-24)

**Note:** Version bump only for package @agoric/captp





## [1.7.3](https://github.com/Agoric/agoric-sdk/compare/@agoric/captp@1.7.2...@agoric/captp@1.7.3) (2021-03-16)


### Bug Fixes

* make separate 'test:xs' target, remove XS from 'test' target ([b9c1a69](https://github.com/Agoric/agoric-sdk/commit/b9c1a6987093fc8e09e8aba7acd2a1618413bac8)), closes [#2647](https://github.com/Agoric/agoric-sdk/issues/2647)





## [1.7.2](https://github.com/Agoric/agoric-sdk/compare/@agoric/captp@1.7.1...@agoric/captp@1.7.2) (2021-02-22)

**Note:** Version bump only for package @agoric/captp





## [1.7.1](https://github.com/Agoric/agoric-sdk/compare/@agoric/captp@1.7.0...@agoric/captp@1.7.1) (2021-02-16)


### Bug Fixes

* Correlate sent errors with received errors ([73b9cfd](https://github.com/Agoric/agoric-sdk/commit/73b9cfd33cf7842bdc105a79592028649cb1c92a))
* wire through the CapTP bootstrap message ([7af41bc](https://github.com/Agoric/agoric-sdk/commit/7af41bc13a778c4872863e2060874910d6c1fefa))





# [1.7.0](https://github.com/Agoric/agoric-sdk/compare/@agoric/captp@1.6.0...@agoric/captp@1.7.0) (2020-12-10)


### Features

* **import-bundle:** Preliminary support Endo zip hex bundle format ([#1983](https://github.com/Agoric/agoric-sdk/issues/1983)) ([983681b](https://github.com/Agoric/agoric-sdk/commit/983681bfc4bf512b6bd90806ed9220cd4fefc13c))





# [1.6.0](https://github.com/Agoric/agoric-sdk/compare/@agoric/captp@1.5.2-dev.0...@agoric/captp@1.6.0) (2020-11-07)


### Bug Fixes

* **captp:** don't crash hard on serialiasation failures ([8c98a9a](https://github.com/Agoric/agoric-sdk/commit/8c98a9a5f283dadd0007083255061773c94eda1d))


### Features

* **assert:** Thread stack traces to console, add entangled assert ([#1884](https://github.com/Agoric/agoric-sdk/issues/1884)) ([5d4f35f](https://github.com/Agoric/agoric-sdk/commit/5d4f35f901f2ca40a2a4d66dab980a5fe8e575f4))





## [1.5.2-dev.0](https://github.com/Agoric/agoric-sdk/compare/@agoric/captp@1.5.1...@agoric/captp@1.5.2-dev.0) (2020-10-19)

**Note:** Version bump only for package @agoric/captp





## [1.5.1](https://github.com/Agoric/agoric-sdk/compare/@agoric/captp@1.5.1-dev.2...@agoric/captp@1.5.1) (2020-10-11)

**Note:** Version bump only for package @agoric/captp





## [1.5.1-dev.2](https://github.com/Agoric/agoric-sdk/compare/@agoric/captp@1.5.1-dev.1...@agoric/captp@1.5.1-dev.2) (2020-09-18)

**Note:** Version bump only for package @agoric/captp





## [1.5.1-dev.1](https://github.com/Agoric/agoric-sdk/compare/@agoric/captp@1.5.1-dev.0...@agoric/captp@1.5.1-dev.1) (2020-09-18)

**Note:** Version bump only for package @agoric/captp





## [1.5.1-dev.0](https://github.com/Agoric/agoric-sdk/compare/@agoric/captp@1.5.0...@agoric/captp@1.5.1-dev.0) (2020-09-18)

**Note:** Version bump only for package @agoric/captp





# [1.5.0](https://github.com/Agoric/agoric-sdk/compare/@agoric/captp@1.4.0...@agoric/captp@1.5.0) (2020-09-16)


### Bug Fixes

* add TODO unimplemented for liveSlots synthetic presences ([6089e71](https://github.com/Agoric/agoric-sdk/commit/6089e71aaa48867625c19d2f64c6e5b29880b7ad))
* implement epochs and make tolerant of restarts ([1c786b8](https://github.com/Agoric/agoric-sdk/commit/1c786b861a445891d09df2f1a47d689d641a0c5f))
* implement robust plugin persistence model ([2de552e](https://github.com/Agoric/agoric-sdk/commit/2de552ed4a4b25e5fcc641ff5e80afd5af1d167d))
* let the other side know about a disconnect if we initiate it ([510f427](https://github.com/Agoric/agoric-sdk/commit/510f4275b43dc92bb719cde97a3078163da46211))
* pass through the entire marshal stack to the vat ([f93c26b](https://github.com/Agoric/agoric-sdk/commit/f93c26b602766c9d8e3eb15740236cf81b38387f))
* silence normal disconnects ([01d94af](https://github.com/Agoric/agoric-sdk/commit/01d94af7d9f4dd98b0859b3707bedb57d6a9af3f))


### Features

* bidirectional loopback with `makeNear` ([4e29d20](https://github.com/Agoric/agoric-sdk/commit/4e29d206f6e881f82715c8a569ce291dd7ae82a8))
* implement makeLoopback and makeFar without a membrane ([b0bccba](https://github.com/Agoric/agoric-sdk/commit/b0bccbabecc2902c9d9f7319ffb0c509bccc2d01))





# [1.4.0](https://github.com/Agoric/agoric-sdk/compare/@agoric/captp@1.3.3...@agoric/captp@1.4.0) (2020-08-31)


### Bug Fixes

* don't delete the questionID too soon ([1e51cef](https://github.com/Agoric/agoric-sdk/commit/1e51cef98cdf9e4267b92378c6bf6d0e3fdecf85))
* properly abort all communication when CapTP is disconnected ([c2c0196](https://github.com/Agoric/agoric-sdk/commit/c2c0196001c2bc94d14645272b931e39ee38c197))
* reduce inconsistency among our linting rules ([#1492](https://github.com/Agoric/agoric-sdk/issues/1492)) ([b6b675e](https://github.com/Agoric/agoric-sdk/commit/b6b675e2de110e2af19cad784a66220cab21dacf))
* rename producePromise to makePromiseKit ([#1329](https://github.com/Agoric/agoric-sdk/issues/1329)) ([1d2925a](https://github.com/Agoric/agoric-sdk/commit/1d2925ad640cce7b419751027b44737bd46a6d59))
* send and receive Remotable tags ([#1628](https://github.com/Agoric/agoric-sdk/issues/1628)) ([1bae122](https://github.com/Agoric/agoric-sdk/commit/1bae1220c2c35f48f279cb3aeab6012bce8ddb5a))
* shuffle around exports ([c95282e](https://github.com/Agoric/agoric-sdk/commit/c95282ec5b72260353441ec8dd2ad0eaba9cdfa8))
* supply default disconnected abort exception ([274ed53](https://github.com/Agoric/agoric-sdk/commit/274ed53fb99c0fb135b8beae984e3f0b731dbb81))
* **captp:** make more code paths fail on disconnect ([5c0c509](https://github.com/Agoric/agoric-sdk/commit/5c0c5097acd4dacf2b594d84606d0494d71f0216))


### Features

* **captp:** allow onReject handler to avoid unhandled promise ([f76c804](https://github.com/Agoric/agoric-sdk/commit/f76c804bb47ad8be71a9c512800c8b864edd7e6a))





## [1.3.3](https://github.com/Agoric/agoric-sdk/compare/@agoric/captp@1.3.2...@agoric/captp@1.3.3) (2020-06-30)


### Bug Fixes

* **captp:** stop creating dist bundles ([7067ae0](https://github.com/Agoric/agoric-sdk/commit/7067ae0e8afe122ee64f5652c45d0288b74516a5))





## [1.3.2](https://github.com/Agoric/agoric-sdk/compare/@agoric/captp@1.3.1...@agoric/captp@1.3.2) (2020-05-17)

**Note:** Version bump only for package @agoric/captp





## [1.3.1](https://github.com/Agoric/agoric-sdk/compare/@agoric/captp@1.3.0...@agoric/captp@1.3.1) (2020-05-10)

**Note:** Version bump only for package @agoric/captp





# [1.3.0](https://github.com/Agoric/agoric-sdk/compare/@agoric/captp@1.2.3...@agoric/captp@1.3.0) (2020-05-04)


### Bug Fixes

* use the new (typed) harden package ([2eb1af0](https://github.com/Agoric/agoric-sdk/commit/2eb1af08fe3967629a3ce165752fd501a5c85a96))


### Features

* add Presence, getInterfaceOf, deepCopyData to marshal ([aac1899](https://github.com/Agoric/agoric-sdk/commit/aac1899b6cefc4241af04911a92ffc50fbac3429))





## [1.2.3](https://github.com/Agoric/agoric-sdk/compare/@agoric/captp@1.2.3-alpha.0...@agoric/captp@1.2.3) (2020-04-13)

**Note:** Version bump only for package @agoric/captp





## [1.2.3-alpha.0](https://github.com/Agoric/agoric-sdk/compare/@agoric/captp@1.2.2...@agoric/captp@1.2.3-alpha.0) (2020-04-12)

**Note:** Version bump only for package @agoric/captp





## [1.2.2](https://github.com/Agoric/agoric-sdk/compare/@agoric/captp@1.2.2-alpha.0...@agoric/captp@1.2.2) (2020-04-02)

**Note:** Version bump only for package @agoric/captp





## [1.2.2-alpha.0](https://github.com/Agoric/agoric-sdk/compare/@agoric/captp@1.2.1...@agoric/captp@1.2.2-alpha.0) (2020-04-02)

**Note:** Version bump only for package @agoric/captp





## 1.2.1 (2020-03-26)


### Bug Fixes

* **captp:** use new @agoric/eventual-send interface ([d1201a1](https://github.com/Agoric/CapTP/commit/d1201a1a1de324ae5e21736057f3bb03f97d2bc7))
* **eventual-send:** Update the API throughout agoric-sdk ([97fc1e7](https://github.com/Agoric/CapTP/commit/97fc1e748d8e3955b29baf0e04bfa788d56dad9f))
