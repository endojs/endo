# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

### [0.7.9](https://github.com/endojs/endo/compare/@endo/static-module-record@0.7.8...@endo/static-module-record@0.7.9) (2022-08-26)

**Note:** Version bump only for package @endo/static-module-record





### [0.7.8](https://github.com/endojs/endo/compare/@endo/static-module-record@0.7.7...@endo/static-module-record@0.7.8) (2022-08-25)

**Note:** Version bump only for package @endo/static-module-record





### [0.7.7](https://github.com/endojs/endo/compare/@endo/static-module-record@0.7.6...@endo/static-module-record@0.7.7) (2022-08-23)


### Bug Fixes

* more hardens ([#1241](https://github.com/endojs/endo/issues/1241)) ([b6ff811](https://github.com/endojs/endo/commit/b6ff8118a92fd72c5309b2bb285fac08d0531d92))



### [0.7.6](https://github.com/endojs/endo/compare/@endo/static-module-record@0.7.5...@endo/static-module-record@0.7.6) (2022-06-28)


### Features

* add the foundations for support of import.meta ([36f6449](https://github.com/endojs/endo/commit/36f644998c21f6333268707555b97938ff0fff08))
* call importMetaHook on instantiation if import.meta uttered by module ([23e8c40](https://github.com/endojs/endo/commit/23e8c405e0be823c728f8af1a6db9607e21f2f74))


### Bug Fixes

* **compartment-mapper:** importMeta always an empty object in bundler ([e9f809a](https://github.com/endojs/endo/commit/e9f809a0e3242421d9c32388f2bc885eb8d9510e))
* **static-module-record:** babelPlugin visitor to not skip declarations in exports + benchmark setup ([#1188](https://github.com/endojs/endo/issues/1188)) ([d3a137c](https://github.com/endojs/endo/commit/d3a137c02fa88486ec009413bb004d0baf2c9d5c))
* rename meta to importMeta, fix detection to detect import.meta not import.meta.something ([c61a862](https://github.com/endojs/endo/commit/c61a862c9f4354f0e6d86d8c8efaa826840a6efd))



### [0.7.5](https://github.com/endojs/endo/compare/@endo/static-module-record@0.7.4...@endo/static-module-record@0.7.5) (2022-06-11)


### Bug Fixes

* **static-module-record:** Make types consistent with implementation ([#1184](https://github.com/endojs/endo/issues/1184)) ([5b7e3a6](https://github.com/endojs/endo/commit/5b7e3a6d006a686520c4ffeedea5428a720f7e7d))



### [0.7.4](https://github.com/endojs/endo/compare/@endo/static-module-record@0.7.3...@endo/static-module-record@0.7.4) (2022-04-15)

**Note:** Version bump only for package @endo/static-module-record





### [0.7.3](https://github.com/endojs/endo/compare/@endo/static-module-record@0.7.2...@endo/static-module-record@0.7.3) (2022-04-14)

**Note:** Version bump only for package @endo/static-module-record





### [0.7.2](https://github.com/endojs/endo/compare/@endo/static-module-record@0.7.1...@endo/static-module-record@0.7.2) (2022-04-13)


### Bug Fixes

* Revert dud release ([c8a7101](https://github.com/endojs/endo/commit/c8a71017d8d7af10a97909c9da9c5c7e59aed939))



### [0.7.1](https://github.com/endojs/endo/compare/@endo/static-module-record@0.7.0...@endo/static-module-record@0.7.1) (2022-04-12)


### Bug Fixes

* **static-module-record:** use `Object.create(null)` to prevent crashes ([6af1201](https://github.com/endojs/endo/commit/6af1201969319cf17a22b289e920c67a7fce47bd))



## [0.7.0](https://github.com/endojs/endo/compare/@endo/static-module-record@0.6.15...@endo/static-module-record@0.7.0) (2022-03-07)


### ⚠ BREAKING CHANGES

* **static-module-record:** remove dependencies on `@babel/standalone`

### Bug Fixes

* **static-module-record:** remove dependencies on `@babel/standalone` ([1a1d1a4](https://github.com/endojs/endo/commit/1a1d1a4f5a7094f32d3e1edfc620e64065771efa))



### [0.6.15](https://github.com/endojs/endo/compare/@endo/static-module-record@0.6.14...@endo/static-module-record@0.6.15) (2022-03-02)


### Features

* **bundle-source:** use newer babel with Agoric fixes ([e68f794](https://github.com/endojs/endo/commit/e68f794a182182d8e64bce2829dd90b4d9e4d947))



### [0.6.14](https://github.com/endojs/endo/compare/@endo/static-module-record@0.6.13...@endo/static-module-record@0.6.14) (2022-02-20)

**Note:** Version bump only for package @endo/static-module-record





### [0.6.13](https://github.com/endojs/endo/compare/@endo/static-module-record@0.6.12...@endo/static-module-record@0.6.13) (2022-02-18)


### Bug Fixes

* Make jsconfigs less brittle ([861ca32](https://github.com/endojs/endo/commit/861ca32a72f0a48410fd93b1cbaaad9139590659))
* Make sure lint:type runs correctly in CI ([a520419](https://github.com/endojs/endo/commit/a52041931e72cb7b7e3e21dde39c099cc9f262b0))
* Unify TS version to ~4.2 ([5fb173c](https://github.com/endojs/endo/commit/5fb173c05c9427dca5adfe66298c004780e8b86c))


### Reverts

* Revert "Revert "fix(static-module-record): minimise source changes with `recast`"" ([ce53158](https://github.com/endojs/endo/commit/ce5315849ffcb71794f3264871b371eb5ae6d00c))



### [0.6.12](https://github.com/endojs/endo/compare/@endo/static-module-record@0.6.11...@endo/static-module-record@0.6.12) (2022-01-31)

**Note:** Version bump only for package @endo/static-module-record





### [0.6.11](https://github.com/endojs/endo/compare/@endo/static-module-record@0.6.10...@endo/static-module-record@0.6.11) (2022-01-27)


### Bug Fixes

* Publish all materials consistently ([#1021](https://github.com/endojs/endo/issues/1021)) ([a2c74d9](https://github.com/endojs/endo/commit/a2c74d9de68a325761d62e1b2187a117ef884571))



### [0.6.10](https://github.com/endojs/endo/compare/@endo/static-module-record@0.6.9...@endo/static-module-record@0.6.10) (2022-01-25)

**Note:** Version bump only for package @endo/static-module-record





### [0.6.9](https://github.com/endojs/endo/compare/@endo/static-module-record@0.6.8...@endo/static-module-record@0.6.9) (2022-01-23)

**Note:** Version bump only for package @endo/static-module-record





### [0.6.8](https://github.com/endojs/endo/compare/@endo/static-module-record@0.6.7...@endo/static-module-record@0.6.8) (2021-12-14)


### Bug Fixes

* **static-module-record:** Account for unlocated nodes in displayAsExport ([d8770d1](https://github.com/endojs/endo/commit/d8770d1dceacd6298ed0b228b9552fc6cf8ba07b))


### Reverts

* Revert "build(deps): add a patched version of `recast`" ([1d800ef](https://github.com/endojs/endo/commit/1d800ef6bba28b575bb38f44c9e8f85de7246997))
* Revert "fix(static-module-record): minimise source changes with `recast`" ([9c76633](https://github.com/endojs/endo/commit/9c7663388576ab93d9f4a3b7fb55d3e20c4e9b45))



### [0.6.7](https://github.com/endojs/endo/compare/@endo/static-module-record@0.6.6...@endo/static-module-record@0.6.7) (2021-12-08)


### Bug Fixes

* Avoid eslint globs for Windows ([4b4f3cc](https://github.com/endojs/endo/commit/4b4f3ccaf3f5e8d53faefb4264db343dd603bf80))
* **static-module-record:** cleaner Babel codegen ([6e22569](https://github.com/endojs/endo/commit/6e22569b0c3f56e9f78d59943235b97ba0429921))
* **static-module-record:** minimise source changes with `recast` ([ce464ff](https://github.com/endojs/endo/commit/ce464ffddc9fbee27ab167b5cb06e0c788ae31e7))



### [0.6.6](https://github.com/endojs/endo/compare/@endo/static-module-record@0.6.5...@endo/static-module-record@0.6.6) (2021-11-16)

**Note:** Version bump only for package @endo/static-module-record





### [0.6.5](https://github.com/endojs/endo/compare/@endo/static-module-record@0.6.4...@endo/static-module-record@0.6.5) (2021-11-02)

**Note:** Version bump only for package @endo/static-module-record





### [0.6.4](https://github.com/endojs/endo/compare/@endo/static-module-record@0.6.3...@endo/static-module-record@0.6.4) (2021-10-15)

**Note:** Version bump only for package @endo/static-module-record





### [0.6.3](https://github.com/endojs/endo/compare/@endo/static-module-record@0.6.2...@endo/static-module-record@0.6.3) (2021-09-18)


### Bug Fixes

* **static-module-record:** Opt out of compact codegen ([d113270](https://github.com/endojs/endo/commit/d1132708fb4204b99c4646b3788d6e0b3e81dc9d))



### [0.6.2](https://github.com/endojs/endo/compare/@endo/static-module-record@0.6.1...@endo/static-module-record@0.6.2) (2021-08-14)

**Note:** Version bump only for package @endo/static-module-record





### [0.6.1](https://github.com/endojs/endo/compare/@endo/static-module-record@0.6.0...@endo/static-module-record@0.6.1) (2021-08-13)


### Bug Fixes

* **static-module-record:** Do not duplicate comments ([#863](https://github.com/endojs/endo/issues/863)) ([85136e3](https://github.com/endojs/endo/commit/85136e314ecbe238a82e86c47be1757ef2887dd2))



## [0.6.0](https://github.com/endojs/endo/compare/@endo/static-module-record@0.5.4...@endo/static-module-record@0.6.0) (2021-07-22)


### ⚠ BREAKING CHANGES

* Update preamble for SES StaticModuleRecord
* **static-module-record:** Remove reliance on Map in scope of preamble

### Bug Fixes

* Update preamble for SES StaticModuleRecord ([790ed01](https://github.com/endojs/endo/commit/790ed01f0aa73ff2d232e69c9323ee0bb448c2b0))
* **static-module-record:** Remove reliance on Map in scope of preamble ([4b4aa65](https://github.com/endojs/endo/commit/4b4aa65a039ea5297970c9d2ac3c0a3827a4f3f8))



### [0.5.4](https://github.com/endojs/endo/compare/@endo/static-module-record@0.5.3...@endo/static-module-record@0.5.4) (2021-06-20)


### Bug Fixes

* **static-module-record:** Propagate explicit types ([a625ca4](https://github.com/endojs/endo/commit/a625ca4cb3642bc4923becdef62224bde6738aca))



### [0.5.3](https://github.com/endojs/endo/compare/@endo/static-module-record@0.5.2...@endo/static-module-record@0.5.3) (2021-06-16)

**Note:** Version bump only for package @endo/static-module-record





### [0.5.2](https://github.com/endojs/endo/compare/@endo/static-module-record@0.5.1...@endo/static-module-record@0.5.2) (2021-06-14)

**Note:** Version bump only for package @endo/static-module-record





### [0.5.1](https://github.com/endojs/endo/compare/@endo/static-module-record@0.5.0...@endo/static-module-record@0.5.1) (2021-06-06)

**Note:** Version bump only for package @endo/static-module-record





## 0.5.0 (2021-06-02)


### ⚠ BREAKING CHANGES

* **static-module-record:** No longer supports direct use from CommonJS
* **static-module-record:** Emphasize RESM/NESM compatibility over CJS/UMD

### Features

* **static-module-record:** Make source location argument optional ([c8ada3e](https://github.com/endojs/endo/commit/c8ada3e70c2f71386c32eb1151133ad3c9c841c9))
* **static-module-record:** Update packaging for RESM/NESM bridge ([fe5059d](https://github.com/endojs/endo/commit/fe5059d3cc866b0f65f9395fbc0ad00cb610044b))


### Bug Fixes

* Regularize format of NEWS.md ([0ec29b3](https://github.com/endojs/endo/commit/0ec29b34a18b17cc6b90e5a46575e634714e978e))
* **static-module-record:** Emphasize RESM/NESM compatibility over CJS/UMD ([dcff87e](https://github.com/endojs/endo/commit/dcff87e6f1164d664dd31dfefb323fbbac0a8dd1))
* **static-module-record:** Fix export name as ([2f13a08](https://github.com/endojs/endo/commit/2f13a084df5b24ae53ca574b91b97cca3f8c664c))
* **static-module-record:** Fix RESM/NESM babel import compatibility ([59c6d6f](https://github.com/endojs/endo/commit/59c6d6f03f7b6abea7ea656a566b60056333017c))
* **static-module-record:** Fix treatment of local vs exported names in test scaffold ([5422e4f](https://github.com/endojs/endo/commit/5422e4f35590136b28b516af0515e580f2290445))
* **static-module-record:** make exported unassigned functions fixed ([96d26cc](https://github.com/endojs/endo/commit/96d26ccff62c238acd03c87d6e04e9e5304dc943))
* **static-module-record:** preserve function hoisting when export defaulted ([11fe4b2](https://github.com/endojs/endo/commit/11fe4b25778fd79c8395d88a6f91f050ffcc786d))
