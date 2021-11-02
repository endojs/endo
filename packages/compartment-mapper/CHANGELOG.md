# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

### [0.5.5](https://github.com/endojs/endo/compare/@endo/compartment-mapper@0.5.4...@endo/compartment-mapper@0.5.5) (2021-11-02)

**Note:** Version bump only for package @endo/compartment-mapper





### [0.5.4](https://github.com/endojs/endo/compare/@endo/compartment-mapper@0.5.3...@endo/compartment-mapper@0.5.4) (2021-10-15)

**Note:** Version bump only for package @endo/compartment-mapper





### [0.5.3](https://github.com/endojs/endo/compare/@endo/compartment-mapper@0.5.2...@endo/compartment-mapper@0.5.3) (2021-09-18)


### Bug Fixes

* **compartment-mapper:** Reduce pre-cjs dependence on URL ([#894](https://github.com/endojs/endo/issues/894)) ([b9f6dc0](https://github.com/endojs/endo/commit/b9f6dc07f249cb47866f623728faf0b74d509fd2))



### [0.5.2](https://github.com/endojs/endo/compare/@endo/compartment-mapper@0.5.1...@endo/compartment-mapper@0.5.2) (2021-08-14)

**Note:** Version bump only for package @endo/compartment-mapper





### [0.5.1](https://github.com/endojs/endo/compare/@endo/compartment-mapper@0.5.0...@endo/compartment-mapper@0.5.1) (2021-08-13)


### Features

* **compartment-mapper:** Support reflexive imports ([#861](https://github.com/endojs/endo/issues/861)) ([09e5485](https://github.com/endojs/endo/commit/09e548558d14d6a7bff17c3b2df686122218d345))



## [0.5.0](https://github.com/endojs/endo/compare/@endo/compartment-mapper@0.4.1...@endo/compartment-mapper@0.5.0) (2021-07-22)


### ⚠ BREAKING CHANGES

* Update preamble for SES StaticModuleRecord

### Features

* **compartment-mapper:** Consistent hashing ([fba461f](https://github.com/endojs/endo/commit/fba461f2786e1f9569c1bfb839e03d45cee7d2a6))


### Bug Fixes

* Update preamble for SES StaticModuleRecord ([790ed01](https://github.com/endojs/endo/commit/790ed01f0aa73ff2d232e69c9323ee0bb448c2b0))
* **compartment-map:** Restore test fixture maker and support for exit modules from archives ([0ccc277](https://github.com/endojs/endo/commit/0ccc277e2083d89aaf97f70a0900fe6692a4ee45))
* **compartment-mapper:** Adjust bundle calling convention for preamble ([5a43a8e](https://github.com/endojs/endo/commit/5a43a8ea8759a223f2dedf88a1ea7b1e276b81e3))



### [0.4.1](https://github.com/endojs/endo/compare/@endo/compartment-mapper@0.4.0...@endo/compartment-mapper@0.4.1) (2021-06-20)


### Bug Fixes

* **compartment-mapper:** Export types properly ([54be905](https://github.com/endojs/endo/commit/54be905895e9ebdae69b7542f6c4d7ff3660c2ea))
* **compartment-mapper:** Propagate explicit types ([289c906](https://github.com/endojs/endo/commit/289c906173a450d608f816ab83e702435ad80057))



## [0.4.0](https://github.com/endojs/endo/compare/@endo/compartment-mapper@0.3.2...@endo/compartment-mapper@0.4.0) (2021-06-16)


### ⚠ BREAKING CHANGES

* **compartment-mapper:** Required exits on archives

### Features

* **compartment-mapper:** Developer dependencies ([44f86cd](https://github.com/endojs/endo/commit/44f86cd6788b8f6bdc5492619866995ede73488b))
* **compartment-mapper:** Required exits on archives ([f5e6378](https://github.com/endojs/endo/commit/f5e6378f4c4dc2c017d3c94544a3e22d762ade27))


### Bug Fixes

* **compartment-mapper:** Missing node-powers from published files ([277fd47](https://github.com/endojs/endo/commit/277fd47e359ee90d31a521fadbac90a4853649f4))



### [0.3.2](https://github.com/endojs/endo/compare/@endo/compartment-mapper@0.3.1...@endo/compartment-mapper@0.3.2) (2021-06-14)


### Features

* **compartment-mapper:** Add actionable hint to linker error ([4dbe87b](https://github.com/endojs/endo/commit/4dbe87b40007d5ce9a084b4cf94ac254d9bd9e7a))
* **compartment-mapper:** Add Node.js power adapter ([fd16355](https://github.com/endojs/endo/commit/fd1635517ce8260d3dc2766c2c39a599f58f9a0c))
* **compartment-mapper:** Follow symbolic links ([ae553a4](https://github.com/endojs/endo/commit/ae553a469800f548975b0e1ba5bb2c63455a87f4))



### [0.3.1](https://github.com/endojs/endo/compare/@endo/compartment-mapper@0.3.0...@endo/compartment-mapper@0.3.1) (2021-06-06)

**Note:** Version bump only for package @endo/compartment-mapper





## 0.3.0 (2021-06-02)


### ⚠ BREAKING CHANGES

* **compartment-mapper:** No longer supports direct use from CommonJS
* **static-module-record:** Emphasize RESM/NESM compatibility over CJS/UMD
* **compartment-mapper:** Lean on RESM/NESM interoperability
* **compartment-mapper:** Rearrange entry point modules
* **compartment-mapper:** Cleanly separate StaticModuleRecord dependency (#698)
* **compartment-mapper:** Refresh zip fixture
* **compartment-mapper:** Temporarily disable CommonJS
* **compartment-mapper:** Rename endowments to globals
* **compartment-mapper:** Import options bags and thread transforms

### Features

* **compartment-mapper:** Add module transforms ([#625](https://github.com/endojs/endo/issues/625)) ([0a0fc02](https://github.com/endojs/endo/commit/0a0fc02c400ebf68dfdf942354c548db6a6058f7))
* **compartment-mapper:** Blanket in TypeScript definitions ([f850ed8](https://github.com/endojs/endo/commit/f850ed87fcdf943a1e347ffbe218144bee4151e8))
* **compartment-mapper:** Improve archive parser errors ([c5887d8](https://github.com/endojs/endo/commit/c5887d8c13406b9da64c5537e87b3cf29ca8893e))
* **compartment-mapper:** Introduce rudimentary bundler ([2bcddb1](https://github.com/endojs/endo/commit/2bcddb10845183074dbf5c709d9a70dadbce6dcb))
* **compartment-mapper:** Pivot to CommonJS lexical analyzer ([e68a991](https://github.com/endojs/endo/commit/e68a991a54843a447cdd2c31a390e87192a36d04))
* **compartment-mapper:** Precompiled ESM ([eb2fcc4](https://github.com/endojs/endo/commit/eb2fcc40fb5a51a433488ac111bd62bbed3655b0)), closes [#673](https://github.com/endojs/endo/issues/673)
* **compartment-mapper:** Reenable CommonJS ([e76d95e](https://github.com/endojs/endo/commit/e76d95efd7aaa367c64d4e63e0983bb47f754832))
* **compartment-mapper:** Thread compartment constructor ([f3248f2](https://github.com/endojs/endo/commit/f3248f27dc61f568f7f1a5ea61e35e04fa6887ea))
* **compartment-mapper:** Thread global lexicals ([f92379a](https://github.com/endojs/endo/commit/f92379a4bb45ff4ef5b64eea998d5d5323a3434e))
* **compartment-mapper:** Update packaging for RESM/NESM bridge and reorg under [@endo](https://github.com/endo) ([5b7c24e](https://github.com/endojs/endo/commit/5b7c24e1a473b5aa9e1397f6ca338bea8ed82984))
* **endo:** Freeze all global objects ([#631](https://github.com/endojs/endo/issues/631)) ([83b5db4](https://github.com/endojs/endo/commit/83b5db4a2b64fcf1cb8927698e0d5942439eec27))
* **ses:** Allow import and eval methods ([#669](https://github.com/endojs/endo/issues/669)) ([505a7d7](https://github.com/endojs/endo/commit/505a7d7149c36825a00c9fe3795d0f1588035dde))


### Bug Fixes

* Regularize format of NEWS.md ([0ec29b3](https://github.com/endojs/endo/commit/0ec29b34a18b17cc6b90e5a46575e634714e978e))
* **compartment-mapper:** Deterministic archives ([577cdd8](https://github.com/endojs/endo/commit/577cdd81daa56ccffe4dbed4470f76077eeb3d71))
* **compartment-mapper:** Different tack to evade SES import censor ([#513](https://github.com/endojs/endo/issues/513)) ([5df2c0e](https://github.com/endojs/endo/commit/5df2c0e2c185ee71d1ebfd3b2e01e84ebfcf6c56))
* **compartment-mapper:** Dodge named reexport as bug in tests ([ad8c661](https://github.com/endojs/endo/commit/ad8c6618887ecf1d96522b1370094bde1c87f5f0))
* **compartment-mapper:** Elide source URL from archived MJS ([ecc65b5](https://github.com/endojs/endo/commit/ecc65b51243f942771a11e253e1192004c2301f7))
* **compartment-mapper:** Generate strict bundle ([c1e3a90](https://github.com/endojs/endo/commit/c1e3a908f4a220edc179104b88f2ea8ad375bdfb))
* **compartment-mapper:** Remove extraneous internal exports ([d8eb6ac](https://github.com/endojs/endo/commit/d8eb6ac09936d03772e1ccd3ed9f7dd23e460d6a))
* **compartment-mapper:** Restore named reexport as bug in tests ([2de06f3](https://github.com/endojs/endo/commit/2de06f38946c25c72152980bd055a9e9759bfb43))
* **compartment-mapper:** Switch from Syrup to JSON ([0d80376](https://github.com/endojs/endo/commit/0d80376fcf4dfc804a406d9d3e6e65dc900cbf08))
* **compartment-mapper:** Withdraw UMD Rollup ([#469](https://github.com/endojs/endo/issues/469)) ([9118807](https://github.com/endojs/endo/commit/911880719822f35362844ce32e56f93a26cd5c02))
* **static-module-record:** Emphasize RESM/NESM compatibility over CJS/UMD ([dcff87e](https://github.com/endojs/endo/commit/dcff87e6f1164d664dd31dfefb323fbbac0a8dd1))
* Realign TS, JS, and package names ([#686](https://github.com/endojs/endo/issues/686)) ([439e0ff](https://github.com/endojs/endo/commit/439e0fff1fd214eec91486ded8b3d36a5eb4b801))
* **compartment-mapper:** Work around dynamic import censoring ([#512](https://github.com/endojs/endo/issues/512)) ([b82398b](https://github.com/endojs/endo/commit/b82398b55eb714b8fe59c06aaec74ddf9b78dda7))
* Fully thread __shimTransforms__ through Compartment Mapper and SES ([#509](https://github.com/endojs/endo/issues/509)) ([0f199ef](https://github.com/endojs/endo/commit/0f199ef088353ec09b29e37aefcfa26a89a6c582))
* **compartment-mapper:** Temporarily disable CommonJS ([8d7fb04](https://github.com/endojs/endo/commit/8d7fb04f18acf49e22850576dded8bf7b7045548))


### Tests

* **compartment-mapper:** Refresh zip fixture ([691ca31](https://github.com/endojs/endo/commit/691ca3126d7fbc2122c1575c3d564643df569b4c))


### Code Refactoring

* **compartment-mapper:** Cleanly separate StaticModuleRecord dependency ([#698](https://github.com/endojs/endo/issues/698)) ([0b28902](https://github.com/endojs/endo/commit/0b289021eee1256c05ceb4d83318165cb6288844))
* **compartment-mapper:** Import options bags and thread transforms ([3aa9ed9](https://github.com/endojs/endo/commit/3aa9ed9dcf259ffba853c9fd53564e874113ab4a))
* **compartment-mapper:** Lean on RESM/NESM interoperability ([eb1753e](https://github.com/endojs/endo/commit/eb1753e1d28df423be6de9c70bceb6e8a1e171a1))
* **compartment-mapper:** Rearrange entry point modules ([f87dc14](https://github.com/endojs/endo/commit/f87dc14e030ed9e8d47be92ff2faa5b5bec46914))
* **compartment-mapper:** Rename endowments to globals ([a7e8a2e](https://github.com/endojs/endo/commit/a7e8a2ea734651100a4d3dfd703932b354f5d386))
