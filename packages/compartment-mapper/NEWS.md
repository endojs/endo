User-visible changes to the compartment mapper:

## 0.2.4 (2021-03-30)

* Applications may now have asynchronous module transforms, per language.
  When applied to archive creation, the transformed sources appear in the
  archive.
* Every compartment's `globalThis` is frozen.

## 0.2.3 (2020-11-05)

* Embellishes all calls to methods named `import` to work around SES-shim
  `Compartment` censoring for dynamic import, using properties instead
  of parentheses, since the syntax transformation tools at hand do not
  currently simplify these.

## 0.2.2 (2020-11-05)

* Embellishes all calls to methods named `import` to work around SES-shim
  `Compartment` censoring for dynamic import.

## 0.2.1 (2020-11-04)

* Changes all private fields to internal weak maps to Compartment Mapper
  can be read by parsers that do not yet support private fields.

## 0.2.0 (2020-11-03)

* *BREAKING*: All `import` methods now take an options bag that may contain
  `globals` and `modules` options if present, instead of these as positional
  arguments.
* *BREAKING*: Support for CommonJS is temporarily withdrawn to relieve a
  dependency on Node.js built-ins entrained by Babel that in turn make
  Compartment Mapper unusable with a combination of `-r esm` and Rollup.
  CommonJS support should be restored with an alternate implementation in
  a future version.
* The `import` options bag now also accepts `globalLexicals`, `transforms`, and
  `__shimTransforms__`, passing these without alteration to each `Compartment`.
* The `import` options bag now also accepts a `Compartment` constructor, to use
  instead of the one assumed to be present globally.

## Release 0.1.0 (2020-09-21)

* This initial relase supports importing, archiving, and importing archives
  with the same authorities delegated to every compartment in an application.
  Future releases will support the attenuation of authority per-compartment,
  broaden support for Node.js module conventions, address the issue
  of shimming, and orchestrate SES lockdown.
