# @endo/eslint-plugin

## 2.6.0

### Minor Changes

- [#3263](https://github.com/endojs/endo/pull/3263) [`c423ed3`](https://github.com/endojs/endo/commit/c423ed37b4c574aaccd778fc72acb2ff8910d586) Thanks [@kriskowal](https://github.com/kriskowal)! - The `internal` preset now enforces `unicorn/numeric-separators-style` with
  default groupings: decimal numbers of five or more digits must use underscore
  separators every three digits, and hexadecimal, binary, and octal literals must
  use the rule's conventional group lengths.
  Consumers of `plugin:@endo/internal` will see lint errors on numeric literals
  that violate the rule; `eslint --fix` rewrites them automatically.
  Sites extending the preset must add `eslint-plugin-unicorn` to their devDeps.

- [#3277](https://github.com/endojs/endo/pull/3277) [`da632a2`](https://github.com/endojs/endo/commit/da632a20788a17c1e80c6fee8071ca78a52be9c4) Thanks [@kriskowal](https://github.com/kriskowal)! - The `@endo/harden-exports` rule now skips named exports whose initializer is
  a Pattern maker call of the form `M.something(...)`.
  Pattern makers return values that are already hardened, so a follow-up
  `harden(name)` after their export is redundant noise.

  A new companion rule, `@endo/no-harden-pattern-maker`, surfaces existing
  sites where code over-hardens a Pattern maker result.
  The rule fires on both `harden(M.string())` and the indirect form
  `const x = M.string(); harden(x);`, and is included in the recommended
  configuration as a warning so existing code doesn't break loudly while
  the redundant calls are cleaned up.

### Patch Changes

- [#3292](https://github.com/endojs/endo/pull/3292) [`62d1b0a`](https://github.com/endojs/endo/commit/62d1b0acafa2a865e37f4efc3b3a08aaed2e96df) Thanks [@turadg](https://github.com/turadg)! - Declare `@typescript-eslint/*` and `typescript-eslint` as caret ranges
  (`^8.39.1`) rather than exact pins, so consumers can dedupe them against
  their own typescript-eslint versions instead of being forced onto a
  single release. Also drop the redundant `parserOptions.project` from the
  internal config: typescript-eslint 8.60 errors when `project` is set
  alongside `projectService`, which now supplies the type-aware program.

## 2.5.0

### Minor Changes

- [#3255](https://github.com/endojs/endo/pull/3255) [`638306e`](https://github.com/endojs/endo/commit/638306eacce0b58055ac2c6d3f000a0edbd30f4f) Thanks [@kriskowal](https://github.com/kriskowal)! - Migrate the bundled `@endo/imports` ESLint config off the unmaintained `eslint-plugin-import` and onto the actively-maintained `eslint-plugin-import-x` soft fork.
  This is done via a Yarn package alias (`eslint-plugin-import: 'npm:eslint-plugin-import-x@4.16.2'` in the `dev` catalog), so the package on disk is still named `eslint-plugin-import` and ESLint continues to register its rules under the existing `import/*` namespace.
  The import-x implementation ships its own `unrs-resolver`, which natively honours the `package.json` `exports` field, so the explicit `import/resolver` settings block is no longer required and has been removed.
  Downstream consumers do not need to rename any `import/*` rule references; existing `eslintrc` snippets continue to work.

### Patch Changes

- [#3274](https://github.com/endojs/endo/pull/3274) [`e153a5a`](https://github.com/endojs/endo/commit/e153a5afa74e78d5d89d86a3740a8c3cb7f19c19) Thanks [@kriskowal](https://github.com/kriskowal)! - `harden-exports` now collects export names from all binding pattern shapes
  that may appear on the left-hand side of `export const ... = ...`:
  aliased object destructuring (`{ propName: aliasName }`), object and array
  rest, nested patterns, sparse holes, and default-value assignment patterns.
  A new `unknownBindingPattern` report surfaces any pattern type the helper
  does not recognize, in place of silent passthrough.

## [2.4.0](https://github.com/endojs/endo/compare/@endo/eslint-plugin@2.3.2...@endo/eslint-plugin@2.4.0) (2025-07-12)

### Features

- **eslint-plugin:** Add ses configuration ([eeed479](https://github.com/endojs/endo/commit/eeed479d407fcb15334eb85929a5148421cadb8c))

## [2.3.2](https://github.com/endojs/endo/compare/@endo/eslint-plugin@2.3.1...@endo/eslint-plugin@2.3.2) (2025-06-17)

**Note:** Version bump only for package @endo/eslint-plugin

## [2.3.1](https://github.com/endojs/endo/compare/@endo/eslint-plugin@2.3.0...@endo/eslint-plugin@2.3.1) (2025-06-02)

**Note:** Version bump only for package @endo/eslint-plugin

## [2.3.0](https://github.com/endojs/endo/compare/@endo/eslint-plugin@2.2.3...@endo/eslint-plugin@2.3.0) (2025-01-24)

### Features

- **ses:** Add XS variant of shim ([f6c8456](https://github.com/endojs/endo/commit/f6c84566bb6a698709dc3474726000f07b94f3db))

## [2.2.3](https://github.com/endojs/endo/compare/@endo/eslint-plugin@2.2.2...@endo/eslint-plugin@2.2.3) (2024-11-13)

**Note:** Version bump only for package @endo/eslint-plugin

## [2.2.2](https://github.com/endojs/endo/compare/@endo/eslint-plugin@2.2.1...@endo/eslint-plugin@2.2.2) (2024-10-10)

**Note:** Version bump only for package @endo/eslint-plugin

## [2.2.1](https://github.com/endojs/endo/compare/@endo/eslint-plugin@2.2.0...@endo/eslint-plugin@2.2.1) (2024-08-27)

**Note:** Version bump only for package @endo/eslint-plugin

## [2.2.0](https://github.com/endojs/endo/compare/@endo/eslint-plugin@2.1.3...@endo/eslint-plugin@2.2.0) (2024-07-30)

### Features

- auto-fix for harden-exports rule ([b07a159](https://github.com/endojs/endo/commit/b07a159490a3217643ecd147a361a25f27a25460))
- error attempting to harden 'function' export ([d799b69](https://github.com/endojs/endo/commit/d799b69191883d9dd097b8e2b3873947ee13ac28))
- harden-exports rule ([9f5ed41](https://github.com/endojs/endo/commit/9f5ed41a40f01e6d8f7648b2e6827ce6a4db68d5))
- **harden-exports:** handle TypeScript ([387409c](https://github.com/endojs/endo/commit/387409c7dfbc29d332a3721fba6ab2ed1a6c2772))

## [2.1.3](https://github.com/endojs/endo/compare/@endo/eslint-plugin@2.1.2...@endo/eslint-plugin@2.1.3) (2024-05-07)

**Note:** Version bump only for package @endo/eslint-plugin

## [2.1.2](https://github.com/endojs/endo/compare/@endo/eslint-plugin@2.1.1...@endo/eslint-plugin@2.1.2) (2024-04-04)

**Note:** Version bump only for package @endo/eslint-plugin

## [2.1.1](https://github.com/endojs/endo/compare/@endo/eslint-plugin@2.1.0...@endo/eslint-plugin@2.1.1) (2024-03-20)

**Note:** Version bump only for package @endo/eslint-plugin

## [2.1.0](https://github.com/endojs/endo/compare/@endo/eslint-plugin@2.0.2...@endo/eslint-plugin@2.1.0) (2024-02-23)

### Features

- **ses:** permit Promise.any, AggregateError ([6a8c4d8](https://github.com/endojs/endo/commit/6a8c4d8795c991cdaf542d5dcb691aae4e989d79))

### Bug Fixes

- Relax lint for optional chaining and nullish coallescing for daemon ([ff58c06](https://github.com/endojs/endo/commit/ff58c065130b774ccb3c9cddbb7562505f0e43a0))

## [2.0.2](https://github.com/endojs/endo/compare/@endo/eslint-plugin@2.0.1...@endo/eslint-plugin@2.0.2) (2024-02-15)

### Bug Fixes

- Add repository directory to all package descriptors ([e5f36e7](https://github.com/endojs/endo/commit/e5f36e7a321c13ee25e74eb74d2a5f3d7517119c))

## [2.0.1](https://github.com/endojs/endo/compare/@endo/eslint-plugin@2.0.0...@endo/eslint-plugin@2.0.1) (2024-01-18)

**Note:** Version bump only for package @endo/eslint-plugin

## [2.0.0](https://github.com/endojs/endo/compare/@endo/eslint-plugin@1.0.0...@endo/eslint-plugin@2.0.0) (2023-12-20)

### ⚠ BREAKING CHANGES

- **eslint-plugin:** Disallow ?? and ?. operators

### Features

- **eslint-plugin:** Disallow ?? and ?. operators ([15b543a](https://github.com/endojs/endo/commit/15b543ace415c8c5848bbf50aac758bf94d4ce09))

### Bug Fixes

- **eslint-plugin:** Relax null coalescing and optional chaining to warning ([3ffb01e](https://github.com/endojs/endo/commit/3ffb01efc775a37a909c5a3bc3bc07d338ba65e5))

## [1.0.0](https://github.com/endojs/endo/compare/@endo/eslint-plugin@0.5.2...@endo/eslint-plugin@1.0.0) (2023-12-12)

**Note:** Version bump only for package @endo/eslint-plugin

## [0.5.2](https://github.com/endojs/endo/compare/@endo/eslint-plugin@0.5.1...@endo/eslint-plugin@0.5.2) (2023-09-12)

**Note:** Version bump only for package @endo/eslint-plugin

## [0.5.1](https://github.com/endojs/endo/compare/@endo/eslint-plugin@0.4.5...@endo/eslint-plugin@0.5.1) (2023-08-07)

### Features

- always lint types ([cf68fb0](https://github.com/endojs/endo/commit/cf68fb0cfdba5a1deb03b27df9b7f49f6499448f))

### Bug Fixes

- **typescript-eslint:** workaround for `exports.js` with `.d.ts` ([8a956d8](https://github.com/endojs/endo/commit/8a956d89ef02ed6f0c8c14fcb3987f3c80e89e84))

## [0.5.0](https://github.com/endojs/endo/compare/@endo/eslint-plugin@0.4.5...@endo/eslint-plugin@0.5.0) (2023-08-07)

### Features

- always lint types ([cf68fb0](https://github.com/endojs/endo/commit/cf68fb0cfdba5a1deb03b27df9b7f49f6499448f))

### Bug Fixes

- **typescript-eslint:** workaround for `exports.js` with `.d.ts` ([8a956d8](https://github.com/endojs/endo/commit/8a956d89ef02ed6f0c8c14fcb3987f3c80e89e84))

## [0.4.5](https://github.com/endojs/endo/compare/@endo/eslint-plugin@0.4.4...@endo/eslint-plugin@0.4.5) (2023-07-19)

**Note:** Version bump only for package @endo/eslint-plugin

## [0.4.4](https://github.com/endojs/endo/compare/@endo/eslint-plugin@0.4.3...@endo/eslint-plugin@0.4.4) (2023-04-14)

### Features

- **eslint-plugin:** separate rules into subsets ([688e89c](https://github.com/endojs/endo/commit/688e89c80dccb2ec01183a5a4c3600f72078e67b))

## [0.4.3](https://github.com/endojs/endo/compare/@endo/eslint-plugin@0.4.2...@endo/eslint-plugin@0.4.3) (2023-03-07)

### Features

- **eslint-config:** Use relational comparison operand type checking when possible ([be5b279](https://github.com/endojs/endo/commit/be5b279eea48009645e230260eeebe0e987cba86))
- **eslint-plugin:** Add a custom rule for rejecting mixed-type relational comparison ([90bb19d](https://github.com/endojs/endo/commit/90bb19d8ce55faa681e1c73175f9e607f4aa33d0))

### Bug Fixes

- Fix hackerone.com links in SECURITY.md ([#1472](https://github.com/endojs/endo/issues/1472)) ([389733d](https://github.com/endojs/endo/commit/389733dbc7a74992f909c38d27ea7e8e68623959))

## [0.4.2](https://github.com/endojs/endo/compare/@endo/eslint-plugin@0.4.1...@endo/eslint-plugin@0.4.2) (2022-12-23)

**Note:** Version bump only for package @endo/eslint-plugin

## [0.4.1](https://github.com/endojs/endo/compare/@endo/eslint-plugin@0.4.0...@endo/eslint-plugin@0.4.1) (2022-06-28)

**Note:** Version bump only for package @endo/eslint-plugin

## [0.4.0](https://github.com/endojs/endo/compare/@endo/eslint-plugin@0.3.28...@endo/eslint-plugin@0.4.0) (2022-06-11)

### ⚠ BREAKING CHANGES

- **eslint:** move env config to recommended

### Code Refactoring

- **eslint:** move env config to recommended ([276afad](https://github.com/endojs/endo/commit/276afad1c8f94cf5b99967e81c3229b8451897b0))

## [0.3.28](https://github.com/endojs/endo/compare/@endo/eslint-plugin@0.3.27...@endo/eslint-plugin@0.3.28) (2022-04-15)

**Note:** Version bump only for package @endo/eslint-plugin

## [0.3.27](https://github.com/endojs/endo/compare/@endo/eslint-plugin@0.3.26...@endo/eslint-plugin@0.3.27) (2022-04-14)

**Note:** Version bump only for package @endo/eslint-plugin

## [0.3.26](https://github.com/endojs/endo/compare/@endo/eslint-plugin@0.3.25...@endo/eslint-plugin@0.3.26) (2022-04-13)

### Bug Fixes

- Revert dud release ([c8a7101](https://github.com/endojs/endo/commit/c8a71017d8d7af10a97909c9da9c5c7e59aed939))

## [0.3.25](https://github.com/endojs/endo/compare/@endo/eslint-plugin@0.3.24...@endo/eslint-plugin@0.3.25) (2022-04-12)

**Note:** Version bump only for package @endo/eslint-plugin

## [0.3.24](https://github.com/endojs/endo/compare/@endo/eslint-plugin@0.3.23...@endo/eslint-plugin@0.3.24) (2022-03-07)

**Note:** Version bump only for package @endo/eslint-plugin

## [0.3.23](https://github.com/endojs/endo/compare/@endo/eslint-plugin@0.3.22...@endo/eslint-plugin@0.3.23) (2022-03-02)

**Note:** Version bump only for package @endo/eslint-plugin

## [0.3.22](https://github.com/endojs/endo/compare/@endo/eslint-plugin@0.3.21...@endo/eslint-plugin@0.3.22) (2022-02-20)

**Note:** Version bump only for package @endo/eslint-plugin

## [0.3.21](https://github.com/endojs/endo/compare/@endo/eslint-plugin@0.3.20...@endo/eslint-plugin@0.3.21) (2022-02-18)

**Note:** Version bump only for package @endo/eslint-plugin

## [0.3.20](https://github.com/endojs/endo/compare/@endo/eslint-plugin@0.3.19...@endo/eslint-plugin@0.3.20) (2022-01-31)

**Note:** Version bump only for package @endo/eslint-plugin

## [0.3.19](https://github.com/endojs/endo/compare/@endo/eslint-plugin@0.3.18...@endo/eslint-plugin@0.3.19) (2022-01-27)

**Note:** Version bump only for package @endo/eslint-plugin

## [0.3.18](https://github.com/endojs/endo/compare/@endo/eslint-plugin@0.3.17...@endo/eslint-plugin@0.3.18) (2022-01-25)

**Note:** Version bump only for package @endo/eslint-plugin

## [0.3.17](https://github.com/endojs/endo/compare/@endo/eslint-plugin@0.3.16...@endo/eslint-plugin@0.3.17) (2022-01-23)

**Note:** Version bump only for package @endo/eslint-plugin

## [0.3.16](https://github.com/endojs/endo/compare/@endo/eslint-plugin@0.3.15...@endo/eslint-plugin@0.3.16) (2021-12-14)

**Note:** Version bump only for package @endo/eslint-plugin

## [0.3.15](https://github.com/endojs/endo/compare/@endo/eslint-plugin@0.3.14...@endo/eslint-plugin@0.3.15) (2021-12-08)

### Bug Fixes

- Rewrite erroneous changelog repository references ([ab52b93](https://github.com/endojs/endo/commit/ab52b93db31d74be8c2407b719a54e0896ed6b70))

## [0.3.14](https://github.com/endojs/endo/compare/@endo/eslint-plugin@0.3.13...@endo/eslint-plugin@0.3.14) (2021-11-16)

**Note:** Version bump only for package @endo/eslint-plugin

## [0.3.13](https://github.com/endojs/endo/compare/@endo/eslint-plugin@0.3.12...@endo/eslint-plugin@0.3.13) (2021-11-02)

**Note:** Version bump only for package @endo/eslint-plugin

## [0.3.12](https://github.com/endojs/endo/compare/@endo/eslint-plugin@0.3.11...@endo/eslint-plugin@0.3.12) (2021-10-15)

**Note:** Version bump only for package @endo/eslint-plugin

## [0.3.11](https://github.com/endojs/endo/compare/@endo/eslint-plugin@0.3.10...@endo/eslint-plugin@0.3.11) (2021-09-18)

### Features

- **eslint-plugin:** Add no-polymorphic-call rule ([03e8c5f](https://github.com/endojs/endo/commit/03e8c5f566a52d9d6e7fb9d876a67347ecf37324))

## [0.3.10](https://github.com/endojs/endo/compare/@endo/eslint-plugin@0.3.9...@endo/eslint-plugin@0.3.10) (2021-08-14)

**Note:** Version bump only for package @endo/eslint-plugin

## [0.3.9](https://github.com/endojs/endo/compare/@endo/eslint-plugin@0.3.8...@endo/eslint-plugin@0.3.9) (2021-08-13)

### Features

- delegate linting to the `[@jessie](https://github.com/jessie).js/eslint-plugin` ([43718d1](https://github.com/endojs/endo/commit/43718d150a86f2cfc3e9115a0b1935378ffe7c15))

## [0.3.8](https://github.com/endojs/endo/compare/@endo/eslint-plugin@0.3.7...@endo/eslint-plugin@0.3.8) (2021-07-22)

**Note:** Version bump only for package @endo/eslint-plugin

## [0.3.7](https://github.com/endojs/endo/compare/@endo/eslint-plugin@0.3.6...@endo/eslint-plugin@0.3.7) (2021-06-20)

**Note:** Version bump only for package @endo/eslint-plugin

## [0.3.6](https://github.com/endojs/endo/compare/@endo/eslint-plugin@0.3.5...@endo/eslint-plugin@0.3.6) (2021-06-16)

**Note:** Version bump only for package @endo/eslint-plugin

## [0.3.5](https://github.com/endojs/endo/compare/@endo/eslint-plugin@0.3.4...@endo/eslint-plugin@0.3.5) (2021-06-14)

**Note:** Version bump only for package @endo/eslint-plugin

## [0.3.4](https://github.com/endojs/endo/compare/@endo/eslint-plugin@0.3.3...@endo/eslint-plugin@0.3.4) (2021-06-06)

**Note:** Version bump only for package @endo/eslint-plugin

## 0.3.3 (2021-06-02)

**Note:** Version bump only for package @endo/eslint-plugin

## [0.3.2](https://github.com/Agoric/agoric-sdk/compare/@agoric/eslint-plugin@0.3.1...@agoric/eslint-plugin@0.3.2) (2021-05-10)

**Note:** Version bump only for package @agoric/eslint-plugin

## [0.3.1](https://github.com/Agoric/agoric-sdk/compare/@agoric/eslint-plugin@0.3.0...@agoric/eslint-plugin@0.3.1) (2021-05-05)

**Note:** Version bump only for package @agoric/eslint-plugin

## [0.3.0](https://github.com/Agoric/agoric-sdk/compare/@agoric/eslint-plugin@0.2.3...@agoric/eslint-plugin@0.3.0) (2021-05-05)

### Features

- upgrade use-jessie eslint, and honour '// [@jessie-check](https://github.com/jessie-check)' ([fd1c24a](https://github.com/Agoric/agoric-sdk/commit/fd1c24a84584f6b5f7b7d5e8b21d756464db05b6))

## [0.2.3](https://github.com/Agoric/agoric-sdk/compare/@agoric/eslint-plugin@0.2.2...@agoric/eslint-plugin@0.2.3) (2021-04-07)

**Note:** Version bump only for package @agoric/eslint-plugin

## [0.2.2](https://github.com/Agoric/agoric-sdk/compare/@agoric/eslint-plugin@0.2.1...@agoric/eslint-plugin@0.2.2) (2021-04-06)

### Bug Fixes

- update eslint version ([#2804](https://github.com/Agoric/agoric-sdk/issues/2804)) ([3fc6c5e](https://github.com/Agoric/agoric-sdk/commit/3fc6c5e593f7cdcf5f908365c29cc469e309229d))

## [0.2.1](https://github.com/Agoric/agoric-sdk/compare/@agoric/eslint-plugin@0.2.0...@agoric/eslint-plugin@0.2.1) (2021-03-24)

**Note:** Version bump only for package @agoric/eslint-plugin

## [0.2.0](https://github.com/Agoric/agoric-sdk/compare/@agoric/eslint-plugin@0.1.1...@agoric/eslint-plugin@0.2.0) (2021-03-16)

### Bug Fixes

- make separate 'test:xs' target, remove XS from 'test' target ([b9c1a69](https://github.com/Agoric/agoric-sdk/commit/b9c1a6987093fc8e09e8aba7acd2a1618413bac8)), closes [#2647](https://github.com/Agoric/agoric-sdk/issues/2647)

### Features

- eslint 'use jessie'; detection and first cut at rules ([9ea9909](https://github.com/Agoric/agoric-sdk/commit/9ea99097336ade6bb5645b06a1714e38c7185864))

## [0.1.1](https://github.com/Agoric/agoric-sdk/compare/@agoric/eslint-plugin@0.1.0...@agoric/eslint-plugin@0.1.1) (2021-02-22)

**Note:** Version bump only for package @agoric/eslint-plugin

## 0.1.0 (2021-02-16)

### Features

- make @agoric/eslint-plugin deal with assert.fail as throw ([f23adee](https://github.com/Agoric/agoric-sdk/commit/f23adee512aec50788d9c9efed1cea9d774dfe8f))
