User-visible changes to `@endo/bundle-source`:

# v4.1.0 (2025-06-02)

- The `'endoZipBase64'` moduleFormat now utilizes the `importHook` option to
  exit dependencies whose specifiers return a truthy value.

# v4.0.0 (2025-03-19)

- Replaces the implementation for the `nestedEvaluate` and `getExport`
  formats with one based on Endo's Compartment Mapper instead of Rollup,
  in order to obviate the need to reconcile source map transforms between
  Rollup and the underlying Babel generator.
  As a consequence, we no longer generate a source map for the bundle, but
  Babel ensures that we preserve line and column numbers between the original
  source and the bundled source.

# v3.5.0 (2024-11-13)

- Adds support for TypeScript type erasure using
  [`ts-blank-space`](https://bloomberg.github.io/ts-blank-space/) applied to
  TypeScript modules with `.ts`, `.mts`, and `.cts` extensions, for any package
  that is not under a `node_modules` directory, immitating `node
  --experimental-strip-types`.
  As with `.js` extensions, the behavior of `.ts` is either consistent with
  `.mts` or `.cts` depending on the `type` in `package.json`.

# v3.4.0 (2024-08-27)

- Adds support for `--elide-comments` (`-e`) that blanks out the interior of
  comments in `endoScript` and `endoZipBase64` formats to reduce bundle size
  without compromising cursor position correspondence between source and bundle
  code.

# v3.3.0 (2024-07-30)

- Adds support for `--no-transforms` (`-T`) which generates bundles with
  original sources.
  A future version of `@endo/import-bundle` will be able to execute this
  kind of bundle on XS and in Node.js, but will remain opt-in because
  they cannot be made to run on the web without further work on module
  virtualization in the platform without entraining a client-side
  dependency on a JavaScript parser framework (namely Babel).
- Adds a `-f,--format` command flag to specify other module formats.
- Adds a new `endoScript` module format.
- Adds a no-cache, bundle-to-stdout mode.
- Adds a `-C,--condition` command flag to specify export/import conditions like
  `"development"` or `"browser"`.
- The `-C development` condition now provides access to `devDependencies` in
  the `package.json` of the entry package of a bundle.

# v3.2.1 (2024-03-20)

- Fixes an install-time bug introduced in 3.2.0.

# v2.8.0 (2023-09-11)

- The `@endo/bundle-source/cache.js` maker now accepts additional optional
  arguments: `pid` and `nonce`, with reasonable defaults.
  Providing the `pid` can make it easier to clean up scratch files if
  the bundler is interrupted, since deleting any scratch file with the PID of a
  non-running process is safe.

# v2.6.0 (2023-08-07)

- Introduces a `cacheSourceMaps` option that is `false` by default.
  This causes the bundler to cache a source map for each physical module and
  stores it in the Endo user's cache directory.
  Use `endo where cache` to find these artifacts (from `@endo/cli`).

# v2.5.0 (2023-04-14)

- Separates the `bundle-source` entrypoint from the new
  `@endo/bundle-source/cache.js` importable library.

# v2.3.0 (2022-09-14)

- Adds a `--cache-json` mode that:
  - Generates `.json` bundle files in JSON format.
  - Generates `-json-meta.json` meta files in JSON format.
- Adds a `--cache-js` mode that should replace `--to`:
  - Generates `.js` bundle files in JSON format.
    Adds a UNIX newline absent when using `--to`.
  - Generates `-json-meta.json` meta files in JSON format instead of
    `-meta.js`.

# v2.1.4 (2022-04-14)

- Adds a `bundle-source` command line tool that supports build caching.

# v2.1.0 (2022-03-01)

- Bundles generated with the module format `endoZipBase64` (the current
  default) will now also contain an `endoZipBase64Sha512` property with a
  consistent hash suitable for verifying the integrity of a bundle.
  The hash is that of the `compartment-map.json` in the bundle zip archive,
  which in turn contains the hashes of every other file in the archive.
  A new package, `@endo/check-bundle` will provide a mechanism for
  verifying bundle integrity.
