# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [1.2.0](https://github.com/endojs/endo/compare/ses@1.1.0...ses@1.2.0) (2024-02-15)


### Features

* **ses:** enablements needed by (old?) mobx ([#2030](https://github.com/endojs/endo/issues/2030)) ([553cb52](https://github.com/endojs/endo/commit/553cb52f81f33f202afca58f9230ffed67716eb7))
* **ses:** expect more properties to censor ([#2070](https://github.com/endojs/endo/issues/2070)) ([4e5a88b](https://github.com/endojs/endo/commit/4e5a88bf5388d0cf6af9bb624b80c3206df9c5f0))
* **ses:** Export assert-shim.js, lockdown-shim.js, compartment-shim.js ([2eca78d](https://github.com/endojs/endo/commit/2eca78db429575f39168de59398e303e9d9d53a2))
* **ses:** permit stage 3 float16 proposal API ([#2014](https://github.com/endojs/endo/issues/2014)) ([cdb526a](https://github.com/endojs/endo/commit/cdb526a92ee7c67f1b6b322fcde031462cac9c7e))


### Bug Fixes

* Add repository directory to all package descriptors ([e5f36e7](https://github.com/endojs/endo/commit/e5f36e7a321c13ee25e74eb74d2a5f3d7517119c))



## [1.1.0](https://github.com/endojs/endo/compare/ses@1.0.1...ses@1.1.0) (2024-01-18)


### Features

* **env-options:** env-options conveniences for common cases ([#1710](https://github.com/endojs/endo/issues/1710)) ([4c686f6](https://github.com/endojs/endo/commit/4c686f6c9c3c54dbf73e8e7cd80a4dfebcbc61df))
* **ses:** Anticipate set-methods proposal ([#1970](https://github.com/endojs/endo/issues/1970)) ([4a4f9fe](https://github.com/endojs/endo/commit/4a4f9fe8dbb30921765481f37da6bf8a2af3cbfa))
* **ses:** Fail fast when a required process.exit or process.abort method is missing ([5d637d0](https://github.com/endojs/endo/commit/5d637d046fdc6354cef25514aea4e3aa37fa4792))
* **ses:** group removal cleanup diagnostics ([173ec8e](https://github.com/endojs/endo/commit/173ec8e458f4181a36274dedfe3ceb93dc6f2d1d))
* **ses:** harden some Node.js intrinsics ([148f101](https://github.com/endojs/endo/commit/148f101cf593a8b77410ec38fb3c91504846385d))


### Bug Fixes

* **ses:** Add `@[@to](https://github.com/to)StringTag` property to `proxiedExports` ([639de2a](https://github.com/endojs/endo/commit/639de2a68f38970a02a80a18cf50b972ec96e5ad))
* **ses:** handle properties that are already override protected ([#1969](https://github.com/endojs/endo/issues/1969)) ([5792949](https://github.com/endojs/endo/commit/579294902f85fba6b171e2199a44ab7522258f46))
* **ses:** Remove link to stale Read the Docs ([58864b7](https://github.com/endojs/endo/commit/58864b7c3cffa9521d1e990dd3c86d609adcffde)), closes [#1239](https://github.com/endojs/endo/issues/1239)
* **ses:** Support an incomplete shimmed globalEnv.process ([6e92951](https://github.com/endojs/endo/commit/6e92951912ffde3603437cc2f0a8c31879467ff7)), closes [#1917](https://github.com/endojs/endo/issues/1917)
* **ses:** Suppress bug [#1973](https://github.com/endojs/endo/issues/1973) until it is fixed ([#1974](https://github.com/endojs/endo/issues/1974)) ([03074ce](https://github.com/endojs/endo/commit/03074ce5eddfb391e1d690b5b5fa4113ea4b445e))



### [1.0.1](https://github.com/endojs/endo/compare/ses@1.0.0...ses@1.0.1) (2023-12-20)

**Note:** Version bump only for package ses





## [1.0.0](https://github.com/endojs/endo/compare/ses@0.18.8...ses@1.0.0) (2023-12-12)


### Features

* **ses:** add SES version ([db17743](https://github.com/endojs/endo/commit/db17743885e7a221eaf3f6cf5e811a1a1d97788f))
* **ses:** Freeze evaluators, Compartment constructor and Symbol ([1016375](https://github.com/endojs/endo/commit/1016375f86082e927e7906f11046bb53d9025d68))


### Bug Fixes

* enable compatibility with node16/nodenext module resolution ([9063c47](https://github.com/endojs/endo/commit/9063c47a2016a8ed3ae371646c7b81e47006a091))
* **ses:** Fake a good-enough console ([a2fd851](https://github.com/endojs/endo/commit/a2fd85145b6c0e316b2205090ba49b60974d10e0)), closes [#1819](https://github.com/endojs/endo/issues/1819)
* **ses:** fix ThirdPartyStaticModuleInterface type ([fe38c40](https://github.com/endojs/endo/commit/fe38c4095c059ed9550aa682a0de5ab958d3522e))
* **ses:** fix types export for newer module resolutions ([9cc3dd5](https://github.com/endojs/endo/commit/9cc3dd5551be369d854d5a4c3724b96dc8cc6691)), closes [#1803](https://github.com/endojs/endo/issues/1803)
* **ses:** refactor import assert {type: json} to fs ([d5741a4](https://github.com/endojs/endo/commit/d5741a44450bb31150cf90e9a0d12eecc836503a))
* **ses:** Support absence of console ([fece445](https://github.com/endojs/endo/commit/fece445f0191e41c1324d26d83d830dfa8822400)), closes [#1819](https://github.com/endojs/endo/issues/1819)



### [0.18.8](https://github.com/endojs/endo/compare/ses@0.18.7...ses@0.18.8) (2023-09-12)


### Features

* **ses:** Support vetted shims ([40b59cc](https://github.com/endojs/endo/commit/40b59cce6aa75de0635bcaddba8d6b8dd598a8c2))


### Bug Fixes

* **assert:** mistyped assert.fail ([e1ebe75](https://github.com/endojs/endo/commit/e1ebe75845e21470b2b732a6417d35c4106df6b8))
* only assertions on 'assert' export ([e6a7815](https://github.com/endojs/endo/commit/e6a7815081e5b257181d0039d981ec6f878e93be))
* **ses:** align with XS property censorship agreement ([0193d99](https://github.com/endojs/endo/commit/0193d99035bf00e047efc4d96a7bdf06518613e8))
* **ses:** prepare for Array Grouping proposal ([8e0e6bb](https://github.com/endojs/endo/commit/8e0e6bb765c3536303c9b0858f5446f007e39176))
* **ses:** review suggestions ([e4be709](https://github.com/endojs/endo/commit/e4be709fa76adbf7662383956460a7d9b2ef0375))



### [0.18.7](https://github.com/endojs/endo/compare/ses@0.18.5...ses@0.18.7) (2023-08-07)


### Bug Fixes

* **fix:** Censor spread import ([fc90c64](https://github.com/endojs/endo/commit/fc90c6429604dc79ce8e3355e236ccce2bada041))
* **ses:** add more missing permits ([222f8f1](https://github.com/endojs/endo/commit/222f8f1ee9f579de9e325a2807663fc3931efa9a))
* **ses:** normalize bestEffortsStringify property order ([137daff](https://github.com/endojs/endo/commit/137dafff089b7ff5bea74a398caa238f4d313f5e))



### [0.18.6](https://github.com/endojs/endo/compare/ses@0.18.5...ses@0.18.6) (2023-08-07)


### Bug Fixes

* **fix:** Censor spread import ([fc90c64](https://github.com/endojs/endo/commit/fc90c6429604dc79ce8e3355e236ccce2bada041))
* **ses:** add more missing permits ([222f8f1](https://github.com/endojs/endo/commit/222f8f1ee9f579de9e325a2807663fc3931efa9a))
* **ses:** normalize bestEffortsStringify property order ([137daff](https://github.com/endojs/endo/commit/137dafff089b7ff5bea74a398caa238f4d313f5e))



### [0.18.5](https://github.com/endojs/endo/compare/ses@0.18.4...ses@0.18.5) (2023-07-19)


### Features

* **ses:** Add assert.raw for embedding unquoted strings in details ([652df0c](https://github.com/endojs/endo/commit/652df0ca6a2fbca5db3026d26141da41cdde318e))
* **ses:** allow new dispose symbols ([3b9fa4a](https://github.com/endojs/endo/commit/3b9fa4a27399732d518217ac31917099f55bde32))
* **ses:** anticipate interator helpers ([b0b28a2](https://github.com/endojs/endo/commit/b0b28a248a434d310f603101861bd00d8eb903e2))
* **ses:** review suggestions ([882f8d5](https://github.com/endojs/endo/commit/882f8d54bf66f59efec94918f35d31189545a205))
* **ses:** tame Symbol so whitelist works ([9fb1242](https://github.com/endojs/endo/commit/9fb1242c3b48cdd363eecccc357f84f4d223ccc1))
* **ses:** whitelist some recent >= stage 3 additions ([f0c6e50](https://github.com/endojs/endo/commit/f0c6e5024c4ca80ea632c52bf06ccc4414282787))


### Bug Fixes

* revert broken ones ([09cabb3](https://github.com/endojs/endo/commit/09cabb30335fd4dc22623fc102bb1a2711437ad4))
* **ses:** better safari debugging ([8cca7db](https://github.com/endojs/endo/commit/8cca7db0f66dda9ecafc5976c195004cee55950c))
* **ses:** Correct AsyncIterator permits ([5009022](https://github.com/endojs/endo/commit/5009022d4b21a59ebd537774d1817015b4af8699))
* **ses:** Fix expectations of import order in module source test ([a59f2b4](https://github.com/endojs/endo/commit/a59f2b4ab6c784c879391ee829b2763bd81b2a85))
* **ses:** missing native function markings ([98b9698](https://github.com/endojs/endo/commit/98b96989c85dd488849b76c6b22a188087ef59f3))
* **ses:** permits for new proposal problems ([de46b14](https://github.com/endojs/endo/commit/de46b14e1f2933338217090ee7bbe013365e24ec))
* **ses:** review suggestions ([8e9ead0](https://github.com/endojs/endo/commit/8e9ead0b2ff48c6a6f1b5e57b88c96d7196a7d71))
* **ses:** ses depends on env-options ([ca3ffd1](https://github.com/endojs/endo/commit/ca3ffd1fbf809cdf30562399d094d318ef592b0e))



### [0.18.4](https://github.com/endojs/endo/compare/ses@0.18.3...ses@0.18.4) (2023-04-20)

### Features

- **ses:** use `globalThis.harden` as `safeHarden` if available ([5f3de3e](https://github.com/endojs/endo/commit/5f3de3e539ab93c86d152ce7dd82b9e6af56c57d))

### Bug Fixes

- **ses:** correct types ([c38235c](https://github.com/endojs/endo/commit/c38235c78bb038100e52da79ca69944ec516299a))

### [0.18.3](https://github.com/endojs/endo/compare/ses@0.18.2...ses@0.18.3) (2023-04-14)

### Features

- **eslint-plugin:** separate rules into subsets ([688e89c](https://github.com/endojs/endo/commit/688e89c80dccb2ec01183a5a4c3600f72078e67b))
- **ses:** finite deep stacks, on by default ([#1513](https://github.com/endojs/endo/issues/1513)) ([aae0e57](https://github.com/endojs/endo/commit/aae0e57f7a6bdcc898396c65ec22616a33672d32))
- **ses:** option to fake harden unsafely ([697bf58](https://github.com/endojs/endo/commit/697bf5855e4a6578db4cbca40bfeca253a6a2cfe))

### Bug Fixes

- limit logged args per error ([88f4662](https://github.com/endojs/endo/commit/88f46620314f34dc964f8c490179b38d39d26bc7))
- **ses:** Add length (number) prop to whitelist %AsyncGenerator% and %AsyncFunctionPrototype% ([#1511](https://github.com/endojs/endo/issues/1511)) ([c08b15b](https://github.com/endojs/endo/commit/c08b15b09f295775c3f253ca7f03c105ac87bab7))
- **ses:** avoid holding deep stacks strongly ([996af60](https://github.com/endojs/endo/commit/996af60df50120da971ba962e56fcc333ba70e3e))

### [0.18.2](https://github.com/endojs/endo/compare/ses@0.18.1...ses@0.18.2) (2023-03-07)

### Features

- Comment links error code errors to explanation ([#1431](https://github.com/endojs/endo/issues/1431)) ([91362f1](https://github.com/endojs/endo/commit/91362f1e585928f83496ffbabec7d583ec6b031e))
- **ses:** export tools ([ba562df](https://github.com/endojs/endo/commit/ba562dfe32601deaee8242c06925d6957156f7e2))
- **ses:** module execute uses syncModuleFunctor if present ([079098e](https://github.com/endojs/endo/commit/079098ed2944b4da990cf359857b09b0437f714a))

### Bug Fixes

- extend severeEnablements with immer workaround ([#1433](https://github.com/endojs/endo/issues/1433)) ([f072995](https://github.com/endojs/endo/commit/f07299530de8424e133f0359d8902cff5e4fef5b))
- Fix hackerone.com links in SECURITY.md ([#1472](https://github.com/endojs/endo/issues/1472)) ([389733d](https://github.com/endojs/endo/commit/389733dbc7a74992f909c38d27ea7e8e68623959))
- Improve typing information ([765d262](https://github.com/endojs/endo/commit/765d2625ee278608494f7e998bcd3a3ee8b845a4))
- **ses:** Fix guide.md Compartment link ([#1457](https://github.com/endojs/endo/issues/1457)) ([c9b0276](https://github.com/endojs/endo/commit/c9b02769594a7fb7d6cbdb7a9536ba79c23de520))
- **ses:** Fix SES_NO_SLOPPY.md typo ([#1458](https://github.com/endojs/endo/issues/1458)) ([4cf1845](https://github.com/endojs/endo/commit/4cf184566210ef59e0ef84dcabf8a70aa8b5d841))

### [0.18.1](https://github.com/endojs/endo/compare/ses@0.18.0...ses@0.18.1) (2022-12-23)

### Features

- **ses:** support RedirectStaticModuleInterface with implicit record ([356ed3b](https://github.com/endojs/endo/commit/356ed3b3b40b5b890d0970012f62d08ee7eea1f7))

### Bug Fixes

- **ses:** Do not crash under no-unsafe-eval Content Security Policy ([#1333](https://github.com/endojs/endo/issues/1333)) ([e512174](https://github.com/endojs/endo/commit/e5121747d2ba01ad15304763c6390b721bb0df2a))
- **ses:** handle named reexports without confusing bindings for matching imported names ([84a62cc](https://github.com/endojs/endo/commit/84a62cc0fca3ca9a98853619a8f6c30145b181d4))
- **ses:** Link to primer on Hardened JavaScript ([121457d](https://github.com/endojs/endo/commit/121457dd2d82fdf92312a2efd47494007677654c))
- **ses:** Remove superfluous tick in module loader ([342626a](https://github.com/endojs/endo/commit/342626ad6944d98aaecbe9274fcd60422247bb65)), closes [#1394](https://github.com/endojs/endo/issues/1394)

## [0.18.0](https://github.com/endojs/endo/compare/ses@0.17.0...ses@0.18.0) (2022-11-14)

### ⚠ BREAKING CHANGES

- **ses:** Remove support for globalLexicals

### Features

- **ses:** Remove support for globalLexicals ([3b90d5d](https://github.com/endojs/endo/commit/3b90d5d96984ff211efe5e47de1ce57cde7be980)), closes [#904](https://github.com/endojs/endo/issues/904)

### Bug Fixes

- assert touchups ([#1350](https://github.com/endojs/endo/issues/1350)) ([3fcb5b1](https://github.com/endojs/endo/commit/3fcb5b117eccb326c6c81339ae6a293a6bcaa9d4))
- fail template ([#1334](https://github.com/endojs/endo/issues/1334)) ([725b987](https://github.com/endojs/endo/commit/725b987ffa812a070ff45fcd496cf8fd88df6963))

## [0.17.0](https://github.com/endojs/endo/compare/ses@0.16.0...ses@0.17.0) (2022-10-24)

### ⚠ BREAKING CHANGES

- **ses:** Prevent surprising global unscopables behavior
- **ses:** Divide scope proxy into four layers

### Features

- **ses:** Revocable evalScope ([0187d1e](https://github.com/endojs/endo/commit/0187d1e3532cfc2f052619c46a8a6331a8c15ae8))

### Bug Fixes

- **ses:** Prevent surprising global unscopables behavior ([dcb8f5d](https://github.com/endojs/endo/commit/dcb8f5da2a453ac72b7f2cc3208f591a9c298402))
- **ses:** Protect necessary eval admission before it has been admitted ([3d022b1](https://github.com/endojs/endo/commit/3d022b1e1b34ff9b86cf6af236c499bfbe291298))
- **ses:** Typo in compartmentEvaluate ([d66db7a](https://github.com/endojs/endo/commit/d66db7a67fab6bdd36d18a931c6a9163e842c3fe))
- **ses:** Typo in scope-constants ([a4ee1ea](https://github.com/endojs/endo/commit/a4ee1ea5e54d894ad3a3ce0c5e42507f026199e6))

### Code Refactoring

- **ses:** Divide scope proxy into four layers ([37c4b4a](https://github.com/endojs/endo/commit/37c4b4a22996e33dd4b2a48c67ce649ba88e5528))

## [0.16.0](https://github.com/endojs/endo/compare/ses@0.15.23...ses@0.16.0) (2022-10-19)

### Features

- Add links to resources and community portals ([b0fef82](https://github.com/endojs/endo/commit/b0fef82192d476c43e9e10d5ad696cdad5bcb0b5))

### Bug Fixes

- **ses:** Fail safe when getOwnPropertyDescriptor reports absence of a known property ([5fa3b50](https://github.com/endojs/endo/commit/5fa3b506dc3d8826d0d213a9514e554986823a1d))
- **ses:** Harden all non-integer typed array properties, even if canonical ([88cab0b](https://github.com/endojs/endo/commit/88cab0be4cf816dc578f2ff441fd9bcda0aa5cf5))
- **ses:** Lock down all typed array expando properties ([dc82f5d](https://github.com/endojs/endo/commit/dc82f5d2908b3507965562c7c1b3bf12d852af8f))
- minor improvements to some override comments ([#1327](https://github.com/endojs/endo/issues/1327)) ([678285a](https://github.com/endojs/endo/commit/678285a3345adec894f265ba56c2fa6636f846b8))
- **marshal:** Return a special error message from passStyleOf(typedArray) ([dbd498e](https://github.com/endojs/endo/commit/dbd498e30a5c3b0d2713d863bc7479ceef39cd79)), closes [#1326](https://github.com/endojs/endo/issues/1326)
- delete broken objectFromEntries ([#1306](https://github.com/endojs/endo/issues/1306)) ([d83be67](https://github.com/endojs/endo/commit/d83be675d23a928f287d6d9118f7258f0abd855a))
- **ses:** expand the scope this-value test ([3d50c1a](https://github.com/endojs/endo/commit/3d50c1ac073250406a8b38735610ca6d86fdd680))
- **ses:** Fix incompatible spelling ([c32fdf1](https://github.com/endojs/endo/commit/c32fdf10bdc1a21096ba190c384fa9f08f85f1f3))
- **ses:** scope tests - expand Symbol.unscopables fidelity test ([bb542f7](https://github.com/endojs/endo/commit/bb542f78a1520a8e54e981d224dee28b171518d6))
- **ses:** scope tests - expand Symbolunscopables fidelity test ([c603c5a](https://github.com/endojs/endo/commit/c603c5aa4a1ba271cf17d754df789a52aa7debfb))
- **ses:** scope tests - move teardown into ava teardown call ([e59f682](https://github.com/endojs/endo/commit/e59f6829e3061adcd8fbf78cde84cf3f9abc5bf8))
- **ses:** scope tests - rename variables to match purpose ([18d64c3](https://github.com/endojs/endo/commit/18d64c31315e47c798443f78a3bcfb77f4698366))
- **ses:** this-value scope test includes optimizable props ([9c3fea3](https://github.com/endojs/endo/commit/9c3fea3dfd2d72f0fc13455bc1e54de455ead83e))
- **ses:** this-value scope test includes unscopables fidelity test ([0be95ac](https://github.com/endojs/endo/commit/0be95acdb9a5251d1c37061bb5ae59180e298f65))

### [0.15.23](https://github.com/endojs/endo/compare/ses@0.15.22...ses@0.15.23) (2022-09-27)

### Features

- **ses:** improve performance of uncurryThis ([b1ad60a](https://github.com/endojs/endo/commit/b1ad60ae89545499d6cbcaa3812118ac4229d83c))

### Bug Fixes

- add a do-nothing SharedError.prepareStackTrace ([#1290](https://github.com/endojs/endo/issues/1290)) ([705aef2](https://github.com/endojs/endo/commit/705aef24f34bb9794f0aa807d567b3efbf0c23af))
- **ses:** report unhandled promise rejection when collected ([dae7235](https://github.com/endojs/endo/commit/dae7235011da907823c27ca5dfb9ed72519a4062))
- **ses:** uncurryThis type fixes ([feb062c](https://github.com/endojs/endo/commit/feb062c56ee05b12657596defce68107894bafd4))

### [0.15.22](https://github.com/endojs/endo/compare/ses@0.15.21...ses@0.15.22) (2022-09-14)

### Bug Fixes

- alt syntax for positive but faster assertions ([#1280](https://github.com/endojs/endo/issues/1280)) ([dc24f2f](https://github.com/endojs/endo/commit/dc24f2f2c3cac7ce239a64c503493c41a2334315))

### [0.15.21](https://github.com/endojs/endo/compare/ses@0.15.20...ses@0.15.21) (2022-08-26)

**Note:** Version bump only for package ses

### [0.15.20](https://github.com/endojs/endo/compare/ses@0.15.19...ses@0.15.20) (2022-08-26)

**Note:** Version bump only for package ses

### [0.15.19](https://github.com/endojs/endo/compare/ses@0.15.18...ses@0.15.19) (2022-08-25)

**Note:** Version bump only for package ses

### [0.15.18](https://github.com/endojs/endo/compare/ses@0.15.17...ses@0.15.18) (2022-08-23)

### Bug Fixes

- more hardens ([#1241](https://github.com/endojs/endo/issues/1241)) ([b6ff811](https://github.com/endojs/endo/commit/b6ff8118a92fd72c5309b2bb285fac08d0531d92))
- remove **allowUnsafeMonkeyPatching** ([fe9c784](https://github.com/endojs/endo/commit/fe9c78414eab5d1bce73cdb16e1455c1c4307e98))
- remove dead environment-options module ([#1243](https://github.com/endojs/endo/issues/1243)) ([c43c939](https://github.com/endojs/endo/commit/c43c9396976ad6b0af5d99caed033b1abf448165))
- **ses:** avoid leaks through CallSite structures ([69f69fa](https://github.com/endojs/endo/commit/69f69fac84154401a5bea72a533ba07f1ff2c191))

### [0.15.17](https://github.com/endojs/endo/compare/ses@0.15.16...ses@0.15.17) (2022-06-28)

### Features

- **compartment-mapper:** implement passing values in import.meta.url ([d6294f6](https://github.com/endojs/endo/commit/d6294f6832f978eaa7af94fee4496d76bd35a927))
- add the foundations for support of import.meta ([36f6449](https://github.com/endojs/endo/commit/36f644998c21f6333268707555b97938ff0fff08))
- call importMetaHook on instantiation if import.meta uttered by module ([23e8c40](https://github.com/endojs/endo/commit/23e8c405e0be823c728f8af1a6db9607e21f2f74))

### Bug Fixes

- rename meta to importMeta, fix detection to detect import.meta not import.meta.something ([c61a862](https://github.com/endojs/endo/commit/c61a862c9f4354f0e6d86d8c8efaa826840a6efd))
- tolerate empty func.prototype ([#1221](https://github.com/endojs/endo/issues/1221)) ([4da7742](https://github.com/endojs/endo/commit/4da7742e8017d07094ed9b9336a85b6a4d3ee7b6))

### [0.15.16](https://github.com/endojs/endo/compare/ses@0.15.15...ses@0.15.16) (2022-06-11)

### Features

- **console-taming:** `unhandledRejectionTrapping` after finalized ([7dccecf](https://github.com/endojs/endo/commit/7dccecfc1766b5287eeb0ebe958d1e1715cb63a4))
- **ses:** add to commons ([9dc2de8](https://github.com/endojs/endo/commit/9dc2de812755a3c2ba6f73764f8ee7f43dd6f717))

### Bug Fixes

- **console:** close over severity for error note callbacks ([59910b2](https://github.com/endojs/endo/commit/59910b2a0ac146162c5191a3b315421b92ac5d77))
- **console:** direct error output to the current severity ([f5d460d](https://github.com/endojs/endo/commit/f5d460d1cc1828100ce0ad237cb0f6bfd0a8e45c))
- **ses:** Fix compartment with name from object with toString ([405c00b](https://github.com/endojs/endo/commit/405c00b3cc8f663ef73ef4275ba1776913dc26e7))
- **static-module-record:** Make types consistent with implementation ([#1184](https://github.com/endojs/endo/issues/1184)) ([5b7e3a6](https://github.com/endojs/endo/commit/5b7e3a6d006a686520c4ffeedea5428a720f7e7d))
- all errors have stacks, even if empty ([#1171](https://github.com/endojs/endo/issues/1171)) ([25b7d86](https://github.com/endojs/endo/commit/25b7d86240a5fc2772343664e5a42d1400d363d9))
- make `*Trapping` orthogonal to `consoleTaming` ([8c5e12e](https://github.com/endojs/endo/commit/8c5e12e96f8c71d0c52e2d17786558e88585e04b))
- repair deviations from local convention ([#1183](https://github.com/endojs/endo/issues/1183)) ([13614f5](https://github.com/endojs/endo/commit/13614f56872ac976e3440f8bcce706200ffe9822))

### [0.15.15](https://github.com/endojs/endo/compare/ses@0.15.14...ses@0.15.15) (2022-04-15)

**Note:** Version bump only for package ses

### [0.15.14](https://github.com/endojs/endo/compare/ses@0.15.13...ses@0.15.14) (2022-04-14)

**Note:** Version bump only for package ses

### [0.15.13](https://github.com/endojs/endo/compare/ses@0.15.12...ses@0.15.13) (2022-04-13)

### Bug Fixes

- Revert dud release ([c8a7101](https://github.com/endojs/endo/commit/c8a71017d8d7af10a97909c9da9c5c7e59aed939))
- **ses:** Prevent hypothetical stack bumping to get unsafe eval ([3c64cde](https://github.com/endojs/endo/commit/3c64cdea5b410a053520dc29de04c43350a38e1a)), closes [#956](https://github.com/endojs/endo/issues/956)

### [0.15.12](https://github.com/endojs/endo/compare/ses@0.15.11...ses@0.15.12) (2022-04-12)

### Features

- add Array#at close [#1139](https://github.com/endojs/endo/issues/1139) ([#1146](https://github.com/endojs/endo/issues/1146)) ([43494c8](https://github.com/endojs/endo/commit/43494c8d0c50cba205050fcf472fda4aed03d6ca))
- **compartment-mapper:** proper default export implementation for cjs with import and require compatibility ([30cbaa8](https://github.com/endojs/endo/commit/30cbaa8cb79b906742a9f5c1854b22fe506b0575))
- **init:** Handle symbols installed on Promise by Node's `async_hooks` ([#1115](https://github.com/endojs/endo/issues/1115)) ([06827b9](https://github.com/endojs/endo/commit/06827b982c0450bae53b5ff0c410745678168c88))

### Bug Fixes

- **ses:** avoid cache corruption when execute() throws ([1d9c17b](https://github.com/endojs/endo/commit/1d9c17b4c4a5ed1450cddd996bd948dd59c80bf6))
- some tests sensitive to errorTaming ([#1135](https://github.com/endojs/endo/issues/1135)) ([0c22364](https://github.com/endojs/endo/commit/0c22364104fb8b2528cd5437accda09a045a6ff0))
- **endo:** Ensure conditions include default, import, and endo ([1361abd](https://github.com/endojs/endo/commit/1361abd8c732596d192ecef6a039eda98b4ee563))
- **ses:** Do not bundle modules for use as modules ([7d27020](https://github.com/endojs/endo/commit/7d2702037295211d8d3f08431a4d4de0a4e3ffd7))
- **ses:** Do not get confused by well-known look-alikes ([5139dad](https://github.com/endojs/endo/commit/5139dad7719d7a32360e2daf8a37b9ab3f2cd94a))
- **ses:** Ignore Array unscopable findLast{,Index} ([#1129](https://github.com/endojs/endo/issues/1129)) ([bbf7e7d](https://github.com/endojs/endo/commit/bbf7e7dd0ba19349120d4913016c62b9f8dc4995))
- **ses:** make import \* and default from cjs wire up correctly ([33cbd27](https://github.com/endojs/endo/commit/33cbd2776f9d47e6e8438650565155e4185d9373))

### [0.15.11](https://github.com/endojs/endo/compare/ses@0.15.10...ses@0.15.11) (2022-03-07)

**Note:** Version bump only for package ses

### [0.15.10](https://github.com/endojs/endo/compare/ses@0.15.9...ses@0.15.10) (2022-03-02)

### Features

- add evalTaming option ([#961](https://github.com/endojs/endo/issues/961)) ([735ff94](https://github.com/endojs/endo/commit/735ff94bf3513613e64aaca03116f289d07aa366))

### [0.15.9](https://github.com/endojs/endo/compare/ses@0.15.8...ses@0.15.9) (2022-02-20)

**Note:** Version bump only for package ses

### [0.15.8](https://github.com/endojs/endo/compare/ses@0.15.7...ses@0.15.8) (2022-02-18)

### Features

- **ses:** Harden typed arrays ([#1032](https://github.com/endojs/endo/issues/1032)) ([0dfa7de](https://github.com/endojs/endo/commit/0dfa7de417e9e801e3188596bfe9d10a69d541a6))

### Bug Fixes

- Make jsconfigs less brittle ([861ca32](https://github.com/endojs/endo/commit/861ca32a72f0a48410fd93b1cbaaad9139590659))
- **ses:** update index.d.ts with second argument to compartment.evaluate ([716621c](https://github.com/endojs/endo/commit/716621c3259965f699ec12ac1fa5d874884348b5))
- remove pureCopy, ALLOW_IMPLICIT_REMOTABLES ([#1061](https://github.com/endojs/endo/issues/1061)) ([f08cad9](https://github.com/endojs/endo/commit/f08cad99aa715aa36f78dfd67b9f581cdd22bb3c))
- Make sure lint:type runs correctly in CI ([a520419](https://github.com/endojs/endo/commit/a52041931e72cb7b7e3e21dde39c099cc9f262b0))
- Unify TS version to ~4.2 ([5fb173c](https://github.com/endojs/endo/commit/5fb173c05c9427dca5adfe66298c004780e8b86c))
- **ses:** Relax hardened typed array test to be insensitive to bugfix between Node.js 14 and 16 ([#1048](https://github.com/endojs/endo/issues/1048)) ([e12508d](https://github.com/endojs/endo/commit/e12508db74e0c5b921db92daf3de684b739f7bc3)), closes [#1045](https://github.com/endojs/endo/issues/1045)

### [0.15.7](https://github.com/endojs/endo/compare/ses@0.15.6...ses@0.15.7) (2022-01-31)

### Bug Fixes

- **ses:** Globals have vars, not consts ([#1027](https://github.com/endojs/endo/issues/1027)) ([157669f](https://github.com/endojs/endo/commit/157669f0b669332f703747e36dd867bf6a823e59))

### [0.15.6](https://github.com/endojs/endo/compare/ses@0.15.5...ses@0.15.6) (2022-01-27)

**Note:** Version bump only for package ses

### [0.15.5](https://github.com/endojs/endo/compare/ses@0.15.4...ses@0.15.5) (2022-01-25)

**Note:** Version bump only for package ses

### [0.15.4](https://github.com/endojs/endo/compare/ses@0.15.3...ses@0.15.4) (2022-01-23)

### Features

- **ses:** Check early for dynamic evalability ([d0f6f09](https://github.com/endojs/endo/commit/d0f6f099d41edee3f484da5d5094848f72f93084)), closes [#343](https://github.com/endojs/endo/issues/343)

### Bug Fixes

- **ses:** Direct eval check should not preclude no-eval under CSP ([#1004](https://github.com/endojs/endo/issues/1004)) ([fc8f9ee](https://github.com/endojs/endo/commit/fc8f9eee5ec703ebc611bc015b94fc8ecb721324))
- **ses:** Fix mistaken this binding example ([#990](https://github.com/endojs/endo/issues/990)) ([71db876](https://github.com/endojs/endo/commit/71db876ee3d7557f0f19dd995a4e027cc7945c2b))
- minor wording ([#989](https://github.com/endojs/endo/issues/989)) ([f8d6ff6](https://github.com/endojs/endo/commit/f8d6ff6c63b0c46bcaf93378b61d7286d971fd5f))
- **ses:** Add assert.error options bag to type definition ([#978](https://github.com/endojs/endo/issues/978)) ([ca42997](https://github.com/endojs/endo/commit/ca4299714d5769ea15418612f679abb400ff7e25)), closes [#977](https://github.com/endojs/endo/issues/977)
- **ses:** Number.prototype.toLocaleString radix confusion ([#975](https://github.com/endojs/endo/issues/975)) ([6a17595](https://github.com/endojs/endo/commit/6a175953e5c78d2575c2e9e4e72e6b893bcdb631)), closes [#852](https://github.com/endojs/endo/issues/852)
- **ses:** Remove superfluous error cause on prototypes ([#955](https://github.com/endojs/endo/issues/955)) ([6e50c45](https://github.com/endojs/endo/commit/6e50c4526f457b31e00a783406d175b0088907eb))

### [0.15.3](https://github.com/endojs/endo/compare/ses@0.15.2...ses@0.15.3) (2021-12-14)

**Note:** Version bump only for package ses

### [0.15.2](https://github.com/endojs/endo/compare/ses@0.15.1...ses@0.15.2) (2021-12-08)

### Bug Fixes

- **ses:** Constrain URL types in bundle script ([bdd7996](https://github.com/endojs/endo/commit/bdd79964c56e1716113f2b852f39eb3af3022742))
- **ses:** Send removal warnings to STDERR ([#949](https://github.com/endojs/endo/issues/949)) ([761774c](https://github.com/endojs/endo/commit/761774c25d318d675c3e665f6112ff946ac7b59c))
- **ses:** Windows support for bundle build script ([f8c6885](https://github.com/endojs/endo/commit/f8c6885116c52436e2fb675c1544bc765a1dd0f1))
- **ses:** Windows support for tests ([3bc504b](https://github.com/endojs/endo/commit/3bc504b5356d13e1411d127cefc7ad3bc99fbfa5))
- Avoid eslint globs for Windows ([4b4f3cc](https://github.com/endojs/endo/commit/4b4f3ccaf3f5e8d53faefb4264db343dd603bf80))
- update whitelist with stage 3 and 4 proposals ([#946](https://github.com/endojs/endo/issues/946)) ([8112430](https://github.com/endojs/endo/commit/811243015cc2e3e588080ceef6146b7b5e42f2bb))

### [0.15.1](https://github.com/endojs/endo/compare/ses@0.15.0...ses@0.15.1) (2021-11-16)

### Bug Fixes

- **ses:** Add errorTrapping none to type definition ([#935](https://github.com/endojs/endo/issues/935)) ([313d47c](https://github.com/endojs/endo/commit/313d47c5a5c02afcd57e933ca876fec22a059972))
- **ses:** Include error in trapped error log ([#936](https://github.com/endojs/endo/issues/936)) ([22c4644](https://github.com/endojs/endo/commit/22c4644b6ad31c9eb7fdb4d760d91f8667e7a2c7))

## [0.15.0](https://github.com/endojs/endo/compare/ses@0.14.4...ses@0.15.0) (2021-11-02)

### ⚠ BREAKING CHANGES

- **ses:** Withdraw support for muli-lockdown (#921)
- **ses:** Domain taming safe by default (#917)

### Features

- **ses:** Read lockdown options from environment ([#871](https://github.com/endojs/endo/issues/871)) ([789d639](https://github.com/endojs/endo/commit/789d639c25c6882153a8090f4bd74d350bb29721))

### Bug Fixes

- **ses:** Domain taming safe by default ([#917](https://github.com/endojs/endo/issues/917)) ([7039276](https://github.com/endojs/endo/commit/7039276ef91a2de2b048c91085a7557c8830f677))
- **ses:** Withdraw support for muli-lockdown ([#921](https://github.com/endojs/endo/issues/921)) ([99752b0](https://github.com/endojs/endo/commit/99752b046c2a3e2d866559bb9d58f625eb94b1a8)), closes [#814](https://github.com/endojs/endo/issues/814)

### [0.14.4](https://github.com/endojs/endo/compare/ses@0.14.3...ses@0.14.4) (2021-10-15)

### Features

- **ses:** lazily create evaluate ([f1cf92a](https://github.com/endojs/endo/commit/f1cf92a3b8e23aab3894f8431d8b65b4f75daa77))

### Bug Fixes

- **ses:** Add test and warning about the `has` hazard ([9066c97](https://github.com/endojs/endo/commit/9066c97b41b35a4e37fd12256a0802fb656af755))
- **ses:** more detailed `has` hazard test ([f010a9e](https://github.com/endojs/endo/commit/f010a9ebe09dadc72a8f22bd54caed8aa3787243))
- **ses:** Refactor Compartment to use shared evaluator ([dc0bad6](https://github.com/endojs/endo/commit/dc0bad6c1f963ff379e45f320852218228203050))

### [0.14.3](https://github.com/endojs/endo/compare/ses@0.14.2...ses@0.14.3) (2021-09-18)

### Features

- **eslint-plugin:** Add no-polymorphic-call rule ([03e8c5f](https://github.com/endojs/endo/commit/03e8c5f566a52d9d6e7fb9d876a67347ecf37324))
- **ses:** Lockdown option domainTaming ([ee3e4c3](https://github.com/endojs/endo/commit/ee3e4c309ece70249d6c95b806ca8d02549f1837))

### Bug Fixes

- **ses:** Fix reflexive imports ([d259db7](https://github.com/endojs/endo/commit/d259db75022941c4ea1881b4ca4005acc1a37a1c))
- **ses:** Search engine optimization ([#886](https://github.com/endojs/endo/issues/886)) ([ef03184](https://github.com/endojs/endo/commit/ef031843b445a4a9df7b717fba7a315371eadae0))
- add "name" to moderate override of all errors ([#867](https://github.com/endojs/endo/issues/867)) ([d608325](https://github.com/endojs/endo/commit/d608325c3edade0c64f9ca9a84379f8d3e3addf0))
- update NEWS with news of [#867](https://github.com/endojs/endo/issues/867) ([#869](https://github.com/endojs/endo/issues/869)) ([c3139d2](https://github.com/endojs/endo/commit/c3139d2ff7433afce3653639fc71a65dbe3c6313))

### [0.14.2](https://github.com/endojs/endo/compare/ses@0.14.1...ses@0.14.2) (2021-08-14)

**Note:** Version bump only for package ses

### [0.14.1](https://github.com/endojs/endo/compare/ses@0.14.0...ses@0.14.1) (2021-08-13)

### Features

- **ses:** Add permits for at methods ([#857](https://github.com/endojs/endo/issues/857)) ([8b9e138](https://github.com/endojs/endo/commit/8b9e13830113fef9c3b5a36ba88436dba5677b4c)), closes [#854](https://github.com/endojs/endo/issues/854)

## [0.14.0](https://github.com/endojs/endo/compare/ses@0.13.4...ses@0.14.0) (2021-07-22)

### ⚠ BREAKING CHANGES

- Update preamble for SES StaticModuleRecord
- **ses:** Adjust preamble for module instances to expect entries instead of a Map

### Features

- **ses:** Add errorTrapping lockdown option ([2a88adb](https://github.com/endojs/endo/commit/2a88adb2ac65ae401a20c2019fe61bac2d7b4fd2))
- **ses:** Reveal harden only after lockdown ([424af0f](https://github.com/endojs/endo/commit/424af0f0cabd28d691b3cf7183bf1a0d34f0af70)), closes [#787](https://github.com/endojs/endo/issues/787)

### Bug Fixes

- **ses:** Adjust preamble for module instances to expect entries instead of a Map ([574c518](https://github.com/endojs/endo/commit/574c518de757c34a57096ef3c5be5681249e5294))
- **ses:** Defend integrity of intrinsics ([14e451c](https://github.com/endojs/endo/commit/14e451ce32f95de68f10d15fe99a260dc638150d))
- **ses:** Fix assert type assertions ([53d284d](https://github.com/endojs/endo/commit/53d284d04eebed57ccaf19b43a1ff9a71393cc6b))
- **ses:** Fix packaging for `@web/dev-server` ([8c35e33](https://github.com/endojs/endo/commit/8c35e333818bd9e7f6630ae2be93e5ca98d85e17))
- **ses:** Fix version number errors in news ([9aff6c3](https://github.com/endojs/endo/commit/9aff6c3ca0c7cd9971879b720ca7e5ac6afff805))
- **ses:** Improve error messages for invalid module records ([5c07c85](https://github.com/endojs/endo/commit/5c07c850f8b3299aaa2042c4fbe0cf7116304284))
- **ses:** Scope proxy defense against property descriptor prototype pollution ([cbfbf85](https://github.com/endojs/endo/commit/cbfbf850139712e4ddeb97128e980353b309b4b9))
- **ses:** Use eslint-disable notation consistently ([#837](https://github.com/endojs/endo/issues/837)) ([6ddb50c](https://github.com/endojs/endo/commit/6ddb50c179e4b9e0645ab23bade6c3e5d3aa485e))
- typo vs type checker ([#798](https://github.com/endojs/endo/issues/798)) ([fcb433f](https://github.com/endojs/endo/commit/fcb433fa67584ae36b4685232259e35e7fa3b8ec))
- Update preamble for SES StaticModuleRecord ([790ed01](https://github.com/endojs/endo/commit/790ed01f0aa73ff2d232e69c9323ee0bb448c2b0))
- **ses:** Trap and report errors ([a79df15](https://github.com/endojs/endo/commit/a79df15f6dcebc8df2ddf389af605313cb1b17b0)), closes [#769](https://github.com/endojs/endo/issues/769)

### [0.13.4](https://github.com/endojs/endo/compare/ses@0.13.3...ses@0.13.4) (2021-06-20)

**Note:** Version bump only for package ses

### [0.13.3](https://github.com/endojs/endo/compare/ses@0.13.2...ses@0.13.3) (2021-06-16)

### Features

- **ses:** Improve link errors ([71a509c](https://github.com/endojs/endo/commit/71a509cd67305b5af60d66f0b2b600ed0df8b632))

### [0.13.2](https://github.com/endojs/endo/compare/ses@0.13.1...ses@0.13.2) (2021-06-14)

**Note:** Version bump only for package ses

### [0.13.1](https://github.com/endojs/endo/compare/ses@0.13.0...ses@0.13.1) (2021-06-06)

### Bug Fixes

- **ses:** Export hardener types properly ([0d2e8f0](https://github.com/endojs/endo/commit/0d2e8f0570d7de06b54b4faee56f487bbf7aeb8b))

## 0.13.0 (2021-06-02)

### ⚠ BREAKING CHANGES

- **ses:** No longer supports direct use from CommonJS
- **static-module-record:** Emphasize RESM/NESM compatibility over CJS/UMD
- **ses:** Remove evaluate endowments option (#368)
- **ses:** Simplify transforms (#325)
- **ses, transform-module:** Fix StaticModuleRecord name (#323)
- **ses:** Surface SES on globalThis (#307)

### Features

- **ses:** Add **shimTransforms** Compartment option ([#485](https://github.com/endojs/endo/issues/485)) ([5196521](https://github.com/endojs/endo/commit/5196521a17ac4b28f9aaaef2aa312eebe9edcbb7))
- **ses:** Add Compartment load function ([#349](https://github.com/endojs/endo/issues/349)) ([8352fa1](https://github.com/endojs/endo/commit/8352fa1b038ec9f6d21a1ae4b6559f687c27fd81))
- **ses:** add Compartment shim utility method **isKnownScopeProxy** ([#623](https://github.com/endojs/endo/issues/623)) ([22dbe36](https://github.com/endojs/endo/commit/22dbe368d42b983a9f8b8db3d88003b5400c3e23))
- **ses:** Add minimal Compartment to SES-lite ([#443](https://github.com/endojs/endo/issues/443)) ([3d1dfd2](https://github.com/endojs/endo/commit/3d1dfd285a758b9be5c1de766c82a12e82329224))
- **ses:** Add moduleMapHook ([#419](https://github.com/endojs/endo/issues/419)) ([f053ba4](https://github.com/endojs/endo/commit/f053ba4a0ebcb9194a8ffb880359862e3748289c))
- **ses:** Add ModuleStaticRecord ([#279](https://github.com/endojs/endo/issues/279)) ([98c3a8f](https://github.com/endojs/endo/commit/98c3a8f0696ca1fedb865fd885f0affde388fd01))
- **ses:** Add news for override mistake fix ([#417](https://github.com/endojs/endo/issues/417)) ([01bf4d7](https://github.com/endojs/endo/commit/01bf4d7ef13b32e71f2d36baef573423b21e012d))
- **ses:** Add support for third-party modules ([#393](https://github.com/endojs/endo/issues/393)) ([0abe442](https://github.com/endojs/endo/commit/0abe442311bb4555bb06be3796f9ea77e6616b38))
- **ses:** Add TypeScript definitions for Compartment aux types ([07715ce](https://github.com/endojs/endo/commit/07715cea0c053cf623e9e44e03c0c331c709eb64))
- **ses:** Allow import and eval methods ([#669](https://github.com/endojs/endo/issues/669)) ([505a7d7](https://github.com/endojs/endo/commit/505a7d7149c36825a00c9fe3795d0f1588035dde))
- **ses:** Carry compartment names in error messages ([#441](https://github.com/endojs/endo/issues/441)) ([765172a](https://github.com/endojs/endo/commit/765172aa68c338947b14ec6292be18519ac14aee))
- **ses:** Censorship error messages may now contain the source name ([#515](https://github.com/endojs/endo/issues/515)) ([2bcd726](https://github.com/endojs/endo/commit/2bcd726ee96d53da2467eb15304531d04eb683ed))
- **ses:** Create a thin lockdown layer ([#406](https://github.com/endojs/endo/issues/406)) ([ff693ae](https://github.com/endojs/endo/commit/ff693ae5e012afdd8dbbec105d0da299d36fdbf9))
- **ses:** Create ses/lockdown alias ([17d416f](https://github.com/endojs/endo/commit/17d416f1652873c75cbd6c8fd34db37e90300ea6))
- **ses:** Detect invalid sloppy mode execution ([86c4751](https://github.com/endojs/endo/commit/86c4751abb7f8ce3d44b086e50ab2a5f229e12dc)), closes [#740](https://github.com/endojs/endo/issues/740)
- **ses:** Expand TypeScript coverage for Compartment and lockdown ([#584](https://github.com/endojs/endo/issues/584)) ([e31c86b](https://github.com/endojs/endo/commit/e31c86b407be4804bdaa719da544965ec7cb4480))
- **ses:** Export SES Transforms ([#608](https://github.com/endojs/endo/issues/608)) ([5ec8858](https://github.com/endojs/endo/commit/5ec8858648254e7cd2a1bf9c054a1d5d2749c31b))
- **ses:** Prepare to publish with TypeScript definitions ([#384](https://github.com/endojs/endo/issues/384)) ([af48adb](https://github.com/endojs/endo/commit/af48adb5b9e7cf9b5a70f3c429a1219fa99718b6))
- **ses:** Replace Rollup with Endo bundler ([c826f77](https://github.com/endojs/endo/commit/c826f779660f4e17713b1750c732cc381b7bb89f))
- **ses:** Retract evaluate name option, use sourceURL ([#521](https://github.com/endojs/endo/issues/521)) ([d1fa7ec](https://github.com/endojs/endo/commit/d1fa7ecd023ca51e4fe75b15780587aabe08c3f9))
- **ses:** Support global lexicals ([#356](https://github.com/endojs/endo/issues/356)) ([aefefbf](https://github.com/endojs/endo/commit/aefefbfcbe53f5b4520542bfb4da14dd68f13ec6))
- **ses:** Surface SES on globalThis ([#307](https://github.com/endojs/endo/issues/307)) ([3ddfb95](https://github.com/endojs/endo/commit/3ddfb953098af5c0e127a5e4dbafbed2bea43a07))
- **ses:** Update packaging for RESM/NESM bridge ([6abbcdc](https://github.com/endojs/endo/commit/6abbcdc847ead40aeedb2004b8317eac06047fc0))
- create `overrideDebug: [...props]` option ([#728](https://github.com/endojs/endo/issues/728)) ([2573c1a](https://github.com/endojs/endo/commit/2573c1a0e2ebcdad030ae29e75ef4e1bce7e5594))
- **ses:** Revert "Export SES Transforms ([#608](https://github.com/endojs/endo/issues/608))" ([#618](https://github.com/endojs/endo/issues/618)) ([df5739d](https://github.com/endojs/endo/commit/df5739db9237b5cd037c88001da548a63ecf9071))
- **ses:** Support explicit exports of third-party modules ([dfa4775](https://github.com/endojs/endo/commit/dfa47754e1c0c12e3717c57eebff020887699678))
- non-security mode for create-react-scripts compat. (KLUDGE) ([#642](https://github.com/endojs/endo/issues/642)) ([6bd9f03](https://github.com/endojs/endo/commit/6bd9f03ec0c138d79391ee26894e8630cf1a104f))
- **ses:** Support importHook alias returns ([#432](https://github.com/endojs/endo/issues/432)) ([1c8e706](https://github.com/endojs/endo/commit/1c8e7066c195d212c06a31cd91efb47c2b6a3e76))

### Bug Fixes

- Add pre-publish build step ([#263](https://github.com/endojs/endo/issues/263)) ([e22f094](https://github.com/endojs/endo/commit/e22f0945c901296f3f5ca1cbe357172d21f050f9))
- Regularize format of NEWS.md ([0ec29b3](https://github.com/endojs/endo/commit/0ec29b34a18b17cc6b90e5a46575e634714e978e))
- **ses:** Address charset error in integration ([17406d6](https://github.com/endojs/endo/commit/17406d6b045eefc082a17a559efdaf29293b8093))
- **ses:** Address Parcel need for ESM export ([fb3297e](https://github.com/endojs/endo/commit/fb3297e23236313764a0faeabe87629577370f08))
- **ses:** Fix intentional typo ([da3b8aa](https://github.com/endojs/endo/commit/da3b8aa85caebc70e424dd9deae0287acb25d89e))
- **ses:** Handle null moduleMap ([b863922](https://github.com/endojs/endo/commit/b863922f50a993201aec72bc34f91a44cc286654))
- **ses:** Make dist directory before bundles ([51afb2f](https://github.com/endojs/endo/commit/51afb2fdcf1a9e1f21135988da16a4b618752ca4))
- **ses:** Remove superfluous dev dependency on @agoric/babel-standalone ([3a278b5](https://github.com/endojs/endo/commit/3a278b51c1938774cd83510ef1b37e1f44bbd34d))
- **ses:** Validate third-party static module record exports ([9ec51b3](https://github.com/endojs/endo/commit/9ec51b3941b6dbdb3c7e2820753d775fc010d4ec))
- **static-module-record:** Emphasize RESM/NESM compatibility over CJS/UMD ([dcff87e](https://github.com/endojs/endo/commit/dcff87e6f1164d664dd31dfefb323fbbac0a8dd1))
- adapt whitelist to XS. clean it up too ([#549](https://github.com/endojs/endo/issues/549)) ([bd0952a](https://github.com/endojs/endo/commit/bd0952ac6569985b7a3508b257916e262b837606))
- add "confirm" a terminating variant of "assert" ([8929475](https://github.com/endojs/endo/commit/89294755245b0c558c8cf6423f66a1a48ec7f905))
- add missing testcase ([#575](https://github.com/endojs/endo/issues/575)) ([f5e1c25](https://github.com/endojs/endo/commit/f5e1c25667e0410488ed7be7684e2cb4cae9d1a6))
- Add missing ts-checks. Fix type errors ([#565](https://github.com/endojs/endo/issues/565)) ([52e6830](https://github.com/endojs/endo/commit/52e683091ece4c0fa4c77016c517d257d42ec7e8))
- assert.typeof(xxx, 'object') should assert record or null ([#603](https://github.com/endojs/endo/issues/603)) ([c84ba97](https://github.com/endojs/endo/commit/c84ba971d5fa54fe970cbf33b044b60eaceca78f))
- blocklist properties we expect to remove ([#614](https://github.com/endojs/endo/issues/614)) ([992f35f](https://github.com/endojs/endo/commit/992f35fdf4679faa8fb7d1c7e265c6b654156399))
- comment ([#561](https://github.com/endojs/endo/issues/561)) ([5e55d16](https://github.com/endojs/endo/commit/5e55d168e2cb341c22d89954a957582e813fee69))
- comment who needs push enabled ([#596](https://github.com/endojs/endo/issues/596)) ([1218bcd](https://github.com/endojs/endo/commit/1218bcd1b22b72f285a2236b08639c5016416afc))
- comments only ([#598](https://github.com/endojs/endo/issues/598)) ([1230901](https://github.com/endojs/endo/commit/1230901717c7eae50aaa0a61a058fd99c1c61928))
- consolidate honorary native function printing ([#392](https://github.com/endojs/endo/issues/392)) ([038bb13](https://github.com/endojs/endo/commit/038bb13f8bfb56b247875c965393c804a492c463))
- Consolidate lint rules ([#262](https://github.com/endojs/endo/issues/262)) ([e5ce12a](https://github.com/endojs/endo/commit/e5ce12ac4343565f2adb0e6eca5d71c6c05903bf))
- coordinate assert typing with agoric-sdk ([#510](https://github.com/endojs/endo/issues/510)) ([195f988](https://github.com/endojs/endo/commit/195f9887119e1a81ca35dd6f445b73241a5e7338))
- correct fix for override mistake ([#409](https://github.com/endojs/endo/issues/409)) ([b576211](https://github.com/endojs/endo/commit/b5762114ecd227a1c259321ab97fda3837813199))
- de-url-ify error codes ([#548](https://github.com/endojs/endo/issues/548)) ([b7e2e2c](https://github.com/endojs/endo/commit/b7e2e2cf51fb3ac687168310af7169a8451999f1))
- eslint rule to suppress bogus dependency warning ([#483](https://github.com/endojs/endo/issues/483)) ([7e3d9ea](https://github.com/endojs/endo/commit/7e3d9ea816e1626566bc2062b83cf513020f0b8d))
- evaluate options to evade rejections ([#546](https://github.com/endojs/endo/issues/546)) ([dec75ad](https://github.com/endojs/endo/commit/dec75adedf9b19a7fb1c53e17cbaf6e9b31e7d2b))
- flatten tameFunctionToString ([#482](https://github.com/endojs/endo/issues/482)) ([3d7570f](https://github.com/endojs/endo/commit/3d7570f4aa5871ed75a99d0985d5881ab9ae3af5))
- friendlier nested console output for browsers ([#557](https://github.com/endojs/endo/issues/557)) ([2c5c622](https://github.com/endojs/endo/commit/2c5c62285516ca8642e39791666bcc5e98adb0a4))
- Fully thread **shimTransforms** through Compartment Mapper and SES ([#509](https://github.com/endojs/endo/issues/509)) ([0f199ef](https://github.com/endojs/endo/commit/0f199ef088353ec09b29e37aefcfa26a89a6c582))
- kill obsolete repair-legacy-accessors ([#552](https://github.com/endojs/endo/issues/552)) ([be202b9](https://github.com/endojs/endo/commit/be202b9861eb770bbae8d16948cede0a1b4f829b))
- Lint universal package metadata ([#266](https://github.com/endojs/endo/issues/266)) ([24ff867](https://github.com/endojs/endo/commit/24ff867adcbde89bef6b1ec702a0a8b91ad29f70))
- Massive intrinsic reform. Start vs other compartments. ([#372](https://github.com/endojs/endo/issues/372)) ([5cf2a20](https://github.com/endojs/endo/commit/5cf2a20389601d159b5c0683bb87bffd6bbc7b87))
- Move NativeErrors list to whitelist.js ([#444](https://github.com/endojs/endo/issues/444)) ([f2b8fcd](https://github.com/endojs/endo/commit/f2b8fcdf5a5f1dcaae1af93d64ebb9785f9b314b))
- no more detached properties ([#473](https://github.com/endojs/endo/issues/473)) ([efa990c](https://github.com/endojs/endo/commit/efa990cc12ac30aaa69f13df1ee9e1a7f3b12189))
- partial intrinsic reform ([#358](https://github.com/endojs/endo/issues/358)) ([9b13f73](https://github.com/endojs/endo/commit/9b13f73d282c44c11e93968332f282b5eb4372ff))
- remove "apply" from enablements whitelist ([#475](https://github.com/endojs/endo/issues/475)) ([b52f8d2](https://github.com/endojs/endo/commit/b52f8d22d380e048e5590ce74028f9a0070cf281))
- remove "debugger;" statement ([#558](https://github.com/endojs/endo/issues/558)) ([c5988e6](https://github.com/endojs/endo/commit/c5988e6a4cc576634981ba2bc152fe49a0b531f6))
- remove deprecated noTame options ([#328](https://github.com/endojs/endo/issues/328)) ([5d7b781](https://github.com/endojs/endo/commit/5d7b781d9b0783f7b1243898a36e30014e4662be))
- remove extra stackframe ([#391](https://github.com/endojs/endo/issues/391)) ([9ba5ecf](https://github.com/endojs/endo/commit/9ba5ecf019694e92ac78d98416e8c88b0e4a2cf4))
- rename to originalValue ([#476](https://github.com/endojs/endo/issues/476)) ([54e0b0c](https://github.com/endojs/endo/commit/54e0b0c910fd19bec14f9e3ff9e556f17f952fd4))
- Repair released damage caused when I merged [#552](https://github.com/endojs/endo/issues/552) ([#638](https://github.com/endojs/endo/issues/638)) ([145595c](https://github.com/endojs/endo/commit/145595c5767a6f868c13b9717a03db641e60825b))
- restore locale methods safely ([#382](https://github.com/endojs/endo/issues/382)) ([0a091a4](https://github.com/endojs/endo/commit/0a091a4fc87ecc9ee6aff227f7245c91d9a88852))
- suggested fix in [#570](https://github.com/endojs/endo/issues/570) ([#571](https://github.com/endojs/endo/issues/571)) ([3877d72](https://github.com/endojs/endo/commit/3877d72757db120cb3978ddf32a6673868dd06f0))
- tame Error constructor ([#359](https://github.com/endojs/endo/issues/359)) ([bfe610f](https://github.com/endojs/endo/commit/bfe610fe5fe7afd31659fc8e40ee6e77d622e264))
- tolerate symbols as property names ([#547](https://github.com/endojs/endo/issues/547)) ([f16bbc3](https://github.com/endojs/endo/commit/f16bbc389303eda73cd6dd1705cd667a3fc6d288))
- tolerate whitelist absence better ([#408](https://github.com/endojs/endo/issues/408)) ([9ed1ad8](https://github.com/endojs/endo/commit/9ed1ad87ba5380d39c47967fb7e9b52c4a2333e1))
- towards reconciling with agoric-sdk ([#451](https://github.com/endojs/endo/issues/451)) ([5f71e91](https://github.com/endojs/endo/commit/5f71e91c42e7b6aa2a532372d9bccef53209db46))
- typo ([#471](https://github.com/endojs/endo/issues/471)) ([d5742c2](https://github.com/endojs/endo/commit/d5742c234c2acf22c10b71f72fdb454fe0c6da8e))
- typo ([#527](https://github.com/endojs/endo/issues/527)) ([c7a3895](https://github.com/endojs/endo/commit/c7a3895100176e9b6c6e887e45181fd3a1fc2dea))
- Unsafe errorTaming and consoleTaming needs other adjustments ([#637](https://github.com/endojs/endo/issues/637)) ([70cc86e](https://github.com/endojs/endo/commit/70cc86eb400655e922413b99c38818d7b2e79da0))
- update to eslint 7.23.0 ([#652](https://github.com/endojs/endo/issues/652)) ([e9199f4](https://github.com/endojs/endo/commit/e9199f41c511b5df10593d931febdd90693b011a))
- use string instead of symbol for getter property ([e514a6e](https://github.com/endojs/endo/commit/e514a6ed88ccb0739ae1c03a35c1d9d57effe911))
- workaround remaining validation bug ([#667](https://github.com/endojs/endo/issues/667)) ([cbc3247](https://github.com/endojs/endo/commit/cbc3247bc254e1418a4398d3c1b079e4c69c2750))
- **326:** accept old and new taming options during transition ([#327](https://github.com/endojs/endo/issues/327)) ([67eb6e8](https://github.com/endojs/endo/commit/67eb6e8704386e022fbb1ff8f01beb40424d6dff))
- **ses:** Add HandledPromise to the whitelist ([#416](https://github.com/endojs/endo/issues/416)) ([a7330a8](https://github.com/endojs/endo/commit/a7330a8ce1112163982dce35d14ac8ab1ba3749f))
- **ses:** Aliasing true to t did not improve readability ([#360](https://github.com/endojs/endo/issues/360)) ([90a40c6](https://github.com/endojs/endo/commit/90a40c650214372d070d4c28e2d6e771d0874514))
- **ses:** comments ([#254](https://github.com/endojs/endo/issues/254)) ([435f1af](https://github.com/endojs/endo/commit/435f1af0b08d8dccf196b385093d629a31316b1c))
- **ses:** Fix lockdown layer pollution from module layer ([#472](https://github.com/endojs/endo/issues/472)) ([9a7a097](https://github.com/endojs/endo/commit/9a7a0975036d8d938263ba265f747876d7d91599))
- **ses:** Fix missing change to compartment load method ([42759a8](https://github.com/endojs/endo/commit/42759a8dff3b76c8f06d25904be0a58e72eeed05))
- **ses:** Generally import "ses/lockdown" ([#410](https://github.com/endojs/endo/issues/410)) ([6ef4a3f](https://github.com/endojs/endo/commit/6ef4a3ffe4ebd0145ca6af0edc8c04c2342e8cac))
- **ses:** Reform conditional tamings, especially Error ([#250](https://github.com/endojs/endo/issues/250)) ([dfa22b3](https://github.com/endojs/endo/commit/dfa22b3857f08f87f49c6ca4f51aa33fba0b1535))
- **ses:** regexp taming ([b010f8a](https://github.com/endojs/endo/commit/b010f8a1212aa949be8aa4970eb4ebc25aa83517)), closes [#237](https://github.com/endojs/endo/issues/237)
- **ses:** remove code that failed to add species ([3cfc8da](https://github.com/endojs/endo/commit/3cfc8da4646aa8306b09189dc0e202db0d633a65)), closes [#239](https://github.com/endojs/endo/issues/239)
- **ses:** Remove evaluate endowments option ([#368](https://github.com/endojs/endo/issues/368)) ([e7b7b6e](https://github.com/endojs/endo/commit/e7b7b6eb8d2565886f9bbf7021223bcf96dc9173))
- **ses:** Simplify transforms ([#325](https://github.com/endojs/endo/issues/325)) ([86a373e](https://github.com/endojs/endo/commit/86a373e008e97b2a30c25ee53df86ab120a7804b))
- **ses:** Spelling errors ([#362](https://github.com/endojs/endo/issues/362)) ([8f606f4](https://github.com/endojs/endo/commit/8f606f424f8b103f9ddb593d210e2e58f37430c4))
- **ses:** transform is an object with a rewrite method ([#255](https://github.com/endojs/endo/issues/255)) ([979fbc6](https://github.com/endojs/endo/commit/979fbc6fc9529d2b7516c9e99dcd6c1a7f4c1db3)), closes [#248](https://github.com/endojs/endo/issues/248) [#248](https://github.com/endojs/endo/issues/248)
- **ses:** Unravel compartment/lockdown import cycle ([#405](https://github.com/endojs/endo/issues/405)) ([b931629](https://github.com/endojs/endo/commit/b9316296ac04bd840fb434ee86a819f8717f561d))
- **ses:** Use CommonJS Rollup plugin ([#354](https://github.com/endojs/endo/issues/354)) ([f626365](https://github.com/endojs/endo/commit/f6263657fe7364df85cfe14e31ba1ac4dd7f03af))
- **ses, transform-module:** Fix StaticModuleRecord name ([#323](https://github.com/endojs/endo/issues/323)) ([10eb49a](https://github.com/endojs/endo/commit/10eb49ad499984dc44d99e84b5d59a34f1abb73b))
