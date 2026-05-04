1. [x] run `yarn run format`  commit any changes

2. [x] run all lint and typedoc checkers, make fix any errors in @endo/genie or @endo/sandbox, commit as you go

3. [x] run the test suite locally, fix any easy failures in @endo/genie or @endo/sandbox, commit as you go
   - `cd packages/genie && npx corepack yarn test` → 378 tests passed
   - `cd packages/sandbox && npx corepack yarn test` → 58 + 58 tests passed (lockdown + noop-harden configs)
   - No failures; nothing to fix or commit.

If you run into anything especially thorny or large, write it down in follow-up `TODO/` tasks, this session should only make light clerical changes, nothing semantic.
