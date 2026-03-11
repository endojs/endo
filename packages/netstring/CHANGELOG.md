# @endo/netstring

## 1.1.0

### Minor Changes

- [#3008](https://github.com/endojs/endo/pull/3008) [`d83b1ab`](https://github.com/endojs/endo/commit/d83b1ab9fabc4f7b9b12fa9574749e46e03f26ea) Thanks [@kriskowal](https://github.com/kriskowal)! - - Relaxes dependence on a global, post-lockdown `harden` function by taking a
  dependency on the new `@endo/harden` package.
  Consequently, bundles will now entrain a `harden` implementation that is
  superfluous if the bundled program is guaranteed to run in a post-lockdown
  HardenedJS environment.
  To compensate, use `bundle-source` with `-C hardened` or the analogous feature
  for packaging conditions with your preferred bundler tool.
  This will hollow out `@endo/harden` and defer exclusively to the global
  `harden`.

### Patch Changes

- Updated dependencies [[`2e00276`](https://github.com/endojs/endo/commit/2e00276ce0f08beb5e5259b8df195063fe008fe7), [`029dcc4`](https://github.com/endojs/endo/commit/029dcc464cd93bc7380da45e694585ab2f7aa139), [`a29ecd4`](https://github.com/endojs/endo/commit/a29ecd44c788440faf016f1f8e658a5a364d6181), [`d83b1ab`](https://github.com/endojs/endo/commit/d83b1ab9fabc4f7b9b12fa9574749e46e03f26ea), [`b8b52ce`](https://github.com/endojs/endo/commit/b8b52cef026a340b37ea91953476713e4258df0b)]:
  - ses@1.15.0
  - @endo/harden@1.1.0
  - @endo/promise-kit@1.2.0
  - @endo/stream@1.3.0
  - @endo/init@1.1.13

## [1.0.18](https://github.com/endojs/endo/compare/@endo/netstring@1.0.17...@endo/netstring@1.0.18) (2025-07-12)

**Note:** Version bump only for package @endo/netstring

## [1.0.17](https://github.com/endojs/endo/compare/@endo/netstring@1.0.16...@endo/netstring@1.0.17) (2025-06-17)

**Note:** Version bump only for package @endo/netstring

## [1.0.16](https://github.com/endojs/endo/compare/@endo/netstring@1.0.15...@endo/netstring@1.0.16) (2025-06-02)

**Note:** Version bump only for package @endo/netstring

## [1.0.15](https://github.com/endojs/endo/compare/@endo/netstring@1.0.14...@endo/netstring@1.0.15) (2025-03-24)

**Note:** Version bump only for package @endo/netstring

## [1.0.14](https://github.com/endojs/endo/compare/@endo/netstring@1.0.13...@endo/netstring@1.0.14) (2025-01-24)

**Note:** Version bump only for package @endo/netstring

## [1.0.13](https://github.com/endojs/endo/compare/@endo/netstring@1.0.12...@endo/netstring@1.0.13) (2024-11-13)

**Note:** Version bump only for package @endo/netstring

## [1.0.12](https://github.com/endojs/endo/compare/@endo/netstring@1.0.11...@endo/netstring@1.0.12) (2024-10-22)

**Note:** Version bump only for package @endo/netstring

## [1.0.11](https://github.com/endojs/endo/compare/@endo/netstring@1.0.10...@endo/netstring@1.0.11) (2024-10-10)

**Note:** Version bump only for package @endo/netstring

## [1.0.10](https://github.com/endojs/endo/compare/@endo/netstring@1.0.9...@endo/netstring@1.0.10) (2024-08-27)

**Note:** Version bump only for package @endo/netstring

## [1.0.9](https://github.com/endojs/endo/compare/@endo/netstring@1.0.8...@endo/netstring@1.0.9) (2024-08-01)

**Note:** Version bump only for package @endo/netstring

## [1.0.8](https://github.com/endojs/endo/compare/@endo/netstring@1.0.7...@endo/netstring@1.0.8) (2024-07-30)

**Note:** Version bump only for package @endo/netstring

## [1.0.7](https://github.com/endojs/endo/compare/@endo/netstring@1.0.6...@endo/netstring@1.0.7) (2024-05-07)

**Note:** Version bump only for package @endo/netstring

## [1.0.6](https://github.com/endojs/endo/compare/@endo/netstring@1.0.5...@endo/netstring@1.0.6) (2024-04-04)

**Note:** Version bump only for package @endo/netstring

## [1.0.5](https://github.com/endojs/endo/compare/@endo/netstring@1.0.4...@endo/netstring@1.0.5) (2024-03-20)

**Note:** Version bump only for package @endo/netstring

## [1.0.4](https://github.com/endojs/endo/compare/@endo/netstring@1.0.3...@endo/netstring@1.0.4) (2024-02-23)

**Note:** Version bump only for package @endo/netstring

## [1.0.3](https://github.com/endojs/endo/compare/@endo/netstring@1.0.2...@endo/netstring@1.0.3) (2024-02-15)

### Bug Fixes

- Add repository directory to all package descriptors ([e5f36e7](https://github.com/endojs/endo/commit/e5f36e7a321c13ee25e74eb74d2a5f3d7517119c))
- Edit change logs ([8186abe](https://github.com/endojs/endo/commit/8186abe62ed60c8db92ef8ddd39891dcf2863ee4))

## [1.0.2](https://github.com/endojs/endo/compare/@endo/netstring@1.0.1...@endo/netstring@1.0.2) (2024-01-18)

### Bug Fixes

- Explicitly harden prototypes ([3f98274](https://github.com/endojs/endo/commit/3f9827429dc79105230e8f5377dcc6a14038e9f5))

## [1.0.1](https://github.com/endojs/endo/compare/@endo/netstring@1.0.0...@endo/netstring@1.0.1) (2023-12-20)

**Note:** Version bump only for package @endo/netstring

## [1.0.0](https://github.com/endojs/endo/compare/@endo/netstring@0.3.30...@endo/netstring@1.0.0) (2023-12-12)

### Bug Fixes

- Adjust type generation in release process and CI ([9465be3](https://github.com/endojs/endo/commit/9465be369e53167815ca444f6293a8e9eb48501d))
- **netstring:** Fix writer early return during chunked write ([ae1d93b](https://github.com/endojs/endo/commit/ae1d93b37f7416853805abb276282ab876fdd04d))

## [0.3.30](https://github.com/endojs/endo/compare/@endo/netstring@0.3.29...@endo/netstring@0.3.30) (2023-09-12)

**Note:** Version bump only for package @endo/netstring

## [0.3.29](https://github.com/endojs/endo/compare/@endo/netstring@0.3.27...@endo/netstring@0.3.29) (2023-08-07)

**Note:** Version bump only for package @endo/netstring

## [0.3.28](https://github.com/endojs/endo/compare/@endo/netstring@0.3.27...@endo/netstring@0.3.28) (2023-08-07)

**Note:** Version bump only for package @endo/netstring

## [0.3.27](https://github.com/endojs/endo/compare/@endo/netstring@0.3.26...@endo/netstring@0.3.27) (2023-07-19)

**Note:** Version bump only for package @endo/netstring

## [0.3.26](https://github.com/endojs/endo/compare/@endo/netstring@0.3.25...@endo/netstring@0.3.26) (2023-04-20)

**Note:** Version bump only for package @endo/netstring

## [0.3.25](https://github.com/endojs/endo/compare/@endo/netstring@0.3.24...@endo/netstring@0.3.25) (2023-04-14)

**Note:** Version bump only for package @endo/netstring

## [0.3.24](https://github.com/endojs/endo/compare/@endo/netstring@0.3.23...@endo/netstring@0.3.24) (2023-03-07)

### Bug Fixes

- Fix hackerone.com links in SECURITY.md ([#1472](https://github.com/endojs/endo/issues/1472)) ([389733d](https://github.com/endojs/endo/commit/389733dbc7a74992f909c38d27ea7e8e68623959))

## [0.3.23](https://github.com/endojs/endo/compare/@endo/netstring@0.3.22...@endo/netstring@0.3.23) (2022-12-23)

**Note:** Version bump only for package @endo/netstring

## [0.3.22](https://github.com/endojs/endo/compare/@endo/netstring@0.3.21...@endo/netstring@0.3.22) (2022-11-14)

**Note:** Version bump only for package @endo/netstring

## [0.3.21](https://github.com/endojs/endo/compare/@endo/netstring@0.3.20...@endo/netstring@0.3.21) (2022-10-24)

**Note:** Version bump only for package @endo/netstring

## [0.3.20](https://github.com/endojs/endo/compare/@endo/netstring@0.3.19...@endo/netstring@0.3.20) (2022-10-19)

**Note:** Version bump only for package @endo/netstring

## [0.3.19](https://github.com/endojs/endo/compare/@endo/netstring@0.3.18...@endo/netstring@0.3.19) (2022-09-27)

**Note:** Version bump only for package @endo/netstring

## [0.3.18](https://github.com/endojs/endo/compare/@endo/netstring@0.3.17...@endo/netstring@0.3.18) (2022-09-14)

- Adds a maxMessageLength option for protection against denial of service.
- Adds a chunked mode for writers.
- Allows allocation avoidance for writers that can forward an array of byte arrays.

## [0.3.17](https://github.com/endojs/endo/compare/@endo/netstring@0.3.16...@endo/netstring@0.3.17) (2022-08-26)

**Note:** Version bump only for package @endo/netstring

## [0.3.16](https://github.com/endojs/endo/compare/@endo/netstring@0.3.15...@endo/netstring@0.3.16) (2022-08-26)

**Note:** Version bump only for package @endo/netstring

## [0.3.15](https://github.com/endojs/endo/compare/@endo/netstring@0.3.14...@endo/netstring@0.3.15) (2022-08-25)

**Note:** Version bump only for package @endo/netstring

## [0.3.14](https://github.com/endojs/endo/compare/@endo/netstring@0.3.13...@endo/netstring@0.3.14) (2022-08-23)

**Note:** Version bump only for package @endo/netstring

## [0.3.13](https://github.com/endojs/endo/compare/@endo/netstring@0.3.12...@endo/netstring@0.3.13) (2022-06-28)

### Bug Fixes

- tests use debug settings ([#1213](https://github.com/endojs/endo/issues/1213)) ([c92e02a](https://github.com/endojs/endo/commit/c92e02aa70c2687abdf4c8fd8dd661e221c0e9fe))

## [0.3.12](https://github.com/endojs/endo/compare/@endo/netstring@0.3.11...@endo/netstring@0.3.12) (2022-06-11)

**Note:** Version bump only for package @endo/netstring

## [0.3.11](https://github.com/endojs/endo/compare/@endo/netstring@0.3.10...@endo/netstring@0.3.11) (2022-04-15)

**Note:** Version bump only for package @endo/netstring

## [0.3.10](https://github.com/endojs/endo/compare/@endo/netstring@0.3.9...@endo/netstring@0.3.10) (2022-04-14)

**Note:** Version bump only for package @endo/netstring

## [0.3.9](https://github.com/endojs/endo/compare/@endo/netstring@0.3.8...@endo/netstring@0.3.9) (2022-04-13)

### Bug Fixes

- Revert dud release ([c8a7101](https://github.com/endojs/endo/commit/c8a71017d8d7af10a97909c9da9c5c7e59aed939))

## [0.3.8](https://github.com/endojs/endo/compare/@endo/netstring@0.3.7...@endo/netstring@0.3.8) (2022-04-12)

**Note:** Version bump only for package @endo/netstring

## [0.3.7](https://github.com/endojs/endo/compare/@endo/netstring@0.3.6...@endo/netstring@0.3.7) (2022-03-07)

**Note:** Version bump only for package @endo/netstring

## [0.3.6](https://github.com/endojs/endo/compare/@endo/netstring@0.3.5...@endo/netstring@0.3.6) (2022-03-02)

**Note:** Version bump only for package @endo/netstring

## [0.3.5](https://github.com/endojs/endo/compare/@endo/netstring@0.3.4...@endo/netstring@0.3.5) (2022-02-20)

**Note:** Version bump only for package @endo/netstring

## [0.3.4](https://github.com/endojs/endo/compare/@endo/netstring@0.3.3...@endo/netstring@0.3.4) (2022-02-18)

### Bug Fixes

- Address TypeScript recommendations ([2d1e1e0](https://github.com/endojs/endo/commit/2d1e1e0bdd385a514315be908c33b8f8eb157295))
- Make jsconfigs less brittle ([861ca32](https://github.com/endojs/endo/commit/861ca32a72f0a48410fd93b1cbaaad9139590659))
- Type definitions canot overshadow ([4d193fd](https://github.com/endojs/endo/commit/4d193fd3387dadd6f55fd51ad872f10878ef46f9))
- Make sure lint:type runs correctly in CI ([a520419](https://github.com/endojs/endo/commit/a52041931e72cb7b7e3e21dde39c099cc9f262b0))
- Unify TS version to ~4.2 ([5fb173c](https://github.com/endojs/endo/commit/5fb173c05c9427dca5adfe66298c004780e8b86c))

## [0.3.3](https://github.com/endojs/endo/compare/@endo/netstring@0.3.2...@endo/netstring@0.3.3) (2022-01-31)

**Note:** Version bump only for package @endo/netstring

## [0.3.2](https://github.com/endojs/endo/compare/@endo/netstring@0.3.1...@endo/netstring@0.3.2) (2022-01-27)

### Bug Fixes

- Publish all materials consistently ([#1021](https://github.com/endojs/endo/issues/1021)) ([a2c74d9](https://github.com/endojs/endo/commit/a2c74d9de68a325761d62e1b2187a117ef884571))

## [0.3.1](https://github.com/endojs/endo/compare/@endo/netstring@0.3.0...@endo/netstring@0.3.1) (2022-01-25)

**Note:** Version bump only for package @endo/netstring

## [0.3.0](https://github.com/endojs/endo/compare/@endo/netstring@0.2.13...@endo/netstring@0.3.0) (2022-01-23)

- _BREAKING_: This package is now hardened and depends on Hardened JavaScript
  and remotable promises (eventual send).
  Use `@endo/init` before initializing this module.

## [0.2.13](https://github.com/endojs/endo/compare/@endo/netstring@0.2.12...@endo/netstring@0.2.13) (2021-12-14)

**Note:** Version bump only for package @endo/netstring

## [0.2.12](https://github.com/endojs/endo/compare/@endo/netstring@0.2.11...@endo/netstring@0.2.12) (2021-12-08)

### Bug Fixes

- Avoid eslint globs for Windows ([4b4f3cc](https://github.com/endojs/endo/commit/4b4f3ccaf3f5e8d53faefb4264db343dd603bf80))

## [0.2.11](https://github.com/endojs/endo/compare/@endo/netstring@0.2.10...@endo/netstring@0.2.11) (2021-11-16)

**Note:** Version bump only for package @endo/netstring

## [0.2.10](https://github.com/endojs/endo/compare/@endo/netstring@0.2.9...@endo/netstring@0.2.10) (2021-11-02)

**Note:** Version bump only for package @endo/netstring

## [0.2.9](https://github.com/endojs/endo/compare/@endo/netstring@0.2.8...@endo/netstring@0.2.9) (2021-10-15)

- Adds support for concurrent writes.

## [0.2.8](https://github.com/endojs/endo/compare/@endo/netstring@0.2.7...@endo/netstring@0.2.8) (2021-09-18)

**Note:** Version bump only for package @endo/netstring

## [0.2.7](https://github.com/endojs/endo/compare/@endo/netstring@0.2.6...@endo/netstring@0.2.7) (2021-08-14)

### Bug Fixes

- **netstring:** Fix TypeScript definition typo ([#865](https://github.com/endojs/endo/issues/865)) ([cf0cb44](https://github.com/endojs/endo/commit/cf0cb44225f83635bade21b916f3914b222b1710))

## [0.2.6](https://github.com/endojs/endo/compare/@endo/netstring@0.2.5...@endo/netstring@0.2.6) (2021-08-13)

### Bug Fixes

- **netstring:** Explicitly export types ([#856](https://github.com/endojs/endo/issues/856)) ([cd87163](https://github.com/endojs/endo/commit/cd87163fdbc7014d8b0d07d372cabfec36227a81))

## [0.2.5](https://github.com/endojs/endo/compare/@endo/netstring@0.2.4...@endo/netstring@0.2.5) (2021-07-22)

**Note:** Version bump only for package @endo/netstring

## [0.2.4](https://github.com/endojs/endo/compare/@endo/netstring@0.2.3...@endo/netstring@0.2.4) (2021-06-20)

**Note:** Version bump only for package @endo/netstring

## [0.2.3](https://github.com/endojs/endo/compare/@endo/netstring@0.2.2...@endo/netstring@0.2.3) (2021-06-16)

**Note:** Version bump only for package @endo/netstring

## [0.2.2](https://github.com/endojs/endo/compare/@endo/netstring@0.2.1...@endo/netstring@0.2.2) (2021-06-14)

**Note:** Version bump only for package @endo/netstring

## [0.2.1](https://github.com/endojs/endo/compare/@endo/netstring@0.2.0...@endo/netstring@0.2.1) (2021-06-06)

**Note:** Version bump only for package @endo/netstring

## 0.2.0 (2021-06-02)

- _BREAKING_: Removes CommonJS and UMD downgrade compatibility.
  Supporting both Node.js ESM and the `node -r esm` shim requires the main
  entry point module to be ESM regardless of environment.
  UMD and CommonJS facets will likely return after all dependees have migrated
  away from depending upon the `esm` JavaScript module emulator.
- Fixes a problem with the external visibility of TypeScript types.

## 0.1.0 (2021-04-26)

- Initial release
