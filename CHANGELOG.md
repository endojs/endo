# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

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
