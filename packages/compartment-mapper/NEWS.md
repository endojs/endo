User-visible changes to `@endo/compartment-mapper`:

# Next release

- `mapNodeModules` and all functions that use it now tolerate the absence of
  expected packages.
  These packages are now omitted from the generated package skeleton map.
  So, loading a physically missing module now occurs during the load phase
  instead of the mapping phase.
- Adds a `strict` option to all functions that `mapNodeModules` to restore old
  behavior, which produces an error early if, for example, a non-optional
  peer dependency is missing.
  Peer dependencies are strictly required unless `peerDependenciesMeta` has an
  object with a truthy `optional` entry.
  Correct interpretation of `peerDependencies` is not distributed evenly, so
  this behavior is no longer the default.

Experimental:

- The module `@endo/compartment-mapper/import-archive-parsers.js` does not
  support modules in archives in their original ESM (`mjs`) or CommonJS (`cjs`)
  formats because they entrain Babel and a full JavaScript lexer that are
  not suitable for use in all environments, specifically XS.
  This version introduces an elective
  `@endo/compartment-mapper/import-archive-all-parsers.js` that has all of the
  precompiled module parsers (`pre-cjs-json` and `pre-mjs-json`) that Endo's
  bundler currently produces by default and additionally parsers for original
  sources (`mjs`, `cjs`).
  Also, provided the `xs` package condition,
  `@endo/compartment-mapper/import-archive-parsers.js` now falls through to the
  native `ModuleSource` and safely includes `mjs` and `cjs` without entraining
  Babel, but is only supported in conjunction with the `__native__` option
  for `Compartment`, `importArchive`, `parseArchive`, and `importBundle`.
  With the `node` package condition (present by default when running ESM on
  `node`), `@endo/compartment-mapper/import-archive-parsers.js` also now
  includes `mjs` and `cjs` by entraining Babel, which performs adequately on
  that platform.
- Adds a `__native__: true` option to all paths to import, that indicates that
  the application will fall through to the native implementation of
  Compartment, currently only available on XS, which lacks support for
  precompiled module sources (as exist in many archived applications,
  particularly Agoric smart contract bundles) and instead supports loading
  modules from original sources (which is not possible at runtime on XS).


# v1.4.0 (2024-11-13)

- Adds options `languageForExtension`, `moduleLanguageForExtension`,
  `commonjsLanguageForExtension`, and `languages` to `mapNodeModules` and
  `compartmentMapForNodeModules` allowing for certain mappings from extension
  (e.g., `ts`) to language (e.g., `mts` or `cts`) to depend on the each
  package’s `type` in the way we already vary `js` between `cjs` and `mjs`.
  These options enter through the high level functions including `makeArchive`
  and `importLocation`.
- The new options `workspaceLanguageForExtension`,
  `workspaceModuleLanguageForExtension`, and
  `workspaceCommonjsLanguageForExtension` apply like the above except more
  specifically and for packages that are not physically located under a
  `node_modules` directory, indicating that JavaScript has not yet been
  generated from any non-JavaScript source files.
- Omits unused module descriptors from `compartment-map.json` in archived
  applications, potentially reducing file sizes.
- Fixes an issue where errors thrown from exit module hooks (`importHook`) would
  be thrown at parse-time when the parser uses heuristic import analysis
  _instead of_ at runtime. Such errors will now be thrown at runtime, as
  originally intended. To those who expected the previous behavior: if you
  exist, please exercise caution when upgrading.

# v1.3.0 (2024-10-10)

- Adds support for dynamic requires in CommonJS modules. This requires specific
  configuration to be passed in (including new read powers), and is _not_
  enabled by default. See the signature of `loadFromMap()` in `import-lite.js`
  for details.

# v1.2.0 (2024-07-30)

- Fixes incompatible behavior with Node.js package conditional exports #2276.
  Previously, the last matching tag would override all prior matches, often
  causing a bundle to adopt the `default` instead of a more specific condition.
- Adds `parserForLanguage` and `languageForExtension` options to all modes of
  operation such that the compartment mapper can analyze and bundle languages
  apart from the built-in languages, which include `esm` and `cjs`.
  The `languageForExtension` option provides defaults for the entire
  application and the `"parsers"` property in individual `package.json`
  descriptors may extend or override using any of the configured or built-in
  language parser names.
- Exports `import-lite.js`, `archive-lite.js`, `import-archive-lite.js`,
  `import-parsers.js`, `archive-parsers.js`, `import-archive-parsers.js`, and
  `node-modules.js`, allowing these to be mixed and matched.
  The existing `import.js`, `archive.js`, and `import-archive.js` all entrain
  by import their corresponding default behaviors, where the new modules do
  not.
  For example, `import-parsers.js` does not entrain Babel.
  The new `import-lite.js` does not entrain `node-modules.js` and composes
  with potential alternative package discovery, storage, and locks.
- Adds JSON module support to `makeBundle`.
- Aliases and deprecates `tags` in favor of `conditions` to align with Node.js
  terminology.
- `mapNodeModules` now infers that it should include `devDependencies` from
  the entry package from the presence of `"development"` in `conditions`,
  if the `dev` option is abseent.

# 0.9.0 (2023-08-07)

- Introduces support for source map generation.
  Look for `computeSourceMapLocation` and `sourceMapHook` in
  [`README.md`](README.md).

# 0.8.5 (2023-07-17)

- Adds `importHook` option to all applicable options bags.
- Bundler now supports aliases, so is now able to bundle most applications that
  consist entirely of CJS and ESM sources.
- Fixes archive generation, such that it throws if the entry module does not exist.
- Fixes preservation of order for imported shims.

# 0.8.1 (2022-12-23)

- Increases ecosystem compatibility for reflective imports, the `browser` field
  specified ad hoc by Browserify, and a fix for differentiating module language
  from its extension.
- Adds CommonJS support to the unsafe bootstrapping bundle format.
- Introduces usage of `__reexportsMap__` from static module record
  to handle named reexports in the bundler.

# 0.8.0 (2022-11-14)

- Bundles now evaluate to their entrypoint module's namespace object.
- Removes support for `globalLexicals`.

# 0.7.7 (2022-06-28)

- Adds `require.resolve` support and provides its implementation from 
  `readPowers.requireResolve` if available.
  
# 0.7.6 (2022-06-10)

- Adds support by default for "text" and "bytes" as file types with eponymous
  parser behavior, interpreting text as exporting a UTF-8 string named default,
  and bytes as exporting a default ArrayBuffer.
  The `"parsers"` directive in `package.json` can map additional extensions to
  either of these types, in the scope of the declaring package.
- Compartment maps in archives now only retain compartment descriptors for
  compartments that are necessary for the modules retained by the entry module.
- Compartment maps in archives now only include a sequence number to
  disambiguate compartments for which there are multiple original Node.js
  packages in the solution with the same version and name.
  We still allow for the possibility that these duplicates exist and in fact
  may contain different sources, since they may be retained as dependencies
  beyond the purview of npm.
- A package.json file with the "type" field nested within a package's folder 
  structure a is now taken into account when determining if a .js file is an 
  ES module.
- Adds means to make `__dirname` and `__filename` work in CommonJS modules when
  loaded via importLocation or loadLocation. Pass `readPowers` with 
  `fileURLToPath` method present.

# 0.7.2 (2022-04-11)

- Fixes treatment of packages with a `"module"` property in their
  `package.json`: When the compartment mapper encounters such a package, every
  module in that package with `.js` extension including the referenced module
  will be treated an ESM, as if it had the `.mjs` extension.
- Ensures that the `"endo"`, `"import"`, and `"default"` tags (Node.js
  conditions) are respected in `package.json` `"exports"` conditions.

# 0.7.0 (2022-03-01)

- *BREAKING:* Archive integrity checks now occur when the archive is loaded
  instead of waiting for the archive to be instantiated or executed.
  This will cause corrupt archives to produce errors earlier.
- Adds a `makeAndHashArchive` function that returns both the generated bytes
  and the SHA-512 of an archive as its created.
  `makeArchive` just returns the bytes.

# 0.6.7 (2022-02-21)

- *BREAKING:* The `loadArchive` and `parseArchive` functions, when given a
  `computeSha512`, now check the integrity of every module in the archive, and
  forbid the presence of any unused files in the archive.
  So, these functions now require a `modules` option if the archive will expect
  any built-in modules. The `modules` option is an object with a key for every
  built-in module the archive expects.
  The load and parse functions ignore corresponding values (even if they are
  falsey!) but will accept the same type of object as the import function.
- The `parseArchive` function returns a promise for an archive.  If provided a
  `computeSha512`, regardless of whether provided `expectedSha512`, the archive
  will have a `sha512` property computed from the parsed archive, for
  the purpose of verifying integrity.

# 0.5.3 (2021-12-08)

- The `node-powers.js` module now exports `makeReadPowers` and
  `makeWritePowers` which replace the deprecated functions `makeNodeReadPowers`
  and `makeNodeWritePowers`.
  The rename is necessary to facilitate a change to the signature of these
  methods so that `url` may be accepted as another dependency, to facilitate
  Windows support.
  Both accept a bag of Node.js modules that must include `fs` and `url`.
  The read powers may optionally take the `crypto` module.

# 0.5.2 (2021-11-16)

- Adds source URL suffixes to archives, such that the archive hash remains
  orthogonal to the local directory but has sufficient information that editors
  like VS Code can match the suffix to a file in the IDE workspace.
- Adds hooks to archive production and consumption for reading and writing
  source locations, such that other tools yet to be written can use these hooks
  to provide fully qualified local debug source URLs.
  Archive creation functions now accept a
  `captureSourceLocation(compartmentName, moduleSpecifier, sourceLocation)`
  hook and archive parsing functions accept
  `computeSourceLocation(compartmentName, moduleSpecifier)`.

# 0.5.1 (2021-08-12)

- Adds support for reflexive import specifiers, so modules in package named
  `@example/example` may import `@example/example` from their own modules.
  This is necessary for parity with Node.js.

# 0.5.0 (2021-07-22)

- The calling convention between SES and StaticModuleRecords has changed and
  this impacts the code generated by the bundler. 
- Adds a support for consistent hashing (SHA-512) of applications:
  - `nodeReadPowers(fs, crypto)` produces the necessary capabilities for
    hashing, when passed the Node.js `crypto` module.
  - `writeArchive` and `makeArchive` accept a `computeSha512` capability and
    use it to populate the `compartment-map.json` included within the archive
    with the SHA-512 of every module in the archive.  This ensures that the
    hash of `compartment-map.json` in a pair of archives is consistent only if
    every file is consistent.
  - `importArchive`, `loadArchive`, and `parseArchive` all optionally accept a
    `computeSha512` capability, use it to verify the integrity of the archive
    and verify the `expectedSha512` of the contained `compartment-map.json`
    `importArchive` and `loadArchive` receive the hash function as a read
    power.  `parseArchive` receives the hash function as an option since it
    doesn't receive read powers.
  - `hashLocation` produces the hash of an application off the filesystem,
    suitable for validating that an archive with the same hash was generated
    from identical files.
- Also adds `mapLocation`, which produces the compartment map that _would_ be
  in the corresponding archive for a package.
- Ensures that IO errors on Node.js include a meaningful stack trace.

# 0.4.1 (2021-16-19)

- Fixes internal type references.

# 0.4.0 (2021-06-16)

- *BREAKING*: When constructing an archive, the creator must provide a record
  of exit modules. Unlike import functions, the values of the exit module
  record are ignored.
  Any omitted exit module will cause an exception during archive creation.
- Adds a `dev` option to archive and import workflows to include the
  `devDependencies` of the entry package (but not other packages).
- Fixes a missing file in the published assets for
  `@endo/compartment-mapper/node-powers.js`.

# 0.3.2 (2021-06-14)

- Follows Node.js packages through symbolic links, but requires an additional
  read power to do this. Some functions now accept `{ read, canonical }` powers
  in places only `read` was accepted previously, specifically
  `compartmentMapFromNodeModules`, `makeArchive`, `writeArchive`, and
  `loadLocation`.
- Adds an `"@endo/compartment-mapper/node-powers.js"` entry point utility
  module that exports `makeNodeReadPowers` and `makeNodeWritePowers` that adapt
  the Node.js `fs` module to the promise and URL oriented interfaces expected
  by compartment mapper functions.

# 0.3.0 (2021-06-01)

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
