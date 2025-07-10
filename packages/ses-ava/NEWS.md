User-visible changes in `@endo/ses-ava`:

# Next release

- With an appropriate pair of Ava configurations, packages can now run the same
  tests with or without an initialized Endo environment.
  This is useful for packages that can be used with or without Endo
  and need to cover both configurations in their tests.
  To achieve this, `ses-ava` introduces two new exported modules:
  `@endo/ses-ava/test.js` and `@endo/ses-ava/prepare-endo-config.js`.
  The package can use separate scripts in `package.json` for SES and no-SES
  tests:
  ```json
  {
    "scripts": {
      "test": "yarn test:ses && yarn test:noses",
      "test:ses": "ava --config test/_ava-ses.config.js",
      "test:noses": "ava --config test/_ava-noses.config.js"
    }
  }
  ```
  The contents of `test/_ava-ses.config.js` pull in the new prepare endo config
  module.
  The only difference between this module and `@endo/ses-ava/prepare-endo.js`
  is that it does not export a `default`.
  Ava expects the `default` function exported by these modules to have a
  different behavior, so we must mask our `test` function.
  ```js
  export default {
    require: ['@endo/ses-ava/prepare-endo-config.js'],
  };
  ```
  The contents of `test/_ava-noses.config.js`:
  ```js
  export default {
    // Shims for a non-lockdown environment
    require: [
      // We initialize SES here without lockdown in order to receive the
      // effects of the immutable-arraybuffer and assert shims.
      'ses',
      // For HandledPromise
      '@endo/eventual-send/shim.js',
    ],
  };

# v1.2.0 (204-03-19)

- Rather that writing your own `./prepare-test-env-ava.js` or similar
  to setup a ses-ava `test` function, you can now simply
  ```js
  import test from '@endo/ses-ava/prepare-endo.js';
  ```
  This will set various options appropriately to help you debug your tests.
  Dependent packages must still take a direct dependency on `ava` and may choose
  from either version range `^5.3.0` or `^6.1.2`.
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
