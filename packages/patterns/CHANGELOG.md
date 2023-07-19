# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

### [0.2.3](https://github.com/endojs/endo/compare/@endo/patterns@0.2.2...@endo/patterns@0.2.3) (2023-07-19)


### Features

* **ses:** Add assert.raw for embedding unquoted strings in details ([652df0c](https://github.com/endojs/endo/commit/652df0ca6a2fbca5db3026d26141da41cdde318e))
* **types:** parameterize InterfaceGuard ([645a7a8](https://github.com/endojs/endo/commit/645a7a80a45303e6412405b9c4feeb1406592c0c))


### Bug Fixes

* mismatch errors should not redact the pattern ([a95e7fb](https://github.com/endojs/endo/commit/a95e7fb2229fc2b129e32f62ff5faf3db651a326))
* **patterns:** Allow `matches(nonKey, key)` to reject successfully ([cebc442](https://github.com/endojs/endo/commit/cebc44209bdc97543685d1609b566495684460d9))
* **patterns:** Implement M.null() and M.undefined() as Key Patterns ([88f3ce9](https://github.com/endojs/endo/commit/88f3ce962886564bc0ae00ae39b4b7b1050062a4)), closes [#1601](https://github.com/endojs/endo/issues/1601)



### [0.2.2](https://github.com/endojs/endo/compare/@endo/patterns@0.2.1...@endo/patterns@0.2.2) (2023-04-20)

### Bug Fixes

- **patterns:** correct types ([b73622b](https://github.com/endojs/endo/commit/b73622bf16f0dabc7f1e0ceee013c8bec5543a2f))

### [0.2.1](https://github.com/endojs/endo/compare/@endo/patterns@0.2.0...@endo/patterns@0.2.1) (2023-04-14)

### Bug Fixes

- copy collection param type defaults ([98634b0](https://github.com/endojs/endo/commit/98634b033901714eecf5d0f85a74e143a2a42f56))
- sync with shadows in agoric-sdk ([19e2833](https://github.com/endojs/endo/commit/19e28339e359791fd2a9f78d2c3801598e3894ca))

## 0.2.0 (2023-03-07)

### ⚠ BREAKING CHANGES

- rename 'fit' to 'mustMatch' (#1464)

### Features

- **exo:** start migrating exo from @agoric/store ([#1459](https://github.com/endojs/endo/issues/1459)) ([a882b7c](https://github.com/endojs/endo/commit/a882b7ca88863d7f85310074c38f3cc0032e1e0e))
- **patterns:** Start migrating patterns from @agoric/store to new @endo/patterns ([#1451](https://github.com/endojs/endo/issues/1451)) ([69b61e3](https://github.com/endojs/endo/commit/69b61e3f9a0af9a9714413708ddb9bcf68772846))

### Bug Fixes

- Fix hackerone.com links in SECURITY.md ([#1472](https://github.com/endojs/endo/issues/1472)) ([389733d](https://github.com/endojs/endo/commit/389733dbc7a74992f909c38d27ea7e8e68623959))

### Miscellaneous Chores

- rename 'fit' to 'mustMatch' ([#1464](https://github.com/endojs/endo/issues/1464)) ([a4f88f8](https://github.com/endojs/endo/commit/a4f88f8ef1e7d62b993900244e260d90113f9759))

## 0.2.0 (2023-03-07)

### ⚠ BREAKING CHANGES

- rename 'fit' to 'mustMatch' (#1464)

### Features

- **exo:** start migrating exo from @agoric/store ([#1459](https://github.com/endojs/endo/issues/1459)) ([a882b7c](https://github.com/endojs/endo/commit/a882b7ca88863d7f85310074c38f3cc0032e1e0e))
- **patterns:** Start migrating patterns from @agoric/store to new @endo/patterns ([#1451](https://github.com/endojs/endo/issues/1451)) ([69b61e3](https://github.com/endojs/endo/commit/69b61e3f9a0af9a9714413708ddb9bcf68772846))

### Bug Fixes

- Fix hackerone.com links in SECURITY.md ([#1472](https://github.com/endojs/endo/issues/1472)) ([389733d](https://github.com/endojs/endo/commit/389733dbc7a74992f909c38d27ea7e8e68623959))

### Miscellaneous Chores

- rename 'fit' to 'mustMatch' ([#1464](https://github.com/endojs/endo/issues/1464)) ([a4f88f8](https://github.com/endojs/endo/commit/a4f88f8ef1e7d62b993900244e260d90113f9759))
