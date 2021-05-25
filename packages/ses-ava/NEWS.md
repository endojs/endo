User-visible changes in SES-Ava

## Next Release

- *BREAKING*: Removes compatibility layer for UMD and CommonJS consumers.
  Supporting both Node.js ESM and the `node -r esm` shim requires
  the main entry point module to be ESM regardless of environment.
* Expose internal `package.json` through Node.js ESM `exports` for the benefit
  of `svelte` tooling.

## Release 0.1.1 (5-April-2021)

- Extended ses-ava to support the macro feature of the Ava API.

## Release 0.1.0

- Initial release.
