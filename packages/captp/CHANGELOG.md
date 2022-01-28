# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

### [1.10.11](https://github.com/endojs/endo/compare/@endo/captp@1.10.10...@endo/captp@1.10.11) (2022-01-27)


### Bug Fixes

* Publish all materials consistently ([#1021](https://github.com/endojs/endo/issues/1021)) ([a2c74d9](https://github.com/endojs/endo/commit/a2c74d9de68a325761d62e1b2187a117ef884571))



### [1.10.10](https://github.com/endojs/endo/compare/@endo/captp@1.10.9...@endo/captp@1.10.10) (2022-01-25)

**Note:** Version bump only for package @endo/captp





### 1.10.9 (2022-01-23)


### Bug Fixes

* **captp:** Windows test support ([67c8cc1](https://github.com/endojs/endo/commit/67c8cc1ced1c8be8dc8b795e56198b0dc5da1e7b))



### [1.10.8](https://github.com/Agoric/agoric-sdk/compare/@agoric/captp@1.10.7...@agoric/captp@1.10.8) (2021-12-22)

**Note:** Version bump only for package @agoric/captp





### [1.10.7](https://github.com/Agoric/agoric-sdk/compare/@agoric/captp@1.10.6...@agoric/captp@1.10.7) (2021-12-02)

**Note:** Version bump only for package @agoric/captp





### [1.10.6](https://github.com/Agoric/agoric-sdk/compare/@agoric/captp@1.10.5...@agoric/captp@1.10.6) (2021-10-13)

**Note:** Version bump only for package @agoric/captp





### [1.10.5](https://github.com/Agoric/agoric-sdk/compare/@agoric/captp@1.10.4...@agoric/captp@1.10.5) (2021-09-23)

**Note:** Version bump only for package @agoric/captp





### [1.10.4](https://github.com/Agoric/agoric-sdk/compare/@agoric/captp@1.10.3...@agoric/captp@1.10.4) (2021-09-15)


### Bug Fixes

* more missing Fars. kill "this" ([#3746](https://github.com/Agoric/agoric-sdk/issues/3746)) ([7bd027a](https://github.com/Agoric/agoric-sdk/commit/7bd027a879f98a9a3f30429ee1b54e6057efec42))



### [1.10.3](https://github.com/Agoric/agoric-sdk/compare/@agoric/captp@1.10.2...@agoric/captp@1.10.3) (2021-08-18)

**Note:** Version bump only for package @agoric/captp





### [1.10.2](https://github.com/Agoric/agoric-sdk/compare/@agoric/captp@1.10.1...@agoric/captp@1.10.2) (2021-08-17)

**Note:** Version bump only for package @agoric/captp





### [1.10.1](https://github.com/Agoric/agoric-sdk/compare/@agoric/captp@1.10.0...@agoric/captp@1.10.1) (2021-08-16)


### Bug Fixes

* remove more instances of `.cjs` files ([0f61d9b](https://github.com/Agoric/agoric-sdk/commit/0f61d9bff763aeb21c7b61010040ca5e7bd964eb))



## [1.10.0](https://github.com/Agoric/agoric-sdk/compare/@agoric/captp@1.7.20...@agoric/captp@1.10.0) (2021-08-15)

### 0.26.10 (2021-07-28)


### Features

* **captp:** leverage makeSubscriptionKit to drive trapHost ([a350b9d](https://github.com/Agoric/agoric-sdk/commit/a350b9d4688bd156655e519dec9fe291b7353427))
* **captp:** return Sync replies via arbitrary comm protocol ([c838e91](https://github.com/Agoric/agoric-sdk/commit/c838e918164fc136b0bcbd83029489c6893ea381))
* **captp:** take suggestion in [#3289](https://github.com/Agoric/agoric-sdk/issues/3289) to prefix questionIDs ([a8e0e96](https://github.com/Agoric/agoric-sdk/commit/a8e0e965f7640dc1a1e75b15d4788916e9cd563e))
* implement exportAsSyncable, and Sync powers ([714b214](https://github.com/Agoric/agoric-sdk/commit/714b214012e81faf2ac4955475a8504ef0c74a4a))
* implement Sync for makeLoopback ([3d500a1](https://github.com/Agoric/agoric-sdk/commit/3d500a101d73995d434cbb48b9f5be206a076ed7))


### Bug Fixes

* **captp:** clarify error handling ([21b72cd](https://github.com/Agoric/agoric-sdk/commit/21b72cd54ec95e9fcc86638086c7c0c09a3e71cf))
* **captp:** don't rely on TextDecoder stream flag ([5a370a8](https://github.com/Agoric/agoric-sdk/commit/5a370a8404124409e5bbdf60c4ccf494fde8b103))
* **captp:** ensure Sync(x) never returns a thenable ([d642c41](https://github.com/Agoric/agoric-sdk/commit/d642c414bd22036a72ab6db590d26393efd05568))
* **captp:** ensure trapcap reply iteration is serial ([feda6c8](https://github.com/Agoric/agoric-sdk/commit/feda6c8510f56385c2becec40412223b4acf109d))
* **captp:** more robust CTP_TRAP_ITERATE error handling ([003c3d1](https://github.com/Agoric/agoric-sdk/commit/003c3d16dc2301ae171d9cc60ab30509fa7ee9ea))
* **captp:** properly export src/index.js ([592f0b7](https://github.com/Agoric/agoric-sdk/commit/592f0b78b6adcd2956c925b8294ed9452ff4c9bb))
* **captp:** relax it.throw signature ([6fc842c](https://github.com/Agoric/agoric-sdk/commit/6fc842cc3160f134455a250c8a13418e07301848))
* **solo:** clean up unnecessary deep captp import ([8b20562](https://github.com/Agoric/agoric-sdk/commit/8b20562b9cc3917818455ab7d85aa74c9efb3f56))
* break up incoherent GetApply function into SyncImpl record ([1455298](https://github.com/Agoric/agoric-sdk/commit/14552986c6e47fde7eae720e449efce5aab23707))
* don't create new promise IDs and stall the pipeline ([b90ae08](https://github.com/Agoric/agoric-sdk/commit/b90ae0835aec5484279eddcea4e9ccaa253d2db0))



## [1.9.0](https://github.com/Agoric/agoric-sdk/compare/@agoric/captp@1.7.20...@agoric/captp@1.9.0) (2021-08-14)

### 0.26.10 (2021-07-28)


### Features

* **captp:** leverage makeSubscriptionKit to drive trapHost ([a350b9d](https://github.com/Agoric/agoric-sdk/commit/a350b9d4688bd156655e519dec9fe291b7353427))
* **captp:** return Sync replies via arbitrary comm protocol ([c838e91](https://github.com/Agoric/agoric-sdk/commit/c838e918164fc136b0bcbd83029489c6893ea381))
* **captp:** take suggestion in [#3289](https://github.com/Agoric/agoric-sdk/issues/3289) to prefix questionIDs ([a8e0e96](https://github.com/Agoric/agoric-sdk/commit/a8e0e965f7640dc1a1e75b15d4788916e9cd563e))
* implement exportAsSyncable, and Sync powers ([714b214](https://github.com/Agoric/agoric-sdk/commit/714b214012e81faf2ac4955475a8504ef0c74a4a))
* implement Sync for makeLoopback ([3d500a1](https://github.com/Agoric/agoric-sdk/commit/3d500a101d73995d434cbb48b9f5be206a076ed7))


### Bug Fixes

* **captp:** clarify error handling ([21b72cd](https://github.com/Agoric/agoric-sdk/commit/21b72cd54ec95e9fcc86638086c7c0c09a3e71cf))
* **captp:** don't rely on TextDecoder stream flag ([5a370a8](https://github.com/Agoric/agoric-sdk/commit/5a370a8404124409e5bbdf60c4ccf494fde8b103))
* **captp:** ensure Sync(x) never returns a thenable ([d642c41](https://github.com/Agoric/agoric-sdk/commit/d642c414bd22036a72ab6db590d26393efd05568))
* **captp:** ensure trapcap reply iteration is serial ([feda6c8](https://github.com/Agoric/agoric-sdk/commit/feda6c8510f56385c2becec40412223b4acf109d))
* **captp:** more robust CTP_TRAP_ITERATE error handling ([003c3d1](https://github.com/Agoric/agoric-sdk/commit/003c3d16dc2301ae171d9cc60ab30509fa7ee9ea))
* **captp:** properly export src/index.js ([592f0b7](https://github.com/Agoric/agoric-sdk/commit/592f0b78b6adcd2956c925b8294ed9452ff4c9bb))
* **captp:** relax it.throw signature ([6fc842c](https://github.com/Agoric/agoric-sdk/commit/6fc842cc3160f134455a250c8a13418e07301848))
* **solo:** clean up unnecessary deep captp import ([8b20562](https://github.com/Agoric/agoric-sdk/commit/8b20562b9cc3917818455ab7d85aa74c9efb3f56))
* break up incoherent GetApply function into SyncImpl record ([1455298](https://github.com/Agoric/agoric-sdk/commit/14552986c6e47fde7eae720e449efce5aab23707))
* don't create new promise IDs and stall the pipeline ([b90ae08](https://github.com/Agoric/agoric-sdk/commit/b90ae0835aec5484279eddcea4e9ccaa253d2db0))



## [1.8.0](https://github.com/Agoric/agoric-sdk/compare/@agoric/captp@1.7.20...@agoric/captp@1.8.0) (2021-07-28)


### Features

* **captp:** leverage makeSubscriptionKit to drive trapHost ([a350b9d](https://github.com/Agoric/agoric-sdk/commit/a350b9d4688bd156655e519dec9fe291b7353427))
* **captp:** return Sync replies via arbitrary comm protocol ([c838e91](https://github.com/Agoric/agoric-sdk/commit/c838e918164fc136b0bcbd83029489c6893ea381))
* **captp:** take suggestion in [#3289](https://github.com/Agoric/agoric-sdk/issues/3289) to prefix questionIDs ([a8e0e96](https://github.com/Agoric/agoric-sdk/commit/a8e0e965f7640dc1a1e75b15d4788916e9cd563e))
* implement exportAsSyncable, and Sync powers ([714b214](https://github.com/Agoric/agoric-sdk/commit/714b214012e81faf2ac4955475a8504ef0c74a4a))
* implement Sync for makeLoopback ([3d500a1](https://github.com/Agoric/agoric-sdk/commit/3d500a101d73995d434cbb48b9f5be206a076ed7))


### Bug Fixes

* **captp:** clarify error handling ([21b72cd](https://github.com/Agoric/agoric-sdk/commit/21b72cd54ec95e9fcc86638086c7c0c09a3e71cf))
* **captp:** don't rely on TextDecoder stream flag ([5a370a8](https://github.com/Agoric/agoric-sdk/commit/5a370a8404124409e5bbdf60c4ccf494fde8b103))
* **captp:** ensure Sync(x) never returns a thenable ([d642c41](https://github.com/Agoric/agoric-sdk/commit/d642c414bd22036a72ab6db590d26393efd05568))
* **captp:** ensure trapcap reply iteration is serial ([feda6c8](https://github.com/Agoric/agoric-sdk/commit/feda6c8510f56385c2becec40412223b4acf109d))
* **captp:** more robust CTP_TRAP_ITERATE error handling ([003c3d1](https://github.com/Agoric/agoric-sdk/commit/003c3d16dc2301ae171d9cc60ab30509fa7ee9ea))
* **captp:** properly export src/index.js ([592f0b7](https://github.com/Agoric/agoric-sdk/commit/592f0b78b6adcd2956c925b8294ed9452ff4c9bb))
* **captp:** relax it.throw signature ([6fc842c](https://github.com/Agoric/agoric-sdk/commit/6fc842cc3160f134455a250c8a13418e07301848))
* **solo:** clean up unnecessary deep captp import ([8b20562](https://github.com/Agoric/agoric-sdk/commit/8b20562b9cc3917818455ab7d85aa74c9efb3f56))
* break up incoherent GetApply function into SyncImpl record ([1455298](https://github.com/Agoric/agoric-sdk/commit/14552986c6e47fde7eae720e449efce5aab23707))
* don't create new promise IDs and stall the pipeline ([b90ae08](https://github.com/Agoric/agoric-sdk/commit/b90ae0835aec5484279eddcea4e9ccaa253d2db0))



### [1.7.20](https://github.com/Agoric/agoric-sdk/compare/@agoric/captp@1.7.19...@agoric/captp@1.7.20) (2021-07-01)

**Note:** Version bump only for package @agoric/captp





### [1.7.19](https://github.com/Agoric/agoric-sdk/compare/@agoric/captp@1.7.18...@agoric/captp@1.7.19) (2021-06-28)

**Note:** Version bump only for package @agoric/captp





### [1.7.18](https://github.com/Agoric/agoric-sdk/compare/@agoric/captp@1.7.17...@agoric/captp@1.7.18) (2021-06-25)

**Note:** Version bump only for package @agoric/captp





### [1.7.17](https://github.com/Agoric/agoric-sdk/compare/@agoric/captp@1.7.16...@agoric/captp@1.7.17) (2021-06-24)

**Note:** Version bump only for package @agoric/captp





### [1.7.16](https://github.com/Agoric/agoric-sdk/compare/@agoric/captp@1.7.15...@agoric/captp@1.7.16) (2021-06-23)

**Note:** Version bump only for package @agoric/captp





### [1.7.15](https://github.com/Agoric/agoric-sdk/compare/@agoric/captp@1.7.14...@agoric/captp@1.7.15) (2021-06-16)

**Note:** Version bump only for package @agoric/captp





### [1.7.14](https://github.com/Agoric/agoric-sdk/compare/@agoric/captp@1.7.13...@agoric/captp@1.7.14) (2021-06-15)


### Bug Fixes

* Pin ESM to forked version ([54dbb55](https://github.com/Agoric/agoric-sdk/commit/54dbb55d64d7ff7adb395bc4bd9d1461dd2d3c17))



## [1.7.13](https://github.com/Agoric/agoric-sdk/compare/@agoric/captp@1.7.12...@agoric/captp@1.7.13) (2021-05-10)

**Note:** Version bump only for package @agoric/captp





## [1.7.12](https://github.com/Agoric/agoric-sdk/compare/@agoric/captp@1.7.11...@agoric/captp@1.7.12) (2021-05-05)

**Note:** Version bump only for package @agoric/captp





## [1.7.11](https://github.com/Agoric/agoric-sdk/compare/@agoric/captp@1.7.10...@agoric/captp@1.7.11) (2021-05-05)

**Note:** Version bump only for package @agoric/captp





## [1.7.10](https://github.com/Agoric/agoric-sdk/compare/@agoric/captp@1.7.9...@agoric/captp@1.7.10) (2021-04-22)

**Note:** Version bump only for package @agoric/captp





## [1.7.9](https://github.com/Agoric/agoric-sdk/compare/@agoric/captp@1.7.8...@agoric/captp@1.7.9) (2021-04-18)

**Note:** Version bump only for package @agoric/captp





## [1.7.8](https://github.com/Agoric/agoric-sdk/compare/@agoric/captp@1.7.7...@agoric/captp@1.7.8) (2021-04-16)

**Note:** Version bump only for package @agoric/captp





## [1.7.7](https://github.com/Agoric/agoric-sdk/compare/@agoric/captp@1.7.6...@agoric/captp@1.7.7) (2021-04-14)

**Note:** Version bump only for package @agoric/captp





## [1.7.6](https://github.com/Agoric/agoric-sdk/compare/@agoric/captp@1.7.5...@agoric/captp@1.7.6) (2021-04-07)

**Note:** Version bump only for package @agoric/captp





## [1.7.5](https://github.com/Agoric/agoric-sdk/compare/@agoric/captp@1.7.4...@agoric/captp@1.7.5) (2021-04-06)

**Note:** Version bump only for package @agoric/captp





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
