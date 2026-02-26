# Change Log

## 1.1.0

### Minor Changes

- [#3008](https://github.com/endojs/endo/pull/3008) [`029dcc4`](https://github.com/endojs/endo/commit/029dcc464cd93bc7380da45e694585ab2f7aa139) Thanks [@kriskowal](https://github.com/kriskowal)! - - Introduces `@endo/harden`, providing a `harden` implementation that works
  both inside and outside HardenedJS.
  - Supports the `hardened` and `harden:unsafe` build conditions to select
    hardened-environment and no-op behaviors.
  - Detects pre-lockdown use of `harden` so `lockdown()` fails with a helpful
    error instead of leaving modules incorrectly hardened.

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.
