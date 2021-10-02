# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

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
