---
'@endo/ses-ava': minor
---

- Introduces a `ses-ava` command for running tests with multiple AVA configurations.
- Adds an `@endo/ses-ava/test.js` module for getting a `test` function
  appropriate for your configuration.
- Adds an `@endo/ses-ava/prepare-endo-config.js` module suitable for use in the
  `require` clause of an AVA configuration, such that `@endo/ses-ava/test.js`
  exports a wrapped SES-AVA `test` function.
