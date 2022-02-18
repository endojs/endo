User-visible changes in SES:

# v0.15.8 (2022-02-18)

- Harden now gives special treatment to typed arrays.
  Instead of freezing a typed array, harden will seal it and make all of its
  non-integer properties non-writable.
  All of their integer properties will remain writable and non-configurable.
  TypedArrays are exceedingly unusual because their integer properties are
  writable and neither freeze nor defineProperty can convert them from writable
  to non-writable.

# v0.15.3 (2022-01-21)

- Fixes the type definition for assert.error so that the final options bag,
  which may include `errorName`, checks correctly in TypeScript.
- Lockdown will now throw an error if code running before SES initialization
  replaced `eval`.

# 0.15.2 (2021-12-08)

- The `Removing...` messages that Lockdown emits when encountering unrecognized
  properties on shared intrinsics are now logged as "warnings".
  This has the material benefit of sending these messages to STDERR on Node.js.
- Updates permits for all current TC39 stage 3 and 4 proposals, notably
  suppressing the `Removing...` messages for `Object.hasOwn`; `findLast` and
  `findLastIndex` on both `Array.prototype` and `TypedArray.prototype`; and the
  properties `transfer`, `resize`, `resizable`, and `maxByteLength` of
  `ArrayBuffer.prototype`.

# 0.15.1 (2021-11-15)

- The TypeScript definition of `lockdown` now allows for the option
  `"errorTrapping": "none"`.
- Fixes error trapping on the web, showing both the message (and stack) of any
  error that throws out of the top of an event.

# 0.15.0 (2021-11-02)

- *BREAKING CHANGE*: The lockdown option `domainTaming` is now `safe` by
  default, which will break any application that depends transtively on the
  Node.js `domain` module.
  Notably, [standard-things/esm](https://github.com/standard-things/esm)
  uses domains and so SES will not support `node -r esm` going forward.

  This protects against the unhardened `domain` property appearing on shared
  objects like callbacks and promises.
  This overcomes the last *known* obstacle toward object capability containment.
- Lockdown will now read options from the environment as defined by the Node.js
  `process.env` parameter space.
- *BREAKING CHANGE*: Lockdown may no longer be called more than once.
  Lockdown no longer returns a boolean to indicate whether it was effective
  (true) or redundant (false). Instead, Lockdown will return undefined for
  its first invocation or throw an error otherwise.

# 0.14.4 (2021-10-14)

- Fixes a defect in the per-compartment `Function` and `eval` functions, such
  that these environments did not have the compartment's `globalLexicals`.
  There is no known environment depending on this invariant for security
  reasons, but such a scenario would be a program arranging a translator that
  introduces run-time security checks, like metering, that depend on the
  existence of a named global lexical.
  [#898](https://github.com/endojs/endo/issues/898)
- The above fix incidentally improved the performance of compartment evaluation
  for cases that do not require special global lexicals, by sharing a single
  per-compartment evaluator.

# 0.14.3 (2021-09-18) 

- Due to a peculiar bit of error handling code in Node 14, as explained at
  [Hardened JavaScript interferes with Node.js 14 Error
  construction](https://github.com/endojs/endo/issues/868),
  we have added more overrides to the default `overrideTaming: 'moderate'`
  setting. At this setting, assigning to the `name` property of a mutable error
  instance should work. It will continue not to work at the `'min'` setting, so
  use the default `'moderate'` setting if you need to.
- Adds a lockdown option `domainTaming` to detect whether Node.js domains have
  been initialized and prevents them from being initialized afterward.
  Domains otherwise presented a hazard to the integrity of SES containment on
  Node.js.
  The option defaults to `"unsafe"` in this version and will be switched to
  `"safe"` by default in the next release that allows for breaking-changes, to
  afford a gradual migration.
  Thank you to @dominictarr with [Least Authority](https://leastauthority.com/)
  for devising this feature.
- Fixes reflexive module imports. Previously, SES would fail to initialize a
  module graph where a module imported an alias to itself.

# 0.14.1 (2021-08-12)

- Adds permits for `Array.prototype.at` and `String.prototype.at` which are
  Stage 3 proposals for ECMA 262.

# 0.14.0 (2021-07-22)

- *BREAKING*: Any precompiled static module records from prior versions
  will not load in this version of SES or beyond. The format of the preamble
  has been changed to admit the possibility of a variable named `Map` declared
  in the scope of a module.
- Fixes the type assertions for `assert` and `assert.string`.
- Reveals `harden` only after `lockdown`. Harden was never usable before
  lockdown because it would render the environment irreparable.
  Calling `harden` before `lockdown` previously threw an exception.
  Now it is possible to write libraries that are usable both in JS and SES,
  which can know whether to harden their API by the presence of harden in
  global scope.
- Adds `errorTrapping` lockdown option and by default traps uncaught exceptions
  and logs them back with their original stack traces.
  These would previously appear as mysterios `{}` lines in Node.js.

# 0.13.4 (2021-06-19)

- Adds more TypeScript definitions, importable with `/// <reference
  types="ses"/>`, covering `harden`, `lockdown`, `assert`, and `Compartment`,
  and many types importable with `import('ses')` notation.
- Adds descriptive detail to module system link error messages and fixes the
  reported exports for one.

# 0.13.1 (2021-06-05)

- Fixes type exports for `harden`.
- Packaging fixes.

# 0.13.0 (2021-06-01)

- *BREAKING CHANGE* The `ses/lockdown` module is again just `ses`.
  Instead of having a light 43KB `ses/lockdown` and a heavy 3.1MB `ses`, there
  is just a 52KB `ses` that has everything except `StaticModuleRecord`.
  For this release, there remains a `ses/lockdown` alias to `ses`.
- *BREAKING CHANGE* Third-party static module interface implementations *must*
  now explicitly list their exported names.
  For CommonJS, this implies using a heuristic static analysis of `exports`
  changes.
  Consequently, third-party modules can now participate in linkage with ESM
  including support for `export * from './spec.cjs'` and also named imports
  like `import * from './spec.cjs'`.
- *BREAKING CHANGE* The `StaticModuleRecord` constructor has been removed in
  favor of a duck-type for compiled static module records that is intrinsic to
  the shim and may be emulated by a third-party `StaticModuleRecord`
  constructor.
  The constructor must perform the module analysis and transform the source,
  and present this duck-type to the Compartment `importHook`.
  This relieves SES of a dependency on Babel and simplifies its API.
- *BREAKING CHANGE* The UMD distribution of SES must have the UTF-8 charset.
  The prior versions were accidentally ASCII, so SES would have worked
  in any web page, regardless of the charset.
  To remedy this, be sure to include `<head><meta charset="utf-8"></head>` in
  the containing page (a general best-practice for web pages) or specifically
  use `<script charset="utf-8" src="ses.umd.min.js">` to address the single
  file.
- Relaxes the censorship of `import` and `eval` in programs evaluated
  under SES to specifically allow the use of `something.import()` or
  `something.eval()` methods.
- Fix: `new Compartment(null, null, options)` no longer throws.
- New lockdown option: `overrideDebug: [...props]` to detect where a property
  assignment needs to be turned into a `defineProperty` to avoid the override
  mistake.  Most useful as `overrideTaming: 'severe', overrideDebug:
  ['constructor']`.
- We reopened Safari bug
  [Object.defineProperties triggering a setter](https://bugs.webkit.org/show_bug.cgi?id=222538#c17)
  when we found that it was causing an infinite recursion initializing SES
  on Safari.
- We revised an error message to include the error tag of a new error
  explanation page:
  [SES_DEFINE_PROPERTY_FAILED_SILENTLY](error-codes/SES_DEFINE_PROPERTY_FAILED_SILENTLY.md).
  We hope to add such explanations for more errors over time. Please let us
  know as you encounter errors that strongly needs explaining.

# 0.12.7 (2021-05-05)

- Added to `assert.error` an optional options bag with an option named
  `errorName`. The `assert.error` function makes error objects with detailed
  error messages whose unredacted contents appear only in `console` output
  and are otherwise unobservable. If `errorName` is provided, then
  it is also used in the console output instead of the normal error name,
  but is otherwise unobservable. This will rarely be used, but will be
  used by the `@agoric/marshal` package to name an unserialized error
  so that it can be traced back to the site that serialized it; and
  ultimately to its origin.

# 0.12.6 (2021-03-27)

- Added a new temporary `__allowUnsafeMonkeyPatching__` option to `lockdown`.

  Sometimes SES is used where SES's safety is not required. Some libraries
  are not compatible with SES because they monkey patch the shared primordials
  is ways SES cannot allow. We temporarily introduce this option to enable
  some of these libraries to work in, approximately, a SES environment
  whose safety was sacrificed in order to allow this monkey patching to
  succeed. More at the
  [\_\_allowUnsafeMonkeyPatching\_\_ Options](./lockdown-options.md#__allowUnsafeMonkeyPatching__-options)
  section of [lockdown-options](./lockdown-options.md).

# 0.12.5 (2021-03-25)

- The 0.12.4 release was broken by https://github.com/endojs/endo/pull/552
  since fixed by https://github.com/endojs/endo/pull/638
- These merely remove a repair needed by an old v8 / Node version that
  no one any longer supports.

# 0.12.4 (2021-03-24)

- Expand TypeScript definitions to include Compartment, StaticModuleRecord,
  StaticModuleType, RedirectStaticModuleInterface, FinalStaticModuleType,
  ThirdPartyStaticModuleInterface, Transform, ImportHook, and ModuleMapHook.
- The previous took `Object.prototype.constructor` off of the default
  [list of properties](src/enablements.js) we enable to be overridden by
  assignment. This default is the `{overrideTaming: 'moderate'}` setting.
  In this release, we stop enabling `'hasOwnProperty'` by default as
  well. With both of these gone, we now have a reasonable debugging
  experience.
- Unfortunately, both rollup and webpack seem to turn exported names
  into assignments to an `exports` object that inherits from
  `Object.prototype`, thereby potentially stepping on any name.
  To deal with this perverse case, the release also provides an
  `{overrideTaming: 'severe'}` option which enables all properties on
  at least `Object.prototype`. This is more compatible but makes the
  vscode debugger's inspector unusable. At
  [Tracking issue for getting 3rd party packages more SES friendly (#576)](https://github.com/endojs/endo/issues/576)
  we track the incompatibilities we encounter and progress toward
  getting them fixed.
- Add utility function `Compartment.prototype.__isKnownScopeProxy__(value)` to
  aid working around scopeProxy leakage. Returns true if `value` is one of the
  scopeProxies created during calls to this Compartment instances's
  `Compartment.prototype.evaluate`. See `test-compartment-known-scope-proxy.js`
  for an example of performing a scopeProxy leak workaround.
- Under the default `{errorTaming: 'safe'}` setting, the SES shim already redacts stack traces from error instances when it can (currently: v8, spiderMonkey, XS). The setting `{errorTaming: 'unsafe'}` suppresses that redaction, instead blabbing these stack traces on error instances via the expected `errorInstance.stack`.

  The purpose of the `details` template literal tag (often spelled `X` or `d`) together with the `quote` function (often spelled `q`) is to redact data from the error messages carried by error instances. With this release, the same `{errorTaming: 'unsafe'}` would suppress that redaction as well, so that all substitution values would act like they've been quoted. IOW, with this setting

   ```js
   assert(false, X`literal part ${secretData} with ${q(publicData)}.`);
   ```

  acts like

   ```js
   assert(false, X`literal part ${q(secretData)} with ${q(publicData)}.`);
   ```

   Note that the information rendered by the SES shim `console` object always includes all the unredacted data independent of the setting of `errorTaming`.


# 0.12.3 (2021-03-01)

- The `assert.js` module in the `ses` package of this repository exports
  a `makeAssert` function, to make other `assert` functions with a different
  failure scope. Inadvertantly, this did not enable the `@agoric/assert`
  package (currently defined in the agoric-sdk repository) to reexport
  the same `makeAssert` function as originally intended, and now
  [needed](https://github.com/Agoric/agoric-sdk/pull/2515).
  As of this release the `assert` object exported by the `assert.js` module
  now carries this function as a `makeAssert` property.
- The `assert.quote` function re-exported by `@agoric/assert` as `q`
  has always done only a best effort stringify, intended only to
  be interpreted by a human under benign conditions. Within that constraint
  its best effort is now better, providing informative though ambiguous
  renderings of values problematic for `JSON.stringify`, still including
  cycles, but now also functions, promises, `undefined`, `NaN`, `Infinity`,
  bigints, and symbols. To distinguish this from
  strings in the input, these synthesized strings always begin and
  end with square brackets. To distinguish those strings from an
  input string with square brackets, an input string that starts
  with an open square bracket `[` is itself placed in square brackets.
- The `q` function now has an optional second `spaces` parameter which is
  passed through to the underlying `JSON.stringfiy`. Passing in a space or
  two spaces makes the output much more readable using indentation and other
  whitespace, but takes multiple lines.
- The SES enhanced `console` had previously only produced meaningful stack
  traces on v8-based browsers such as Brave, Chromium, or Chrome. It now
  works on Firefox and Safari as well. It should work on all major browsers
  but have not yet been tested on others.
- On all platforms `Error.stackTrace` is now an assignable accessor property.
  On v8-based platforms, for the `Error` constructor in the start compartment,
  it has the same effect that it does outside SES. Outside the start
  compartment, or outside v8-based platforms, the assignment succeeds silently
  with no effect.
  This accommodates a de facto standard idiom encouraged by Google.
- The "SES Demo Console" and "SES Challenge" have been fixed to work with
  modern SES. Both now run in browsers, though these are not yet hosted
  for visiting as an external web page.
- We no longer enable overriding `Object.prototype.constructor` by assigning
  to the `constructor` property of a derived object. We were enabling it
  due to a bug in acorn 7, since fixed in acorn 8. To enable it, we were
  making `Object.prototype.constructor` into an accessor property, which
  confused the Node debugger, causing annoying extra noise in the console
  output. Now that we've worked around our acorn problem (currently with
  a patch) we have stopped enabling this assignment, and so stopped
  confusing the Node debugger.

# 0.12.2 (2021-02-05)

- fix non-standard regex range syntax that throws on XS (3877d72)
- refine concise stack traces (cbbabeb)

# 0.12.1 (2021-02-02)

- Consolidated documentation of [`lockdown` options](./lockdown-options.md) into its
  own page.
- Added a `stackFiltering` option to `lockdown` with
  two settings, `'concise'` and `'verbose'`. Stack traces are now filtered
  `'concise'` by default, making them typically much easier to work with.
  `'verbose'` shows complete stack traces, as sometimes it contains clues
  needed to find your bug.
  See [`stackFiltering` options](./lockdown-options.md#stackfiltering-options)
  for an explanation.
- Changed the meaning of the default `'moderate'` setting of the
  `overrideTaming` options of `lockdown`. See
  [`overrideTaming` options](./lockdown-options.md#overridetaming-options)
  for an explanation of when to use which.

:warning: This change of meaning of the `'moderate'` setting of the
`overrideTaming` option of `lockdown` is not strictly compatible with its
old meaning. The old `'moderate`' setting would enable all properties on a few
widely used prototype objects, including `Object.prototype`. Resulting in a
miserable debugging experience when using the VSCode debugger's object
inspector.

<details>
  <summary>Expand to see the vscode inspector display if enabling all of Object.prototype</summary>

![vscode inspector display if enabling all of Object.prototype](docs/images/override-taming-star-inspector.png)

</details>

The new `'moderate'` setting only tames those properties we know or expect to
be problematic. If you run into an override mistake problem not addressed at
the `'moderate'` setting **_please file an issue._**

<details>
  <summary>Expand for { overrideTaming: 'moderate' } vscode inspector display</summary>

![overrideTaming: 'moderate' vscode inspector display](docs/images/override-taming-moderate-inspector.png)

</details>

For an even better debugging experience, try the `'min'` setting, which
makes the debugging experience even less noisy, but may not be compatible with
all the code you're running under SES.

<details>
  <summary>Expand for { overrideTaming: 'min' } vscode inspector display</summary>

![overrideTaming: 'min' vscode inspector display](docs/images/override-taming-min-inspector.png)

</details>

# 0.11.1 (2021-01-21)

- Upgrades `harden` such that that it transitively freezes an object's
  prototype chain, eliminating the notion of a "fringe set" and errors
  that were previously thrown if an object's prototype was not already
  in the fringe.
- Added an `overrideTaming` option to `lockdown` with two settings,
  `'min'` and `'moderate'`. See
  [Enabling Override by Assignment](README.md#enabling-override-by-assignment)
  for an explanation of when to use which. **_(This documentation has moved
  to [`overrideTaming`
  options](./lockdown-options.md#overridetaming-options))_**
- Modules and evaluated code that contains the censored substrings
  for dynamic eval, dynamic import, and HTML comments will now
  throw errors that contain the `sourceURL` from any `//#sourceURL=` comment
  toward the end of the source or merely `<unknown>`.

# 0.11.0 (2020-11-03)

- `lockdown()` adds new global `assert` and tames the global `console`. The
  error taming hides error stacks, accumulating them in side tables. The
  `assert` system generated other diagnostic information hidden in side
  tables. The tamed console uses these side tables to output more informative
  diagnostics. [Logging Errors](./src/error/README.md) explains the design.
- Adds a non-standardizable `__shimTransforms__` option to the
  Compartment constructor that allows a single transform to work
  for both programs passed to `evaluate` and modules that the SES shim
  compiles to programs.

# 0.10.4 (2020-09-28)

- When converting each of [these data properties](src/enablements.js) to
  accessor properties, to suppress the
  [override mistake](https://github.com/tc39/ecma262/pull/1320), we now
  add to that accessor's getter an `originalValue` property to mark it
  as alleging that it is emulating a data property whose original value
  was that value.
- Fixes an exception thrown when calling `lockdown` after just importing
  `ses/lockdown` in all environments.

# 0.10.3 (2020-09-08)

- The `ses/lockdown` module and Rollup bundles now include a minimal
  implementation of `Compartment` that supports `evaluate` but not loading
  modules.
  This is sufficient for containment of JavaScript programs, including
  modules that have been pre-compiled to programs out-of-band, without
  entraining a full JavaScript parser framework.
- Allows a compartment's `importHook` to return an "alias" if the returned
  static module record has a different specifier than requested.
- Adds the `name` option to the `Compartment` constructor and `name` accessor
  to the `Compartment` prototype.
  Errors that propagate through the module loader will be rethrown anew with
  the name of the module and compartment so they can be traced.
  At this time, the intermediate stacks of the causal chain are lost.
  https://github.com/Agoric/SES-shim/issues/440

# 0.10.2 (2020-08-20)

- Adds a `moduleMapHook` option to the `Compartment` constructor options.
  The module map hook can return values for the `moduleMap` for
  any given module specifier, or return `undefined` to fall back to the
  `importHook`.
  This allows for wildcard linkage to other compartments.
- Fix dependency version for `@agoric/transform-module`.

# 0.10.1 (2020-08-13)

- Updates the whitelist to allow a `HandledPromise` global, which is provided
  by `@agoric/eventual-send`, an early implementation of
  https://github.com/tc39/proposal-eventual-send.
- Corrects our fix for the override mistake, so that it correctly emulates
  how assignment would work in the absence of the override mistake.
  A property created by assignment will now be a writable, enumerable,
  configurable data property, as it is for normal assignment.

# 0.10.0 (2020-08-08)

- Creates a `ses/lockdown` module that only introduces `lockdown` and `harden`
  to global scope, for a much smaller payload than `ses`, which entrains a
  JavaScript parser to support ECMAScript modules.
- Adds the `load` method to `Compartment`.
  Load allows a bundler or archiver to use the `Compartment` API to gather the
  transitive dependencies of modules without executing them.
- Adds support for third-party implementations of a `StaticModuleRecord`
  interface (`{imports, execute}`).

# 0.9.1 (2020-07-16)

- The `*Locale*` methods removed in the previous release are now restored
  by aliasing them to their non-locale equivalents. `localeCompare` had no builtin
  non-locale equivalent, so we provide one.
- Adds a TypeScript definition for `harden`.

# 0.9.0 (2020-07-13)

- BREAKING CHANGE: The compartment `evaluate` method no longer accepts an
  `endowments` option.
  Use `compartment.globalThis`, `endowments`, or `globalLexicals`.
  If per-evaluation `globalLexicals` or `endowments` are necessary,
  each evaluation will need a fresh `Compartment`.
- BREAKING CHANGE: The `lockdown` function's deprecated `noTame*` options have
  been removed in favor of the `*Taming` options introduced in version 0.8.0.
- BREAKING CHANGE: The `.toLocale*` methods of
  Object/Number/BigInt/Date/String/Array/%TypedArray% were removed from SES
  environments. This includes methods named `toLocaleString`,
  `toLocaleDateString`, `toLocaleTimeString`, `toLocaleLowerCase`,
  `toLocaleUpperCase`, and `localeCompare`. These may be restored (in a
  modified form) in a future release.
- The way `lockdown()` tames the `Error` constructor now cooperates
  with the V8 stack trace API to a degree that is permissible without
  breaking the integrity of applications that use it.
- The Compartment constructor now accepts a `globalLexicals` option.
  The own enumerable properties of the global lexicals are captured
  and presented as constants in the scope of all calls to `evaluate` and all
  modules.
  The global lexicals overshadow the global object.

# 0.8.0 (2020-05-26)

- Adds support for modules to Compartments.
- SES no longer exports anything.
  `Compartment`, `StaticModuleRecord`, `lockdown`, and `harden` are all
  introduced as properties of `globalThis`.
- The `Compartment` `global` getter is now named `globalThis`, consistent with
  the specification proposal.
- The `Compartment` `transforms` constructor option is now just an array of
  transform functions that accept and return program strings.
  Transforms can no longer introduce `endowments`.
  The compartment constructor's `endowments` argument (first) and assigning
  properties to `globalThis` are the remaining supported ways to introduce
  endowments.
- Repair `Function.apply` and `TypeError.message` (as well as `.message` on
  all the other Error types), to tolerate what the npm `es-abstract` module
  does. This allows `tape` (version 4.x) to be loaded in a locked-down SES
  world, and also allows its `t.throws` assertion to work. `tape` (version
  5.x) still has problems. [#293]

- Replaces the old `noTame*` options to `lockdown` with new `*Taming` options.
  The old style had boolean values defaulting to `false`. In the new style,
  each option supports at least the options `'safe'` and `'unsafe'` defaulting
  to `'safe'`. As a transitional matter, this release still supports the
  old style as well, as another way to say the same thing. [#326]

  [#293]: https://github.com/Agoric/SES-shim/issues/293
  [#326]: https://github.com/Agoric/SES-shim/issues/326

# 0.7.7 (2020-04-27)

- This version decouples lockdown and the Compartment constructor.
  The Compartment constructor is now exported by `ses` (was previously only
  available as a property of `globalThis` _after_ lockdown).
  The Compartment constructor will also create "privileged" compartments when
  constructed before lockdown.

# 0.7.6 (2020-03-31)

Bug fixes.
This release fixes issues in RegExp and Error taming.

# 0.7.4-5 (2020-03-21)

This release adds Node.js ESM support by upgrading @agoric/make-hardener to a
hybrid version for most modern module systems.

- Newless calls to the RegExp constructor now work after lockdown.

- upgrade @agoric/make-hardener v0.0.8

# 0.7.2-3 (2020-03-13)

Bug fixes.
This release addresses an exception observed where locking down fails because
SES cannot delete the prototype of the harden function.
This is addressed by upgrading @agoric/make-harden to version 0.0.7.
This release also restores fulls upport for importing SES as CommonJS, Node.js
ESM, and Node.js emulated ESM with the `esm` package.

# 0.7.1 (2020-13-10)

SECURITY UPDATE: This complete re-architecture which removes the realm-shim and
resolve the associatd sandbox escapes related to leaking cross-realm
intrinsics. All users should update to this version.

See [docs/ses-0.7.md].

# 0.6.4 (2019-10-16)

SECURITY UPDATE: This release upgrades realms-shim to fix multiple sandbox
escapes. All users should update to this version.

- upgrade to realms-shim v1.2.1

Non-security fixes:

- improve documentation

# 0.6.3 (2019-10-02)

SECURITY UPDATE: This release upgrades realms-shim to fix multiple sandbox
escapes. All users should update to this version.

- upgrade to realms-shim v1.2.0

Non-security fixes:

- add `SES.harden` to make hardening available from within the Realm. (#161)

# 0.6.2 (2019-09-25)

No user-visible changes.

Use realms-shim as a normal package, not a git-submodule. Update eslint
dependencies.

# 0.6.1 (2019-19-14)

- SECURITY UPDATE: This release fixes a sandbox escape discovered in the
  realms-shim by GitHub user "XmiliaH", which works by causing an infinite
  loop and extracting the real function constructor from the RangeError
  exception object. See https://github.com/Agoric/realms-shim/issues/48 for
  more details.

# 0.6.0 (2019-09-03)

- Breaking change: `options.transforms` may no longer specify `endow()`
  transforms. Instead, use `rewrite()`, which can now modify endowments.
  See https://github.com/Agoric/realms-shim/pull/38 for details.
- Repair the "override mistake", with optional repair plan in
  `options.dataPropertiesToRepair`. See src/bundle/dataPropertiesToRepair.js
  and https://github.com/Agoric/SES/pull/146 for details.
- `options.sloppyGlobals` is rejected by `makeSESRootRealm()`, since all SES
  root realms are frozen. `sloppyGlobals` can only be used in a new
  "Compartment", made by calling `Realm.makeCompartment(options)`. See
  https://github.com/Agoric/SES/issues/142
  https://github.com/Agoric/realms-shim/pull/33
  https://github.com/Agoric/realms-shim/pull/30 for details.
- Add `options.whitelist` to override the set of properties that are retained
  in the new realm. The default gives you SES, but it could be overridden to
  e.g. enforce a Jessie-only environment.

# 0.5.3 (2019-07-24)

- Re-enable indirect eval. (#131)

# 0.5.2 (2019-07-13)

Dependency updates only, no user-visible changes.

# 0.5.1 (2019-07-10)

- The 'realms-shim' module, upon which SES depends, has been split out of the
  TC39 'proposal-realms' repository, and now lives in
  https://github.com/Agoric/realms-shim. It has not been released to NPM,
  rather SES incorporates it as a git submodule. (#110)
- The documentation is now hosted on ReadTheDocs at
  https://ses-secure-ecmascript.readthedocs.io/en/latest/ (#111, #117)
- SES.makeRootRealm() now accepts a 'transforms' option. This is a list of `{ endow, rewrite }` functions which can add/modify endowments and/or rewrite
  source code each time an `evaluate()` is performed. (#125)

Thanks to Kate Sills, Dan Connolly, Michael Fig, and the ever-dependable
Dependabot for additional fixes in this release.

# 0.5.0 (2019-04-05)

INCOMPATIBLE API CHANGE: Starting with this release, the SES package exports
a single default object (named `SES`, from which you can get the
`SES.makeSESRootRealm()` function). Previously, it exported both a `SES`
object and the `makeSESRootRealm` function.

Code which uses this package as an ES6 module must change its import from
`import { SES } from 'ses';` to:

```js
import SES from 'ses';
```

Similarly, for code which uses CommonJS-style, it must change from `const { SES } = require('ses')` to:

```js
const SES = require('ses');
```

The package now exports bundles in various flavors: CommonJS, ES6 Module, and
browser-based UMD.

Other changes:

- whitelist Symbol.matchAll, to fix Chrome-v73 (Issue #90)
- change primary export #88
- improve documentation #66 #67
- add integration tests #85
- packaging: remove ses-shim.js, add other generated bundles
- update Realms shim to commit 0c00eb, to fix Browserify #79
- test against node v10/v11, switch from travis to circleci #73
- fix examples #102

Thanks to Matt Bell, Kate Sills, and Mark Miller for additional fixes in this
release.

# 0.4.0 (2019-02-20)

Improve usability.

- remove `Nat` and `def` from the global environment #45
- provide a helper function named `s.makeRequire()` to build a `require`
  endowment. This can be configured to enable `require('@agoric/nat')` or
  `require('@agoric/harden')` (among others), so the same code can work
  either inside or outside of a SES realm. For details of its configuration,
  see the comments in the commit which landed it. #13
- harden() comes from `@agoric/make-hardener`, which doesn't climb
  prototype/inheritance chains, but does complain if the prototype wasn't
  already known to harden(). This avoids the "Ice-9" freeze-the-world
  problem, and also serves to signal when an object from one realm is passed
  into the harden() of a different realm. #15
- harden() now shares a WeakSet of previously-hardened objects #4
- use harden() instead of def() #39
- SES no longer depends upon Nat, but uses it during unit tests. Client code
  that wants Nat should use `require('@agoric/nat')`. #45
- Include AsyncIteratorPrototype in the set of anonIntrinsics #58
- use eslint to format all SES code

# 0.3.0 (2019-02-08)

Improves security and functionality.

This fixes all known confinement leaks:

- We now freeze AsyncGeneratorFunction and AsyncFunction, the last of the
  "anonymous" intrinsics (which are reachable by syntax but not simple
  property lookup). In the previous release, attacker code could modify their
  behavior (which defender code might have been relying upon) or use them as
  a communication channel. (#3, #41)
- We now remove all unknown properties from the global object, using a
  special list of ones that are safe to expose. This protects us from
  surprising platform-specific objects, or newly-added standard JS objects
  that have not yet been examined for safety. The 'Intl' object is currently
  removed by this check (and `intlMode: "allow"` has been removed), but may
  be brought back in a future release. (#26)
- RegExp.prototype.compile is removed unconditionally (even if regexpMode:
  "allow" is set), because it violates the semantics of Object.freeze

It also improves usability:

- Uncaught exceptions in Node.js are now rendered correctly when the
  `errorStackMode: "allow"` option is enabled. In the previous release, such
  exceptions were always displayed as "undefined", which was particularly
  unhelpful. If your program is abruptly exiting with "undefined", try
  turning this option on while you're debugging. But don't leave it on,
  because it probably enables a confinement breach.
- SES is an ES6 module, but should now be importable with `require()` by
  other code which is unaware of ES6 modules, because it now uses the `esm`
  module internally. (#32)
- `console.log` is now available within the confined code, if the
  `consoleMode: "allow"` option is enabled. If this is disabled,
  `console.log()` will throw a `TypeError` (since `console` is undefined, it
  has no `log` property). Many other `console` methods (but not all) are
  exposed too. (#35)

SES now requires Node.js version 10 or later.

# 0.2.0 (2019-01-18)

Improves confinement, small API changes.

The options passed as `SES.makeSESRootRealm(options)` have changed:

- `options.dateNowMode="allow"` allows `Date.now()` and `new Date()` to
  work normally, otherwise they return NaN
- `options.mathRandomMode="allow"` allows `Math.random()` to work
  normally (nondeterministically), else it will throw an Error
- `options.intlMode="allow"` lets `Intl.DateTimeFormat()`, `Intl.NumberFormat()`,
  and `Intl.getCanonicalLocales()` to work normally, else they throw Errors
- `options.errorStackMode="allow"` exposes `Error.prototype.stack` and
  `Error.captureStackTrace` (on platforms that support them), otherwise they
  are suppressed. Note that these could be used to break confinement, not
  just access nondeterminism.

Previously the only option honored was `options.dateNowTrap = false`

The suppression of `Error.captureStackTrace` is new in this release. This
release also suppresses `RegExp.prototype.compile` and properties like
`RegExp.$1` which cause some surprising behavior.

`SES.def` and `SES.Nat` are exported, so they can be used by non-confined
code (mostly in tests). `def(obj)` makes an object defensive, by freezing
it's external API surface (anything reachable by property lookup and
prototype traversal). `Nat(num)` throws an error unless its argument is a
natural number (a non-negative integer small enough to remain an integer
inside a Javascript `Number` type). Both are important for defensive
programming.

# 0.1.3 (2018-08-24)

Adds Nat and SES.confineExpr.

- `Nat(val)` ensures the value is a natural (non-negative) integer
- `SES.confineExpr(expr)` makes it easy to start with a function object, turn
  it into a string, then into a new function inside the SES realm.

This also updates the challenge page to fix a demo vulnerability (#8).

# 0.1.2 (2018-07-30)

- npm name is now 'ses'
- update to current proposal-realms

# 0.0.1 (2018-07-28)

first preliminary release
