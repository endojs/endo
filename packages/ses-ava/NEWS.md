User-visible changes in `@endo/ses-ava`:

# Next release

- Rather that writing your own `./prepare-test-env-ava.js` or similar
  to setup a ses-ava `test` function, you can now simply
  ```js
  import test from '@endo/ses-ava';
  ```
  This will set various options appropriately to help debug your tests.
- Ava's `t.log` buffers logged messages, so it can be output later with its
  test case. But this uses Ava's own console emulation.
  This loses all the redacted error information printed by SES's `console`.
  Ses-ava's virtual `t.log` now combines these advantages,
  using SES's console logic to show an error's hidden information,
  while directing the output from that logic through Ava's original `t.log`,
  so it appears at the right position.

# 0.2.38 (2023-03-07)

* Support the full ava API ([#1235](https://github.com/endojs/endo/issues/1235))

# 0.2.0 (2021-06-01)

* *BREAKING*: Removes CommonJS and UMD downgrade compatibility.
  Supporting both Node.js ESM and the `node -r esm` shim requires the main
  entry point module to be ESM regardless of environment.
  UMD and CommonJS facets will likely return after all dependees have migrated
  away from depending upon the `esm` JavaScript module emulator.
* Expose internal `package.json` through Node.js ESM `exports` for the benefit
  of `svelte` tooling.

# 0.1.1 (2021-05-05)

- Extended ses-ava to support the macro feature of the Ava API.

# 0.1.0

- Initial release.
