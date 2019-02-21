User-visible changes in SES:

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
