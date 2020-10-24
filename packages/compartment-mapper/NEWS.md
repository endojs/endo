User-visible changes to the compartment mapper:

## Next release

* *BREAKING*: All `import` methods now take an options bag that may contain
  `globals` and `modules` options if present, instead of these as positional
  arguments.
* *BREAKING*: Support for CommonJS is temporarily withdrawn to relieve a
  dependency on Node.js built-ins entrained by Babel that in turn make
  Compartment Mapper unusable with a combination of `-r esm` and Rollup.
  CommonJS support should be restored with an alternate implementation in
  a future version.
* *BREAKING*: Every compartment's globals will be frozen unconditionally.
  A future release may allow a relaxation of this constraint through an
  annotation in `package.json`.
* The `import` options bag now also accepts `globalLexicals` and `transforms`,
  passing these without alteration to each `Compartment`.
* The `import` options bag now also accepts a `Compartment` constructor, to use
  instead of the one assumed to be present globally.

## Release 0.1.0 (2020-09-21)

* This initial relase supports importing, archiving, and importing archives
  with the same authorities delegated to every compartment in an application.
  Future releases will support the attenuation of authority per-compartment,
  broaden support for Node.js module conventions, address the issue
  of shimming, and orchestrate SES lockdown.
