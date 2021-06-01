User-visible changes to the compartment mapper:

## Next release

- Reenables CommonJS support with a fast lexer and without a dependency on
  Babel.
- The Compartment Mapper now produces archives containing SES-shim
  pre-compiled StaticModuleRecords for ESM instead of the source.
- The Compartment Mapper can now produce bundles of concatenated modules but
  without Compartments and only supporting ESM but not supporting live
  bindings.
- Adds entrypoint modules `import.js`, `archive.js`, and `import-archive.js`
  to capture narrower dependency subgraphs.
- *BREAKING*: Removes CommonJS and UMD downgrade compatibility.
  Supporting both Node.js ESM and the `node -r esm` shim requires the main
  entry point module to be ESM regardless of environment.
  UMD and CommonJS facets will likely return after all dependees have migrated
  away from depending upon the `esm` JavaScript module emulator.
- *BREAKING*: Archives created for the previous version will no longer work.
  The `importArchive` feature only supports pre-compiled ESM and CJS.
- *BREAKING*: This release parallels a breaking upgrade for SES to version
  0.13. This entails the removal of `StaticModuleRecord` from SES, and the
  removal of the `ses/lockdown` light layering (there is no heavy layer to
  distinguish as the weight has shifted to the `@endo/static-module-record`
  package).
- Archives are now deterministic.

# 0.2.4 (2021-03-30)

- Applications may now have asynchronous module transforms, per language.
  When applied to archive creation, the transformed sources appear in the
  archive.
- Every compartment's `globalThis` is frozen.

# 0.2.3 (2020-11-05)

- Embellishes all calls to methods named `import` to work around SES-shim
  `Compartment` censoring for dynamic import, using properties instead
  of parentheses, since the syntax transformation tools at hand do not
  currently simplify these.

# 0.2.2 (2020-11-05)

- Embellishes all calls to methods named `import` to work around SES-shim
  `Compartment` censoring for dynamic import.

# 0.2.1 (2020-11-04)

- Changes all private fields to internal weak maps to Compartment Mapper
  can be read by parsers that do not yet support private fields.

# 0.2.0 (2020-11-03)

- *BREAKING*: All `import` methods now take an options bag that may contain
  `globals` and `modules` options if present, instead of these as positional
  arguments.
- *BREAKING*: Support for CommonJS is temporarily withdrawn to relieve a
  dependency on Node.js built-ins entrained by Babel that in turn make
  Compartment Mapper unusable with a combination of `-r esm` and Rollup.
  CommonJS support should be restored with an alternate implementation in
  a future version.
- The `import` options bag now also accepts `globalLexicals`, `transforms`, and
  `__shimTransforms__`, passing these without alteration to each `Compartment`.
- The `import` options bag now also accepts a `Compartment` constructor, to use
  instead of the one assumed to be present globally.

#  0.1.0 (2020-09-21)

- This initial relase supports importing, archiving, and importing archives
  with the same authorities delegated to every compartment in an application.
  Future releases will support the attenuation of authority per-compartment,
  broaden support for Node.js module conventions, address the issue
  of shimming, and orchestrate SES lockdown.
