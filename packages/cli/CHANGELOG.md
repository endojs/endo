# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

### [2.1.1](https://github.com/endojs/endo/compare/@endo/cli@2.1.0...@endo/cli@2.1.1) (2024-04-04)

**Note:** Version bump only for package @endo/cli





## [2.1.0](https://github.com/endojs/endo/compare/@endo/cli@2.0.0...@endo/cli@2.1.0) (2024-03-20)


### Features

* **cli:** Follow list changes ([c5eb0f1](https://github.com/endojs/endo/commit/c5eb0f113dbd8cc54d067eab97d836f701cbc927))


### Bug Fixes

* **cli:** Chat demo needs followChanges rename ([3fa3d9b](https://github.com/endojs/endo/commit/3fa3d9b02ec029c3e26ae946dbbe6cf689be4be0))



## [2.0.0](https://github.com/endojs/endo/compare/@endo/cli@1.0.3...@endo/cli@2.0.0) (2024-02-23)


### ⚠ BREAKING CHANGES

* **daemon:** Change unsafe import formula from path to specifier
* **daemon,cli:** Rename internals using "unsafe"
* **cli:** Rename --UNSAFE to --UNCONFINED
* **cli:** Remove archive commands in favor of bundles
* **cli:** Remove hash command (redundant with bundle)

### Features

* **cli,daemon:** Make packages private ([986af72](https://github.com/endojs/endo/commit/986af720a64af07a4e5d6435ed9820727f2f283f))
* **cli,daemon:** Support dot-delimited petname paths in eval ([d35bbe2](https://github.com/endojs/endo/commit/d35bbe23f9f0bdea928e5b8f6b50328a90f9c71f))
* **cli:** Add adopt command ([b056164](https://github.com/endojs/endo/commit/b0561642828b4ec382b106f2116a8bc4d8c9a07d))
* **cli:** Add bundle command ([7cf294a](https://github.com/endojs/endo/commit/7cf294a7e59850254f5b0462615071de4ca42f43))
* **cli:** Add dismiss message command ([3d8ee2c](https://github.com/endojs/endo/commit/3d8ee2c996e7a3b987df9e9073acfe697286120d))
* **cli:** Add endo bin to package descriptor ([291713e](https://github.com/endojs/endo/commit/291713e3f2c3b1401e0a7037fe1badd50cba196f))
* **cli:** Add follow inbox flag ([afb86f6](https://github.com/endojs/endo/commit/afb86f6ca193c827100945a9eecd88c1e13b92b9))
* **cli:** Add import-bundle0 command ([c6ac0ab](https://github.com/endojs/endo/commit/c6ac0ab54bf015e1e2e6d9d50c7433e93e4ad88d))
* **cli:** Add import-unsafe0 command ([df70f42](https://github.com/endojs/endo/commit/df70f426fba89894160d73dda27f5475d63af23d))
* **cli:** Add install --open flag ([3a4fc45](https://github.com/endojs/endo/commit/3a4fc457a592c7530c3917339a3c0f42b540bb85))
* **cli:** Add list pet names command ([102ec83](https://github.com/endojs/endo/commit/102ec83aecfb7efef06a01a3f510c723d6935008))
* **cli:** Add open command ([5b6a00a](https://github.com/endojs/endo/commit/5b6a00acd31cf98fb8076f275c62244bffea4a0d))
* **cli:** Add receive message command ([547ce4d](https://github.com/endojs/endo/commit/547ce4d4d58a4a20d83445016767fb9f4e7d4bba))
* **cli:** Add send command ([e4d64e2](https://github.com/endojs/endo/commit/e4d64e2bad7f39f14e965ccfe5cf5013d90b0e87))
* **cli:** can specify introducedNames in mkhost and mkguest ([eb3bb85](https://github.com/endojs/endo/commit/eb3bb854295902fb205abbc8b2d29ca1f728f803))
* **cli:** Cat command ([a380297](https://github.com/endojs/endo/commit/a3802972b615d18a918023c369f1a9deb11567af))
* **cli:** Demo support for message send ([378c81e](https://github.com/endojs/endo/commit/378c81e26c016784d064641ef722264706b7ace7))
* **cli:** Eval in worker ([463c6e6](https://github.com/endojs/endo/commit/463c6e693952cccb7e71e769f4b0b93fb83e3d6f))
* **cli:** Extract install from open command ([512a645](https://github.com/endojs/endo/commit/512a64538bdeccc3bd75f5ac6c4b2034168cfd89))
* **cli:** Familiar Chat pet name inventory ([7cb7e5a](https://github.com/endojs/endo/commit/7cb7e5a66ba97bd634c3dd7d62168a42932c6735))
* **cli:** Follow command ([b029b5f](https://github.com/endojs/endo/commit/b029b5fe77b60ef230f82892bced8269bf9bbe4a))
* **cli:** Generalize request method so it is suitable for the host ([6d95690](https://github.com/endojs/endo/commit/6d95690c5697e7521c96ae8a5baead6fbea8a7a2))
* **cli:** Inbox support for package type messages ([c423281](https://github.com/endojs/endo/commit/c423281eae174ab7bbb3ba4d6b1a66d0f2479a21))
* **cli:** Inbox, resolve, and reject commands ([f50320d](https://github.com/endojs/endo/commit/f50320d5a6fd10ac82e115b1e0b80c9fc97ce830))
* **cli:** kill command ([e4cf09e](https://github.com/endojs/endo/commit/e4cf09e84285e8bc4c469ec0a0b0890c10f3c8e1))
* **cli:** List all, list special ([e0de1ff](https://github.com/endojs/endo/commit/e0de1ff28995969c9f95414b29fe253741c26940))
* **cli:** List named directory ([df056e5](https://github.com/endojs/endo/commit/df056e5a11f662d6004862ff46e1ed35fe3c4ab9))
* **cli:** Log follow option ([2296c62](https://github.com/endojs/endo/commit/2296c62d9d080d784e37bde4ef2ecc1fe5874287))
* **cli:** Log follow watches for reset ([f6bd1d6](https://github.com/endojs/endo/commit/f6bd1d6c939e33b32f1d1e0fb6da42b93c3fd2d1))
* **cli:** Rename --UNSAFE to --UNCONFINED ([ba33e82](https://github.com/endojs/endo/commit/ba33e82e3de063665ee85c0f7ab0a30c8f7a6018))
* **cli:** Show pet name ([3f5e983](https://github.com/endojs/endo/commit/3f5e98321f8cb0d6c1ccfd38480ad91693b7610e))
* **cli:** Spawn for multiple workers ([c9f1fe8](https://github.com/endojs/endo/commit/c9f1fe8b3f1fa54117b6062bd98e1aab88c26e93))
* **cli:** Spawn worker ([659d347](https://github.com/endojs/endo/commit/659d3473977c58b6862cec31ce40385478aec849))
* **cli:** Start daemon on demand ([26243d4](https://github.com/endojs/endo/commit/26243d48ab17871a246df3d5c97471befb225aeb))
* **cli:** Store archive as pet name ([3f022b4](https://github.com/endojs/endo/commit/3f022b4997f14d5f7423163d5e9dda201be0ac12))
* **cli:** Store readable blob ([1e1f41b](https://github.com/endojs/endo/commit/1e1f41bd47c8cbb11faa6389b0cd5e15c6db0680))
* **cli:** Support dot-delimited paths for `--as` option ([9848676](https://github.com/endojs/endo/commit/9848676ddbd7ccee88a78635462d75f08c7ed46a))
* **cli:** Support runlets ([8ce61be](https://github.com/endojs/endo/commit/8ce61be38ff5c942624e278ba2639b6fff5747d2))
* **cli:** Thread ephemeral state path ([e4e9917](https://github.com/endojs/endo/commit/e4e99171eb1d4f0e54652fb05ff685cff783af76))
* **daemon,cli:** Rename internals using "unsafe" ([5623d60](https://github.com/endojs/endo/commit/5623d608056586c33d3d35798d8171d6ac69c5a5))
* **daemon:** Reify inboxes and outboxes ([11f86a5](https://github.com/endojs/endo/commit/11f86a552d25570596ef20fc0928989abcdb8687))
* endo bundle command supports specifying commonDeps ([d570060](https://github.com/endojs/endo/commit/d570060fd07bb5f01af478fb9b452671d0479a4d))


### Bug Fixes

* Appease lint harder ([3eaba38](https://github.com/endojs/endo/commit/3eaba3818af7d9acdb1fbdb2cb353b18b8661ec4))
* **cli:** Appease TypeScript ([4ece3f8](https://github.com/endojs/endo/commit/4ece3f828e833d57b57e6ff587e2cb6d5435b095))
* **cli:** Commands do not flush unless you await the result ([04a9af2](https://github.com/endojs/endo/commit/04a9af2862c77ac86678a0a70f6d4360a9a53226))
* **cli:** Compensate for new request recipient name argument ([bc0a6ce](https://github.com/endojs/endo/commit/bc0a6ce3e74859a2d60193c52f851002d8da27eb))
* **cli:** Correct command description kebab-case inconsistency ([6c1439b](https://github.com/endojs/endo/commit/6c1439bdd3f087e22f435832f1c0a15a64e6f74f))
* **cli:** Corrections for demo instructions ([81b4651](https://github.com/endojs/endo/commit/81b4651b5b0bdf679b086b10d6dba89c35d7d4d7))
* **cli:** Improve log behavior when stopped ([56c9138](https://github.com/endojs/endo/commit/56c9138742fd3f43cdb4f45b45a2aad038ab0d2c))
* **cli:** Minor adopt description typo ([87e4922](https://github.com/endojs/endo/commit/87e49224a860c555397e6879f5c4ccfcf767cb54))
* **cli:** Remove console debug line ([dd131ad](https://github.com/endojs/endo/commit/dd131ad0f0f3fbf7deb4e8c3da827cc80f4c5493))
* **cli:** Remove receive (duplicative with send) ([d77cd79](https://github.com/endojs/endo/commit/d77cd79e1378123b7188e45451226931698c3f6e))
* **cli:** Remove unused arguments to command handlers ([c30e7b3](https://github.com/endojs/endo/commit/c30e7b3adab609d05e27d4858e78d64c62b3bf33))
* Relax lint for optional chaining and nullish coallescing for daemon ([ff58c06](https://github.com/endojs/endo/commit/ff58c065130b774ccb3c9cddbb7562505f0e43a0))
* Settle the readable types ([6716862](https://github.com/endojs/endo/commit/6716862fca6dee0ad685d163101f157fd66682b0))


### Miscellaneous Chores

* **cli:** Remove archive commands in favor of bundles ([b24132a](https://github.com/endojs/endo/commit/b24132a48513599e4818977117852af3515f4765))
* **cli:** Remove hash command (redundant with bundle) ([7ea4074](https://github.com/endojs/endo/commit/7ea4074fa9911929ed0e4fa2de17b927fe1822e6))


### Code Refactoring

* **daemon:** Change unsafe import formula from path to specifier ([a0f141f](https://github.com/endojs/endo/commit/a0f141f20e059e9988d9117c066f23f1bcbff559))



### [1.0.3](https://github.com/endojs/endo/compare/@endo/cli@1.0.2...@endo/cli@1.0.3) (2024-02-15)


### Bug Fixes

* Add repository directory to all package descriptors ([e5f36e7](https://github.com/endojs/endo/commit/e5f36e7a321c13ee25e74eb74d2a5f3d7517119c))



### [1.0.2](https://github.com/endojs/endo/compare/@endo/cli@1.0.1...@endo/cli@1.0.2) (2024-01-18)

**Note:** Version bump only for package @endo/cli





### [1.0.1](https://github.com/endojs/endo/compare/@endo/cli@1.0.0...@endo/cli@1.0.1) (2023-12-20)

**Note:** Version bump only for package @endo/cli





## [1.0.0](https://github.com/endojs/endo/compare/@endo/cli@0.2.6...@endo/cli@1.0.0) (2023-12-12)


### Bug Fixes

* Adjust type generation in release process and CI ([9465be3](https://github.com/endojs/endo/commit/9465be369e53167815ca444f6293a8e9eb48501d))



### [0.2.6](https://github.com/endojs/endo/compare/@endo/cli@0.2.5...@endo/cli@0.2.6) (2023-09-12)

**Note:** Version bump only for package @endo/cli





### [0.2.5](https://github.com/endojs/endo/compare/@endo/cli@0.2.3...@endo/cli@0.2.5) (2023-08-07)

**Note:** Version bump only for package @endo/cli





### [0.2.4](https://github.com/endojs/endo/compare/@endo/cli@0.2.3...@endo/cli@0.2.4) (2023-08-07)

**Note:** Version bump only for package @endo/cli





### [0.2.3](https://github.com/endojs/endo/compare/@endo/cli@0.2.2...@endo/cli@0.2.3) (2023-07-19)

**Note:** Version bump only for package @endo/cli





### [0.2.2](https://github.com/endojs/endo/compare/@endo/cli@0.2.1...@endo/cli@0.2.2) (2023-04-20)

**Note:** Version bump only for package @endo/cli

### [0.2.1](https://github.com/endojs/endo/compare/@endo/cli@0.2.0...@endo/cli@0.2.1) (2023-04-14)

**Note:** Version bump only for package @endo/cli

## [0.2.0](https://github.com/endojs/endo/compare/@endo/cli@0.1.24...@endo/cli@0.2.0) (2023-03-07)

### ⚠ BREAKING CHANGES

- **where:** Thread OS info

### Bug Fixes

- **cli:** Fix hash, map, and hash-archive commands ([2a0a312](https://github.com/endojs/endo/commit/2a0a31206fe5144bac7e3754a4b88fbb883eb8d7))
- Fix hackerone.com links in SECURITY.md ([#1472](https://github.com/endojs/endo/issues/1472)) ([389733d](https://github.com/endojs/endo/commit/389733dbc7a74992f909c38d27ea7e8e68623959))
- **where:** Thread OS info ([b7c2441](https://github.com/endojs/endo/commit/b7c24412250b45984964156894efb72ef72ac3f6))

### [0.1.24](https://github.com/endojs/endo/compare/@endo/cli@0.1.23...@endo/cli@0.1.24) (2022-12-23)

### Features

- **cli:** Add log and ping subcommands ([aa80678](https://github.com/endojs/endo/commit/aa80678ea171bd9b0f0e8e4c1f63547fe7fac0bc))

### [0.1.23](https://github.com/endojs/endo/compare/@endo/cli@0.1.22...@endo/cli@0.1.23) (2022-11-14)

**Note:** Version bump only for package @endo/cli

### [0.1.22](https://github.com/endojs/endo/compare/@endo/cli@0.1.21...@endo/cli@0.1.22) (2022-10-24)

**Note:** Version bump only for package @endo/cli

### [0.1.21](https://github.com/endojs/endo/compare/@endo/cli@0.1.20...@endo/cli@0.1.21) (2022-10-19)

**Note:** Version bump only for package @endo/cli

### [0.1.20](https://github.com/endojs/endo/compare/@endo/cli@0.1.19...@endo/cli@0.1.20) (2022-09-27)

**Note:** Version bump only for package @endo/cli

### [0.1.19](https://github.com/endojs/endo/compare/@endo/cli@0.1.18...@endo/cli@0.1.19) (2022-09-14)

**Note:** Version bump only for package @endo/cli

### [0.1.18](https://github.com/endojs/endo/compare/@endo/cli@0.1.17...@endo/cli@0.1.18) (2022-08-26)

**Note:** Version bump only for package @endo/cli

### [0.1.17](https://github.com/endojs/endo/compare/@endo/cli@0.1.16...@endo/cli@0.1.17) (2022-08-26)

**Note:** Version bump only for package @endo/cli

### [0.1.16](https://github.com/endojs/endo/compare/@endo/cli@0.1.15...@endo/cli@0.1.16) (2022-08-25)

**Note:** Version bump only for package @endo/cli

### [0.1.15](https://github.com/endojs/endo/compare/@endo/cli@0.1.14...@endo/cli@0.1.15) (2022-08-23)

**Note:** Version bump only for package @endo/cli

### [0.1.14](https://github.com/endojs/endo/compare/@endo/cli@0.1.13...@endo/cli@0.1.14) (2022-06-28)

**Note:** Version bump only for package @endo/cli

### [0.1.13](https://github.com/endojs/endo/compare/@endo/cli@0.1.12...@endo/cli@0.1.13) (2022-06-11)

**Note:** Version bump only for package @endo/cli

### [0.1.12](https://github.com/endojs/endo/compare/@endo/cli@0.1.11...@endo/cli@0.1.12) (2022-04-15)

**Note:** Version bump only for package @endo/cli

### [0.1.11](https://github.com/endojs/endo/compare/@endo/cli@0.1.10...@endo/cli@0.1.11) (2022-04-14)

**Note:** Version bump only for package @endo/cli

### [0.1.10](https://github.com/endojs/endo/compare/@endo/cli@0.1.9...@endo/cli@0.1.10) (2022-04-13)

### Bug Fixes

- Revert dud release ([c8a7101](https://github.com/endojs/endo/commit/c8a71017d8d7af10a97909c9da9c5c7e59aed939))

### [0.1.9](https://github.com/endojs/endo/compare/@endo/cli@0.1.8...@endo/cli@0.1.9) (2022-04-12)

**Note:** Version bump only for package @endo/cli

### [0.1.8](https://github.com/endojs/endo/compare/@endo/cli@0.1.7...@endo/cli@0.1.8) (2022-03-07)

**Note:** Version bump only for package @endo/cli

### [0.1.7](https://github.com/endojs/endo/compare/@endo/cli@0.1.6...@endo/cli@0.1.7) (2022-03-02)

**Note:** Version bump only for package @endo/cli

### [0.1.6](https://github.com/endojs/endo/compare/@endo/cli@0.1.5...@endo/cli@0.1.6) (2022-02-20)

**Note:** Version bump only for package @endo/cli

### [0.1.5](https://github.com/endojs/endo/compare/@endo/cli@0.1.4...@endo/cli@0.1.5) (2022-02-18)

### Features

- **cli:** Add endo reset command ([470b33c](https://github.com/endojs/endo/commit/470b33c1413600191f3b0022ea106f12c2aa6dd2))

### Bug Fixes

- Make jsconfigs less brittle ([861ca32](https://github.com/endojs/endo/commit/861ca32a72f0a48410fd93b1cbaaad9139590659))
- Make sure lint:type runs correctly in CI ([a520419](https://github.com/endojs/endo/commit/a52041931e72cb7b7e3e21dde39c099cc9f262b0))
- Unify TS version to ~4.2 ([5fb173c](https://github.com/endojs/endo/commit/5fb173c05c9427dca5adfe66298c004780e8b86c))
- **cli:** Add missing dependencies ([72281f4](https://github.com/endojs/endo/commit/72281f4100c782c79856c8a792b85d8ef9604076))
- **daemon:** Move init from lib to app ([7aaf1a0](https://github.com/endojs/endo/commit/7aaf1a07d2950b16f7202ecc1d281386ba812d67))

### [0.1.4](https://github.com/endojs/endo/compare/@endo/cli@0.1.3...@endo/cli@0.1.4) (2022-01-31)

**Note:** Version bump only for package @endo/cli

### [0.1.3](https://github.com/endojs/endo/compare/@endo/cli@0.1.2...@endo/cli@0.1.3) (2022-01-27)

### Bug Fixes

- Publish all materials consistently ([#1021](https://github.com/endojs/endo/issues/1021)) ([a2c74d9](https://github.com/endojs/endo/commit/a2c74d9de68a325761d62e1b2187a117ef884571))

### [0.1.2](https://github.com/endojs/endo/compare/@endo/cli@0.1.1...@endo/cli@0.1.2) (2022-01-25)

**Note:** Version bump only for package @endo/cli

### 0.1.1 (2022-01-23)

### Features

- **endo:** Initial implementation of daemon, cli, where ([91f0ba3](https://github.com/endojs/endo/commit/91f0ba33201ae00624c84fe8cc99e7928ac44fdf))
