# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# 0.3.0 (2021-05-28)


### Bug Fixes

* **compartment-mapper:** Deterministic archives ([577cdd8](https://github.com/endojs/endo/commit/577cdd81daa56ccffe4dbed4470f76077eeb3d71))
* **compartment-mapper:** Different tack to evade SES import censor ([#513](https://github.com/endojs/endo/issues/513)) ([5df2c0e](https://github.com/endojs/endo/commit/5df2c0e2c185ee71d1ebfd3b2e01e84ebfcf6c56))
* **compartment-mapper:** Dodge named reexport as bug in tests ([ad8c661](https://github.com/endojs/endo/commit/ad8c6618887ecf1d96522b1370094bde1c87f5f0))
* **compartment-mapper:** Elide source URL from archived MJS ([ecc65b5](https://github.com/endojs/endo/commit/ecc65b51243f942771a11e253e1192004c2301f7))
* **compartment-mapper:** Generate strict bundle ([c1e3a90](https://github.com/endojs/endo/commit/c1e3a908f4a220edc179104b88f2ea8ad375bdfb))
* **compartment-mapper:** Remove extraneous internal exports ([d8eb6ac](https://github.com/endojs/endo/commit/d8eb6ac09936d03772e1ccd3ed9f7dd23e460d6a))
* **compartment-mapper:** Restore named reexport as bug in tests ([2de06f3](https://github.com/endojs/endo/commit/2de06f38946c25c72152980bd055a9e9759bfb43))
* **compartment-mapper:** Switch from Syrup to JSON ([0d80376](https://github.com/endojs/endo/commit/0d80376fcf4dfc804a406d9d3e6e65dc900cbf08))
* Fully thread __shimTransforms__ through Compartment Mapper and SES ([#509](https://github.com/endojs/endo/issues/509)) ([0f199ef](https://github.com/endojs/endo/commit/0f199ef088353ec09b29e37aefcfa26a89a6c582))
* Realign TS, JS, and package names ([#686](https://github.com/endojs/endo/issues/686)) ([439e0ff](https://github.com/endojs/endo/commit/439e0fff1fd214eec91486ded8b3d36a5eb4b801))
* **compartment-mapper:** Withdraw UMD Rollup ([#469](https://github.com/endojs/endo/issues/469)) ([9118807](https://github.com/endojs/endo/commit/911880719822f35362844ce32e56f93a26cd5c02))
* **compartment-mapper:** Work around dynamic import censoring ([#512](https://github.com/endojs/endo/issues/512)) ([b82398b](https://github.com/endojs/endo/commit/b82398b55eb714b8fe59c06aaec74ddf9b78dda7))


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
* **endo:** Freeze all global objects ([#631](https://github.com/endojs/endo/issues/631)) ([83b5db4](https://github.com/endojs/endo/commit/83b5db4a2b64fcf1cb8927698e0d5942439eec27))
* **ses:** Allow import and eval methods ([#669](https://github.com/endojs/endo/issues/669)) ([505a7d7](https://github.com/endojs/endo/commit/505a7d7149c36825a00c9fe3795d0f1588035dde))
