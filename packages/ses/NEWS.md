User-visible changes in SES:

## Release 0.6.5 (12-Feb-2020)

* upgrade to realms-shim v1.2.2
* forward `options.configurableGlobals` to the new created Realm

## Release 0.6.4 (16-Oct-2019)

SECURITY UPDATE: This release upgrades realms-shim to fix multiple sandbox
escapes. All users should update to this version.

* upgrade to realms-shim v1.2.1

Non-security fixes:

* improve documentation


## Release 0.6.3 (02-Oct-2019)

SECURITY UPDATE: This release upgrades realms-shim to fix multiple sandbox
escapes. All users should update to this version.

* upgrade to realms-shim v1.2.0

Non-security fixes:

* add `SES.harden` to make hardening available from within the Realm. (#161)


## Release 0.6.2 (25-Sep-2019)

No user-visible changes.

Use realms-shim as a normal package, not a git-submodule. Update eslint
dependencies.


## Release 0.6.1 (14-Sep-2019)

* SECURITY UPDATE: This release fixes a sandbox escape discovered in the
  realms-shim by GitHub user "XmiliaH", which works by causing an infinite
  loop and extracting the real function constructor from the RangeError
  exception object. See https://github.com/Agoric/realms-shim/issues/48 for
  more details.


## Release 0.6.0 (03-Sep-2019)

* Breaking change: `options.transforms` may no longer specify `endow()`
  transforms. Instead, use `rewrite()`, which can now modify endowments.
  See https://github.com/Agoric/realms-shim/pull/38 for details.
* Repair the "override mistake", with optional repair plan in
  `options.dataPropertiesToRepair`. See src/bundle/dataPropertiesToRepair.js
  and https://github.com/Agoric/SES/pull/146  for details.
* `options.sloppyGlobals` is rejected by `makeSESRootRealm()`, since all SES
  root realms are frozen. `sloppyGlobals` can only be used in a new
  "Compartment", made by calling `Realm.makeCompartment(options)`. See
  https://github.com/Agoric/SES/issues/142
  https://github.com/Agoric/realms-shim/pull/33
  https://github.com/Agoric/realms-shim/pull/30 for details.
* Add `options.whitelist` to override the set of properties that are retained
  in the new realm. The default gives you SES, but it could be overridden to
  e.g. enforce a Jessie-only environment.


## Release 0.5.3 (24-Jul-2019)

* Re-enable indirect eval. (#131)


## Release 0.5.2 (13-Jul-2019)

Dependency updates only, no user-visible changes.


## Release 0.5.1 (10-Jul-2019)

* The 'realms-shim' module, upon which SES depends, has been split out of the
  TC39 'proposal-realms' repository, and now lives in
  https://github.com/Agoric/realms-shim. It has not been released to NPM,
  rather SES incorporates it as a git submodule. (#110)
* The documentation is now hosted on ReadTheDocs at
  https://ses-secure-ecmascript.readthedocs.io/en/latest/ (#111, #117)
* SES.makeRootRealm() now accepts a 'transforms' option. This is a list of `{
  endow, rewrite }` functions which can add/modify endowments and/or rewrite
  source code each time an `evaluate()` is performed. (#125)

Thanks to Kate Sills, Dan Connolly, Michael Fig, and the ever-dependable
Dependabot for additional fixes in this release.


## Release 0.5.0 (05-Apr-2019)

INCOMPATIBLE API CHANGE: Starting with this release, the SES package exports
a single default object (named `SES`, from which you can get the
`SES.makeSESRootRealm()` function). Previously, it exported both a `SES`
object and the `makeSESRootRealm` function.

Code which uses this package as an ES6 module must change its import from
`import { SES } from 'ses';` to:

```js
import SES from 'ses';
```

Similarly, for code which uses CommonJS-style, it must change from `const {
SES } = require('ses')` to:

```js
const SES = require('ses')
```

The package now exports bundles in various flavors: CommonJS, ES6 Module, and
browser-based UMD.

Other changes:

* whitelist Symbol.matchAll, to fix Chrome-v73 (Issue #90)
* change primary export #88
* improve documentation #66 #67
* add integration tests #85
* packaging: remove ses-shim.js, add other generated bundles
* update Realms shim to commit 0c00eb, to fix Browserify #79
* test against node v10/v11, switch from travis to circleci #73
* fix examples #102

Thanks to Matt Bell, Kate Sills, and Mark Miller for additional fixes in this
release.


## Release 0.4.0 (20-Feb-2019)

Improve usability.

* remove `Nat` and `def` from the global environment #45
* provide a helper function named `s.makeRequire()` to build a `require`
  endowment. This can be configured to enable `require('@agoric/nat')` or
  `require('@agoric/harden')` (among others), so the same code can work
  either inside or outside of a SES realm. For details of its configuration,
  see the comments in the commit which landed it. #13
* harden() comes from `@agoric/make-hardener`, which doesn't climb
  prototype/inheritance chains, but does complain if the prototype wasn't
  already known to harden(). This avoids the "Ice-9" freeze-the-world
  problem, and also serves to signal when an object from one realm is passed
  into the harden() of a different realm. #15
* harden() now shares a WeakSet of previously-hardened objects #4
* use harden() instead of def() #39
* SES no longer depends upon Nat, but uses it during unit tests. Client code
  that wants Nat should use `require('@agoric/nat')`. #45
* Include AsyncIteratorPrototype in the set of anonIntrinsics #58
* use eslint to format all SES code


## Release 0.3.0 (08-Feb-2019)

Improves security and functionality.

This fixes all known confinement leaks:

* We now freeze AsyncGeneratorFunction and AsyncFunction, the last of the
  "anonymous" intrinsics (which are reachable by syntax but not simple
  property lookup). In the previous release, attacker code could modify their
  behavior (which defender code might have been relying upon) or use them as
  a communication channel. (#3, #41)
* We now remove all unknown properties from the global object, using a
  special list of ones that are safe to expose. This protects us from
  surprising platform-specific objects, or newly-added standard JS objects
  that have not yet been examined for safety. The 'Intl' object is currently
  removed by this check (and `intlMode: "allow"` has been removed), but may
  be brought back in a future release. (#26)
* RegExp.prototype.compile is removed unconditionally (even if regexpMode:
  "allow" is set), because it violates the semantics of Object.freeze

It also improves usability:

* Uncaught exceptions in Node.js are now rendered correctly when the
  `errorStackMode: "allow"` option is enabled. In the previous release, such
  exceptions were always displayed as "undefined", which was particularly
  unhelpful. If your program is abruptly exiting with "undefined", try
  turning this option on while you're debugging. But don't leave it on,
  because it probably enables a confinement breach.
* SES is an ES6 module, but should now be importable with `require()` by
  other code which is unaware of ES6 modules, because it now uses the `esm`
  module internally. (#32)
* `console.log` is now available within the confined code, if the
  `consoleMode: "allow"` option is enabled. If this is disabled,
  `console.log()` will throw a `TypeError` (since `console` is undefined, it
  has no `log` property). Many other `console` methods (but not all) are
  exposed too. (#35)

SES now requires Node.js version 10 or later.


## Release 0.2.0 (18-Jan-2019)

Improves confinement, small API changes.

The options passed as `SES.makeSESRootRealm(options)` have changed:

* `options.dateNowMode="allow"` allows `Date.now()` and `new Date()` to
  work normally, otherwise they return NaN
* `options.mathRandomMode="allow"` allows `Math.random()` to work
  normally (nondeterministically), else it will throw an Error
* `options.intlMode="allow"` lets `Intl.DateTimeFormat()`, `Intl.NumberFormat()`,
  and `Intl.getCanonicalLocales()` to work normally, else they throw Errors
* `options.errorStackMode="allow"` exposes `Error.prototype.stack` and
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


## Release 0.1.3 (24-Aug-2018)

Adds Nat and SES.confineExpr.

* `Nat(val)` ensures the value is a natural (non-negative) integer
* `SES.confineExpr(expr)` makes it easy to start with a function object, turn
  it into a string, then into a new function inside the SES realm.

This also updates the challenge page to fix a demo vulnerability (#8).


## Release 0.1.2 (30-Jul-2018)

* npm name is now 'ses'
* update to current proposal-realms


## Release 0.0.1 (28-Jul-2018)

first preliminary release
