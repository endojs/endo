See the [README](../README.md) for a description of the global `lockdown` function
installed by the SES-shim.
Essentially, calling `lockdown` turns a JavaScript system into a SES system,
with enforced ocap (object-capability) security.
Here we explain the configuration options to the lockdown function.

# `lockdown` Options

For every safety-relevant options setting, if the option is omitted
it defaults to `'safe'`. For these options, the tradeoff is safety vs
compatibility, though note that a tremendous amount of legacy code, not
written to run under SES, does run compatibly under SES even with all of these
options set to `'safe'`. You should only consider an `'unsafe'` option if
you find you need it and are able to evaluate the risks.

The `stackFiltering` option trades off stronger filtering of stack traceback to
minimize distractions vs completeness for tracking down a bug hidden in
obscure places. The `overrideTaming` option trades off better code
compatibility vs better tool compatibility.

Each option is explained in its own section below.

| option                           | default setting  | other settings                         | about |
|----------------------------------|------------------|----------------------------------------|-------|
| `regExpTaming`                   | `'safe'`         | `'unsafe'`                             | `RegExp.prototype.compile` ([details](#regexptaming-options)) |
| `localeTaming`                   | `'safe'`         | `'unsafe'`                             | `toLocaleString`           ([details](#localetaming-options)) |
| `consoleTaming`                  | `'safe'`         | `'unsafe'`                             | deep stacks                ([details](#consoletaming-options)) |
| `errorTaming`                    | `'safe'`         | `'unsafe'` `'unsafe-debug'`            | `errorInstance.stack`      ([details](#errortaming-options)) |
| `errorTrapping`                  | `'platform'`     | `'exit'` `'abort'` `'report'` `'none'` | handling of uncaught exceptions ([details](#errortrapping-options)) |
| `reporting`                      | `'platform'`     | `'console'` `'none'`                   | where to report warnings ([details](#reporting-options))
| `unhandledRejectionTrapping`     | `'report'`       | `'none'`                               | handling of finalized unhandled rejections ([details](#unhandledrejectiontrapping-options)) |
| `evalTaming`                     | `'safe-eval'`    | `'unsafe-eval'` `'no-eval'`            | `eval` and `Function` of the start compartment ([details](#evaltaming-options)) |
| `stackFiltering`                 | `'concise'`      | `'omit-frames'` `'shorten-paths'` `'verbose'`  | deep stacks signal/noise   ([details](#stackfiltering-options)) |
| `overrideTaming`                 | `'moderate'`     | `'min'` or `'severe'`                  | override mistake antidote  ([details](#overridetaming-options)) |
| `overrideDebug`                  | `[]`             | array of property names                | detect override mistake    ([details](#overridedebug-options)) |
| `domainTaming`                   | `'safe'`         | `'unsafe'`                             | Node.js `domain` module    ([details](#domaintaming-options)) |
| `legacyRegeneratorRuntimeTaming` | `'safe'`         | `'unsafe-ignore'`                      | regenerator-runtime ([details](#legacyregeneratorruntimetaming-options)) |
| `__hardenTaming__`               | `'safe'`         | `'unsafe'`                             | Making `harden` no-op for performance in trusted environments ([details](#__hardentaming__-options)) |

In the absence of any of these options in lockdown arguments, lockdown will
attempt to read these options from `process.env`, using the Node.js convention
for threading environment variables into a JavaScript program.

| option                           | environment variable                         | notes                 |
|----------------------------------|----------------------------------------------|-----------------------|
| `regExpTaming`                   | `LOCKDOWN_REGEXP_TAMING`                     |                       |
| `localeTaming`                   | `LOCKDOWN_LOCALE_TAMING`                     |                       |
| `consoleTaming`                  | `LOCKDOWN_CONSOLE_TAMING`                    |                       |
| `errorTaming`                    | `LOCKDOWN_ERROR_TAMING`                      |                       |
| `errorTrapping`                  | `LOCKDOWN_ERROR_TRAPPING`                    |                       |
| `reporting`                      | `LOCKDOWN_REPORTING`                         |                       |
| `unhandledRejectionTrapping`     | `LOCKDOWN_UNHANDLED_REJECTION_TRAPPING`      |                       |
| `evalTaming`                     | `LOCKDOWN_EVAL_TAMING`                       |                       |
| `stackFiltering`                 | `LOCKDOWN_STACK_FILTERING`                   |                       |
| `overrideTaming`                 | `LOCKDOWN_OVERRIDE_TAMING`                   |                       |
| `overrideDebug`                  | `LOCKDOWN_OVERRIDE_DEBUG`                    | comma separated names |
| `domainTaming`                   | `LOCKDOWN_DOMAIN_TAMING`                     |                       |
| `legacyRegeneratorRuntimeTaming` | `LOCKDOWN_LEGACY_REGENERATOR_RUNTIME_TAMING` |                       |
| `__hardenTaming__`               | `LOCKDOWN_HARDEN_TAMING`                     |                       |

The options `mathTaming` and `dateTaming` are deprecated.
`Math.random`, `Date.now`, and the `new Date()` are disabled within
compartments and can be injected as `globalThis` endowments if necessary, as in
this example where we inject an independent pseudo-random-number generator in
this single-tenant compartment.

```js
new Compartment({
  Math: harden({
    ...Math,
    random: harden(makeRandom(seed)),
  }),
})
```

## `regExpTaming` Options

**Background**: In standard plain JavaScript, the builtin
`RegExp.prototype.compile` method may violate the object invariants of frozen
`RegExp` instances. This violates assumptions elsewhere, and so can be
used to corrupt other guarantees. For example, the JavaScript `Proxy`
abstraction preserves the object invariants only if its target does. It was
designed under the assumption that these invariants are never broken. If a
non-conforming object is available, it can be used to construct a proxy
object that is also non-conforming.

```js
lockdown(); // regExpTaming defaults to 'safe'
// or
lockdown({ regExpTaming: 'safe' }); // Delete RegExp.prototype.compile
// vs
lockdown({ regExpTaming: 'unsafe' }); // Preserve RegExp.prototype.compile
```

If `lockdown` does not receive a `regExpTaming` option, it will respect
`process.env.LOCKDOWN_REGEXP_TAMING`.

```console
LOCKDOWN_REGEXP_TAMING=safe
LOCKDOWN_REGEXP_TAMING=unsafe
```

The `regExpTaming` default `'safe'` setting deletes this dangerous method. The
`'unafe'` setting preserves it for maximal compatibility at the price of some
risk.

**Background**: In de facto plain JavaScript, the legacy `RegExp` static
methods like `RegExp.lastMatch` are an unsafe global
[overt communications channel](https://papers.agoric.com/taxonomy-of-security-issues/).
They reveal on the `RegExp` constructor information derived from the last match
made by any `RegExp` instance&mdash;a bizarre form of non-local causality.
These static methods are currently part of de facto
JavaScript but not yet part of the standard. The
[Legacy RegExp static methods](https://github.com/tc39/proposal-regexp-legacy-features)
proposal would standardize them as *normative optional* and deletable, meaning
   * A conforming JavaScript engine may omit them
   * A shim may delete them and have the resulting state still conform
     to the specification of an initial JavaScript state.

All these legacy `RegExp` static methods are currently removed under all
settings of the `regExpTaming` option.
So far this has not caused any compatibility problems.
If it does, then we may decide to support them, but *only* under the
`'unsafe'` setting and *only* on the `RegExp`  constructor of the start
compartment. The `RegExp` constructor shared by other compartments will remain
safe and powerless.

## `localeTaming` Options

**Background**: In standard plain JavaScript, the builtin methods with
 "`Locale`" or "`locale`" in their name&mdash;`toLocaleString`,
`toLocaleDateString`, `toLocaleTimeString`, `toLocaleLowerCase`,
`toLocaleUpperCase`, and `localeCompare`&mdash;have a global behavior that is
not fully determined by the language spec, but rather varies with location and
culture, which is their point. However, by placing this information of shared
primordial prototypes, it cannot differ per comparment, and so one compartment
cannot virtualize the locale for code running in another compartment. Worse, on
some engines the behavior of these methods may change at runtime as the machine
is "moved" between different locales,
i.e., if the operating system's locale is reconfigured while JavaScript
code is running.

```js
lockdown(); // localeTaming defaults to 'safe'
// or
lockdown({ localeTaming: 'safe' }); // Alias toLocaleString to toString, etc
// vs
lockdown({ localeTaming: 'unsafe' }); // Allow locale-specific behavior
```

If `lockdown` does not receive a `localeTaming` option, it will respect
`process.env.LOCKDOWN_LOCALE_TAMING`.

```console
LOCKDOWN_LOCALE_TAMING=safe
LOCKDOWN_LOCALE_TAMING=unsafe
```

The `localeTaming` default `'safe'` option replaces each of these methods with
the corresponding non-locale-specific method. `Object.prototype.toLocaleString`
becomes just another name for `Object.prototype.toString`. The `'unsafe'`
setting preserves the original behavior for maximal compatibility at the price
of reproducibility and fingerprinting. Aside from fingerprinting, the risk that
this slow non-determinism opens a
[communications channel](https://agoric.com/taxonomy-of-security-issues/)
is negligible.

## `consoleTaming` Options

**Background**: Most JavaScript environments provide a `console` object on the
global object with interesting information hiding properties. JavaScript code
can use the `console` to send information to the console's logging output, but
cannot see that output. The `console` is a *write-only device*. The logging
output is normally placed where a human programmer, who is in a controlling
position over that computation, can see the output. This output is, accordingly,
formatted mostly for human consumption; typically for diagnosing problems.

Given these constraints, it is both safe and helpful for the `console` to reveal
to the human programmer information that it would not reveal to the objects it
interacts with. SES amplifies this special relationship to reveal
to the programmer much more information than would be revealed by the normal
`console`. To do so, by default during `lockdown` SES virtualizes the builtin
`console`, by replacing it with a wrapper. The wrapper is a virtual `console`
that implements the standard `console` API mostly by forwarding to the original
wrapped `console`.
In addition, the virtual `console` has a special relationship with
error objects and with the SES `assert` package, so that errors can report yet
more diagnostic information that should remain hidden from other objects. See
the [error README](../src/error/README.md) for an in depth explanation of this
relationship between errors, `assert` and the virtual `console`.

```js
lockdown(); // consoleTaming defaults to 'safe'
// or
lockdown({ consoleTaming: 'safe' }); // Wrap start console to show deep stacks
// vs
lockdown({ consoleTaming: 'unsafe' }); // Leave original start console in place
// or
lockdown({
  consoleTaming: 'unsafe', // Leave original start console in place
  overrideTaming: 'min', // Until https://github.com/endojs/endo/issues/636
});
```

If `lockdown` does not receive a `consoleTaming` option, it will respect
`process.env.LOCKDOWN_CONSOLE_TAMING`.

```console
LOCKDOWN_CONSOLE_TAMING=safe
LOCKDOWN_CONSOLE_TAMING=unsafe
```

The `consoleTaming: 'safe'` setting replaces the global console with a tamed
console, and that tamed console is safe to endow to a guest `Compartment`.
Additionally, any errors created with the `assert` function or methods on its
namespace may have [redacted details](../src/error/README.md): information
included in the error message that is informative to a debugger and made
invisible to an attacker.
The tamed console removes redactions and shows these details to the original
console.

The `consoleTaming: 'unsafe'` setting leaves the original console in place.
The `assert` package and error objects will continue to work, but the `console`
logging output will not show any of this extra information.

The risk is that the original platform-provided `console` object often has
additional methods beyond the de facto `console` "standards" and may be unsafe
to endow to a guest `Compartment`.
Under the `'unsafe'` setting we do not remove them.
We do not know whether any of these additional methods violate ocap security.
Until we know otherwise, we should assume these are unsafe. Such a raw
`console` object should only be handled by very trustworthy code.

Until the bug
[Node console gets confused if .constructor is an accessor (#636)](https://github.com/endojs/endo/issues/636)
is fixed, if you use the `consoleTaming: 'unsafe'` setting and might be running
with the Node `console`, we advise you to also set `overrideTaming: 'min'` so
that no builtin `constructor` properties are turned into accessors.

Examples from
[deep-send.test.js](https://github.com/Agoric/agoric-sdk/blob/master/packages/eventual-send/test/deep-send.test.js)
of the eventual-send shim:

<details>
  <summary>Expand for { consoleTaming: 'safe' } log output</summary>

    expected failure (Error#1)
    Nested error
      Error#1: Wut?
        at Object.bar (packages/eventual-send/test/deep-send.test.js:13:21)

      Error#1 ERROR_NOTE: Thrown from: (Error#2) : 2 . 0
      Error#1 ERROR_NOTE: Rejection from: (Error#3) : 1 . 1
      Nested 2 errors under Error#1
        Error#2: Event: 1.1
          at Object.foo (packages/eventual-send/test/deep-send.test.js:17:28)

        Error#2 ERROR_NOTE: Caused by: (Error#3)
        Nested error under Error#2
          Error#3: Event: 0.1
            at Object.test (packages/eventual-send/test/deep-send.test.js:21:22)
            at packages/eventual-send/test/deep-send.test.js:25:19
            at async Promise.all (index 0)
</details>

<details>
  <summary>Expand for { consoleTaming: 'unsafe', overrideTaming: 'min' } log output</summary>

    expected failure [Error: Wut?
      at Object.bar (packages/eventual-send/test/deep-send.test.js:13:21)]
</details>

## `errorTaming` Options

**Background**: The error system of JavaScript has several safety problems.
In most JavaScript engines running normal JavaScript, if `err` is an
Error instance, the expression `err.stack` will produce a string
revealing the stack trace. This is an
[overt information leak, a confidentiality
violation](https://papers.agoric.com/taxonomy-of-security-issues/).
This `stack` property reveals information about the call stack that violates
the encapsulation of the callers.

This `stack` is part of de facto JavaScript, is not yet part
of the official standard, and is proposed at
[Error Stacks proposal](https://github.com/tc39/proposal-error-stacks).
Because it is unsafe, we propose that the `stack` property be "normative
optional", meaning that a conforming implementation may omit it. Further,
if present, it should be present only as a deletable accessor property
inherited from `Error.prototype` so that it can be deleted. The actual
stack information would be available by other means, the `getStack` and
`getStackString` functions&mdash;special powers available only in the start
compartment&mdash;so the SES console can still operate as described above.

On v8&mdash;the JavaScript engine powering Chrome, Brave, and Node&mdash;the
default error behavior is much more dangerous. The v8 `Error` constructor
provides a set of
[static methods for accessing the raw stack
information](https://v8.dev/docs/stack-trace-api) that are used to create
error stack strings. Some of this information is consistent with the level
of disclosure provided by the proposed `getStack` special power above.
Some go well beyond it.

Neither the `'safe'` or `'unsafe'` settings of the `errorTaming`
affect the safety of the `Error`
constructor. In those cases, after calling `lockdown`, the tamed `Error`
constructor in the start compartment follows ocap rules.
Under v8 it emulates most of the
magic powers of the v8 `Error` constructor&mdash;those consistent with the
level of disclosure of the proposed `getStack`. In all cases, the `Error`
constructor shared by all other compartments is both safe and powerless.

See the [error README](../src/error/README.md) for an in depth explanation of
the relationship between errors, `assert` and the virtual `console`.

When running TypeScript tests on Node without SES,
you'll see accurate line numbers into the original TypeScript source.
However, with SES with the `'safe'` or `'unsafe'` settings of
`errorTaming` the stacks will show all TypeScript positions as line 1,
which is the one line of JavaScript the TypeScript compiled to.
We would like to fix this while preserving safety, but have not yet done so.

Instead, we introduce the `'unsafe-debug'` setting, which sacrifices
more security to restore this pleasant Node behavior.
Where `'safe'` and `'unsafe'` endangers only confidentiality, `'unsafe-debug'` also
endangers intergrity. For development and debugging purposes ***only***,
this is usually the right tradeoff. But please don't use this setting in a
production environment.

On non-v8 platforms, `'unsafe'` and `'unsafe-debug'` do the same thing, since
[the problem](https://github.com/endojs/endo/issues/1798) is specific to
Node on v8.

```js
lockdown(); // errorTaming defaults to 'safe'
// or
lockdown({ errorTaming: 'safe' }); // Deny unprivileged access to stacks, if possible
// vs
lockdown({ errorTaming: 'unsafe' }); // stacks also available by errorInstance.stack
// vs
lockdown({ errorTaming: 'unsafe-debug' }); // sacrifice more safety for source-mapped line numbers.
```

If `lockdown` does not receive an `errorTaming` option, it will respect
`process.env.LOCKDOWN_ERROR_TAMING`.

```console
LOCKDOWN_ERROR_TAMING=safe
LOCKDOWN_ERROR_TAMING=unsafe
```

The `errorTaming` default `'safe'` setting makes the stack trace inaccessible
from error instances alone, when possible. It currently does this only on
v8 (Chrome, Brave, Node). It will also do so on SpiderMonkey (Firefox).
Currently is it not possible for the SES-shim to hide it on other
engines, leaving this information leak available. Note that it is only an
information leak. It reveals the magic information only as a powerless
string. This leak threatens
[confidentiality but not integrity](https://papers.agoric.com/taxonomy-of-security-issues/).

Since the current JavaScript de facto reality is that the stack is only
available by saying `err.stack`, a number of development tools assume they
can find it there. When the information leak is tolerable, the `'unsafe'`
setting will preserve the filtered stack information on the `err.stack`.

Like hiding the stack, the purpose of the `details` template literal tag (often
spelled `X`) together with the `quote` function (often spelled `q`) is
to redact data from the error messages carried by error instances. The same
`{errorTaming: 'unsafe'}` suppresses that redaction as well, so that all
substitution values would act like they've been quoted. With this setting

```js
assert(false, X`literal part ${secretData} with ${q(publicData)}.`);
```

acts like

```js
assert(false, X`literal part ${q(secretData)} with ${q(publicData)}.`);
```

The `lockdown({ errorTaming: 'unsafe' })` call has this effect by replacing
the global `assert` object with one whose `assert.details` does not redact.
So be sure to sample `assert` and `assert.details` only after such a call to
lockdown:

```js
lockdown({ errorTaming: 'unsafe' });

// Grab `details` only after lockdown
const { details: X, quote: q } = assert;
```

Like with the stack, the SES shim `console` object always
shows the unredacted detailed error message independent of the setting of
`errorTaming`.

## `errorTrapping` Options

**Background**: With safe error taming and console taming, after lockdown,
errors are born without an attached `stack` string.
Logging the error with the tamed `console` will safely reveal the stack to the
debugger or terminal.
However, an uncaught exception gets logged to the console without the
benefit of the tamed `console`.

```js
lockdown(); // errorTrapping defaults to 'platform'
// or
lockdown({ errorTrapping: 'platform' }); // 'exit' on Node, 'report' on the web.
// vs
lockdown({ errorTrapping: 'exit' }); // report and exit
// vs
lockdown({ errorTrapping: 'abort' }); // report and drop a core dump
// vs
lockdown({ errorTrapping: 'report' }); // just report
// vs
lockdown({ errorTrapping: 'none' }); // no platform error traps
```

If `lockdown` does not receive an `errorTrapping` option, it will respect
`process.env.LOCKDOWN_ERROR_TRAPPING`.

```console
LOCKDOWN_ERROR_TRAPPING=platform
LOCKDOWN_ERROR_TRAPPING=exit
LOCKDOWN_ERROR_TRAPPING=abort
LOCKDOWN_ERROR_TRAPPING=report
LOCKDOWN_ERROR_TRAPPING=none
```

On the web, the `window` event emitter has a trap for `error` events.
In the absence of a trap, the platform logs the error to the debugger console
and continues.
This is consistent with the security ethos that a sandboxed program should not
have the ambient power of causing the surrounding process to exit.
However, setting `errorTrapping` to `'exit'` or `'abort'` will cause the
web equivalent of halting the page: the error will cause navigation to
a blank page, immediately halting execution in the window.

In Node.js, the `process` event emitter has a trap for `uncaughtException`.
In the absence of a trap, the platform logs the error and immediately exits the
process.
To be consistent with the underlying platform, the SES default `errorTrapping` of
`'platform'` registers an `uncaughtException` handler that feeds the
error to the tamed console so you can observe the stack trace, then exits
with a non-zero status code, favoring the existing value in `process.exitCode`,
but defaulting to -1.
The default on Node.js is consistent with the underlying platform but
inconsistent with the principle of only granting the authority to cause
the container to exit explicitly, and we highly recommend setting
`errorTrapping` to `'report'` explicitly.

- `'platform'`: is the default and is equivalent to `'report'` on the Web or
  `'exit'` on Node.js.
- `'report'`: just report errors to the tamed console so stack traces appear.
- `'exit'`: reports and exits on Node.js, reports and navigates away on the
  web.
- `'abort'`: reports and aborts a Node.js process, leaving a core dump for
  postmortem analysis, reports and navigates away on the web.
- `'none'`: do not install traps for uncaught exceptions. Errors are likely to
  appear as `{}` when they are reported by the default trap.

## `reporting` Options

**Background**: `lockdown` and `repairIntrinsics` report warnings if they
encounter unexpected but repairable variations on the shared intrinsics, which
regularly occurs if the version of `ses` predates the introduction of new
language features.
With the `reporting` option, an application can mute or control the direction
of these warnings.

```js
lockdown(); // reporting defaults to 'platform'
// or
lockdown({ reporting: 'platform' });
// vs
lockdown({ reporting: 'console' });
// vs
lockdown({ reporting: 'none' });
```

If `lockdown` does not receive a `reporting` option, it will respect
`process.env.LOCKDOWN_REPORTING`.

```console
LOCKDOWN_REPORTING=platform
LOCKDOWN_REPORTING=console
LOCKDOWN_REPORTING=none
```

- The default behavior is `'platform'` which will detect the platform and
  report warnings according to whether a web `console`, Node.js `console`, or
  `print` are available.
  The web platform is distinguished by the existence of `window` or
  `importScripts` (WebWorker).
  The Node.js behavior is to report all warnings to `stderr` visually
  consistent with use of a console group.
  SES will use `print` in the absence of a `console`.
  Captures the platform `console` at the time `lockdown` or `repairIntrinsics`
  are called, not at the time `ses` initializes.
- The `'console'` option forces the web platform behavior.
  On Node.js, this results in group labels being reported to `stdout`.
  The global `console` can be replaced before `lockdown` so using this option
  will drive use of `console.groupCollapsed`, `console.groupEnd`,
  `console.warn`, and `console.error` assuming that console is suited for
  reporting arbitrary diagnostics rather than also being suited to generate
  machine-readable `stdout`.
- The `'none'` option mutes warnings.

## `unhandledRejectionTrapping` Options

**Background**: Same concerns as `errorTrapping`, but in addition, SES will
attempt to install platform-specific finalized (rather than just same-turn)
unhandled rejection trapping.  If that attempt fails, then the platform's
default unhandled rejection behavior remains in effect.

```js
lockdown(); // unhandledRejectionTrapping defaults to 'report'
// or
lockdown({ unhandledRejectionTrapping: 'report' }); // print finalized unhandled rejections
// vs
lockdown({ unhandledRejectionTrapping: 'none' }); // no special unhandled rejection traps
```

If `lockdown` does not receive an `unhandledRejectionTrapping` option, it will
respect `process.env.LOCKDOWN_UNHANDLED_REJECTION_TRAPPING`.

```console
LOCKDOWN_UNHANDLED_REJECTION_TRAPPING=report
LOCKDOWN_UNHANDLED_REJECTION_TRAPPING=none
```

On the web, the `window` event emitter has a trap for `unhandledrejection` and
`rejectionhandled` events.  In the absence of a trap, the platform logs
rejections that were not handled in the same turn in which they were created to
the debugger console and continues.  However, setting `errorTrapping` to
`'exit'` or `'abort'` will cause the web equivalent of halting the page: the
error will cause navigation to a blank page, immediately halting execution in
the window.

In Node.js, the `process` event emitter has a trap for `unhandledRejection` and
`rejectionHandled`.  In the absence of a trap, the platform logs rejections that
were not handled in the same turn in which they were created, and potentially a
scary warning that says unhandled rejections may cause the process to exit in a
future release.

By setting a non-`'none'` value for `unhandledRejectionTrapping`, the event
handler will only be triggered by unhandled rejections when they are finalized.
This enables the program to attach rejection handlers asynchronously without
triggering the SES trap handler.

- `'report'`: just report finalized unhandled rejections to the tamed console so stack traces appear.
- `'none'`: do not install traps for finalized unhandled rejections. Errors are
  likely to appear as `{}` when they are reported by the default trap.

## `evalTaming` Options

This option only affects the start compartment!

To disallow `eval` in specific compartments, replace `eval` and the function
constructors in the compartment.

```js
const c = new Compartment()
c.globalThis.eval = c.globalThis.Function = function() {
  throw new TypeError();
};
```

**Background**: Every realm has an implicit initial compartment we call the "start compartment". Explicit compartments are made with the `Compartment` constructor.
For every compartment including the start compartment, there are evaluators `eval` and `Function`.
The default lockdown behavior isolates all of these evaluators.

Replacing the realm's initial evaluators is not necessary to ensure the
isolation of guest code because guest code must not run in the start compartment.
Although the code run in the start compartment is normally referred to as "trusted", we mean only that we assume it was not written maliciously. It may still be buggy, and it may be buggy in a way that is exploitable by malicious guest code. To limit the harm that such vulnerabilities can cause, the default (`'safe-eval'`) setting replaces the evaluators of the start compartment with their safe alternatives.

However, in the shim, only the exact `eval` function from the start compartment can be used to
perform direct eval, which runs in the lexical scope in which the direct eval syntax appears (the direct eval syntax is a special form rather than a function call).
The SES shim itself uses direct eval internally to construct an isolated
evaluator, so replacing the initial `eval` prevents any subsequent program
from using the same mechanism to isolate a guest program.

The `'unsafe-eval'` option for `evalTaming` leaves the original `eval` in place
for other isolation mechanisms like isolation code generators that work in
tandem with SES.
This option may be useful for web pages with an environment that allows `'unsafe-eval'`,
like a development-mode bundling systems that use `eval`
(for example, [`'eval-source-map'` in webpack](https://webpack.js.org/configuration/devtool/#devtool)).

In these cases, SES cannot be responsible for maintaining the isolation of
guest code. If you're going to use `eval`, [Trusted
Types](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy/trusted-types) may help maintain security.

The `'no-eval'` option emulates a Content Security Policy that disallows
`'unsafe-eval'` by replacing all evaluators with functions that throw an
exception.

```js
lockdown(); // evalTaming defaults to 'safe-eval'
// or
lockdown({ evalTaming: 'no-eval' }); // disallowing calling eval like there is a CSP limitation.
// vs

// Please use this option with caution.
// You may want to use Trusted Types or Content Security Policy with this option.
lockdown({ evalTaming: 'unsafe-eval' });
```

Also `'unsafe-eval'` and `no-eval` allow us to initialize SES when no direct eval is available.

**Background**: Hermes is a JavaScript engine that does not yet support direct `eval()` nor the `with` statement. Default option `'safe-eval'` evaluates the source using direct eval and multiple nested `with` statements to create a restricted scope chain that constructs the isolated evaluator. This leaves us with options `'unsafe-eval'` or `'no-eval'`.

Note: In the future when the Compartment global class is supported on Hermes after `lockdown`, attempting to evaluate a compartment will emit on Hermes `Uncaught SyntaxError: 2:5:invalid statement encountered` (referring to make-evaluate.js > evaluateFactory) if the `with` statement is still unsupported.

Once Hermes engine supports direct eval, the `SES_DIRECT_EVAL` error will not longer prevent SES initializing with `'safe-eval'`.
Currently there is an open feature request and open pull request targeting Static Hermes.

* <https://github.com/facebook/hermes/issues/957>
  * <https://github.com/facebook/hermes/pull/1515>

You can also test and verify `lockdown` completing on this change by [building and running](https://github.com/facebook/hermes/blob/static_h/doc/BuildingAndRunning.md) Static Hermes on the following fork for example:
<https://github.com/leotm/hermes/tree/ses-lockdown-test-static-hermes-compiler-vm>

Once Hermes engine supports direct eval and the `with` statement, `'safe-eval'` will work.
Currently there is an open feature request and open pull request targeting Static Hermes.

* <https://github.com/facebook/hermes/issues/1056>
  * <https://github.com/facebook/hermes/pull/1571>

There is also an open alternate idea to sandbox `Compartment` *without* the `with` statement.

* <https://github.com/endojs/endo/discussions/1944>

If `lockdown` does not receive an `evalTaming` option, it will respect
`process.env.LOCKDOWN_EVAL_TAMING`.

```console
LOCKDOWN_EVAL_TAMING=safe-eval
LOCKDOWN_EVAL_TAMING=no-eval
LOCKDOWN_EVAL_TAMING=unsafe-eval
```

## `stackFiltering` Options

**Background**: The error stacks shown by many JavaScript engines are
voluminous.
They contain many stack frames of functions in the infrastructure, that is
usually irrelevant to the programmer trying to diagnose a bug. The SES-shim's
`console`, under the default `consoleTaming` option of `'safe'`, is even more
voluminous&mdash;displaying "deep stack" traces, tracing back through the
[eventually sent messages](https://github.com/tc39/proposal-eventual-send)
from other turns of the event loop. (Eventually we hope these deep
stacks will even cross vat/process and machine boundaries, to help debug
distributed bugs, as in [Causeway](https://github.com/cocoonfx/causeway).)

```js
lockdown(); // stackFiltering defaults to 'concise'
// or
lockdown({ stackFiltering: 'concise' }); // Preserve important deep stack info. Omit likely uninteresting frames. Shorten paths to likely clickable strings in an IDE
// vs
lockdown({ stackFiltering: 'omit-frames' }); // Only omit likely uninteresting frames. Preserve original paths
// vs
lockdown({ stackFiltering: 'shorten-paths' }); // Preserve original frames. shorten their paths to likely clickable strings in an IDE.
// vs
lockdown({ stackFiltering: 'verbose' }); // Console shows full deep stacks
```

If `lockdown` does not receive a `stackFiltering` option, it will respect
`process.env.LOCKDOWN_STACK_FILTERING`.

```console
LOCKDOWN_STACK_FILTERING=concise
LOCKDOWN_STACK_FILTERING=omit-frames
LOCKDOWN_STACK_FILTERING=shorten-paths
LOCKDOWN_STACK_FILTERING=verbose
```

When looking at deep stacks, in order to debug asynchronous
computation, seeing the full stacks is overwhelmingly noisy. The error stack
proposal leaves it to the host what stack trace info to show. SES virtualizes
elements of the host. With this freedom in mind, under the `concise` setting,
the SES-shim
filters and transforms the stack trace information it shows to be more useful,
by removing information that is more an artifact of low level infrastructure.
The SES-shim currently does so only on v8.

However, sometimes your bug might be in that infrastrusture, in which case
that information is no longer an extraneous distraction. Sometimes the noise
you filter out actually contains the signal you're looking for. The
`'verbose'` setting shows, on the console, the full raw stack information
for each level of the deep stacks.
Any setting of `stackFiltering` is safe. Stack information will
or will not be available from error objects according to the `errorTaming`
option and the platform error behavior.

Examples from
[deep-send.test.js](https://github.com/Agoric/agoric-sdk/blob/master/packages/eventual-send/test/deep-send.test.js)
of the eventual-send shim:
<details>
  <summary>Expand for { stackFiltering: 'concise' } log output</summary>

      THROWN to top of event loop (Error#1)
        ✔ deep-stacks E with ses-ava t.log
          ℹ expected failure Error {
              message: '["ses-ava t.log"] "blue" is not 42',
            }
      Error#1: [ ses-ava t.log ] blue is not 42
        at Object.bar (packages/eventual-send/test/deep-send.test.js:14:28)

      Error#1 ERROR_NOTE: Thrown from: (Error#2) : 2 . 0
      Nested error under Error#1
        Error#2: Event: 1.1
          at Object.foo (packages/eventual-send/test/deep-send.test.js:18:37)

        Error#2 ERROR_NOTE: Caused by: (Error#3)
        Nested error under Error#2
          Error#3: Event: 0.1
            at Object.test (packages/eventual-send/test/deep-send.test.js:22:25)
            at exec (packages/eventual-send/test/deep-send.test.js:29:21)
            at async Promise.all (index 0)
</details>

<details>
  <summary>Expand for { stackFiltering: 'omit-frames' } log output</summary>

      THROWN to top of event loop (Error#1)
        ✔ deep-stacks E with ses-ava t.log
          ℹ expected failure Error {
              message: '["ses-ava t.log"] "blue" is not 42',
            }
      Error#1: [ ses-ava t.log ] blue is not 42
        at Object.bar (file:///Users/markmiller/src/ongithub/endojs/endo/packages/eventual-send/test/deep-send.test.js:14:28)

      Error#1 ERROR_NOTE: Thrown from: (Error#2) : 2 . 0
      Nested error under Error#1
        Error#2: Event: 1.1
          at Object.foo (file:///Users/markmiller/src/ongithub/endojs/endo/packages/eventual-send/test/deep-send.test.js:18:37)

        Error#2 ERROR_NOTE: Caused by: (Error#3)
        Nested error under Error#2
          Error#3: Event: 0.1
            at Object.test (file:///Users/markmiller/src/ongithub/endojs/endo/packages/eventual-send/test/deep-send.test.js:22:25)
            at exec (file:///Users/markmiller/src/ongithub/endojs/endo/packages/eventual-send/test/deep-send.test.js:29:21)
            at async Promise.all (index 0)
</details>

<details>
  <summary>Expand for { stackFiltering: 'shorten-paths' } log output</summary>

      THROWN to top of event loop (Error#1)
        ✔ deep-stacks E with ses-ava t.log
          ℹ expected failure Error {
              message: '["ses-ava t.log"] "blue" is not 42',
            }
      Error#1: [ ses-ava t.log ] blue is not 42
        at makeError (packages/ses/src/error/assert.js:350:61)
        at fail (packages/ses/src/error/assert.js:482:20)
        at baseAssert.Fail (packages/ses/src/error/assert.js:492:39)
        at Object.bar (packages/eventual-send/test/deep-send.test.js:14:28)
        at localApplyMethod (packages/eventual-send/src/local.js:126:18)
        at Object.applyMethod (packages/eventual-send/src/handled-promise.js:463:16)
        at dispatchToHandler (packages/eventual-send/src/handled-promise.js:159:22)
        at doDispatch (packages/eventual-send/src/handled-promise.js:494:7)
        at packages/eventual-send/src/track-turns.js:56:18
        at win (packages/eventual-send/src/handled-promise.js:514:26)
        at packages/eventual-send/src/handled-promise.js:533:20
        at process.processTicksAndRejections (node:internal/process/task_queues:105:5)

      Error#1 ERROR_NOTE: Thrown from: (Error#2) : 2 . 0
      Nested error under Error#1
        Error#2: Event: 1.1
          at trackTurns (packages/eventual-send/src/track-turns.js:100:24)
          at handle (packages/eventual-send/src/handled-promise.js:503:33)
          at baseHandledPromise.applyMethod (packages/eventual-send/src/handled-promise.js:426:14)
          at Proxy.bar (packages/eventual-send/src/E.js:76:35)
          at Object.foo (packages/eventual-send/test/deep-send.test.js:18:37)
          at localApplyMethod (packages/eventual-send/src/local.js:126:18)
          at Object.applyMethod (packages/eventual-send/src/handled-promise.js:463:16)
          at dispatchToHandler (packages/eventual-send/src/handled-promise.js:159:22)
          at doDispatch (packages/eventual-send/src/handled-promise.js:494:7)
          at packages/eventual-send/src/track-turns.js:56:18
          at win (packages/eventual-send/src/handled-promise.js:514:26)
          at packages/eventual-send/src/handled-promise.js:533:20
          at process.processTicksAndRejections (node:internal/process/task_queues:105:5)

        Error#2 ERROR_NOTE: Caused by: (Error#3)
        Nested error under Error#2
          Error#3: Event: 0.1
            at trackTurns (packages/eventual-send/src/track-turns.js:100:24)
            at handle (packages/eventual-send/src/handled-promise.js:503:33)
            at baseHandledPromise.applyMethod (packages/eventual-send/src/handled-promise.js:426:14)
            at Proxy.foo (packages/eventual-send/src/E.js:76:35)
            at Object.test (packages/eventual-send/test/deep-send.test.js:22:25)
            at exec (packages/eventual-send/test/deep-send.test.js:29:21)
            at Runnable.fn (file:///Users/markmiller/src/ongithub/endojs/endo/node_modules/ava/lib/runner.js:347:21)
            at Test.callFn (file:///Users/markmiller/src/ongithub/endojs/endo/node_modules/ava/lib/test.js:525:26)
            at Test.run (file:///Users/markmiller/src/ongithub/endojs/endo/node_modules/ava/lib/test.js:534:33)
            at Runner.runSingle (file:///Users/markmiller/src/ongithub/endojs/endo/node_modules/ava/lib/runner.js:281:33)
            at Runner.runTest (file:///Users/markmiller/src/ongithub/endojs/endo/node_modules/ava/lib/runner.js:363:30)
            at process.processTicksAndRejections (node:internal/process/task_queues:105:5)
            at async Promise.all (index 0)
            at async file:///Users/markmiller/src/ongithub/endojs/endo/node_modules/ava/lib/runner.js:528:21
            at async Runner.start (file:///Users/markmiller/src/ongithub/endojs/endo/node_modules/ava/lib/runner.js:536:15)
</details>

<details>
  <summary>Expand for { stackFiltering: 'verbose' } log output</summary>

      THROWN to top of event loop (Error#1)
        ✔ deep-stacks E with ses-ava t.log
          ℹ expected failure Error {
              message: '["ses-ava t.log"] "blue" is not 42',
            }
      Error#1: [ ses-ava t.log ] blue is not 42
        at makeError (file:///Users/markmiller/src/ongithub/endojs/endo/packages/ses/src/error/assert.js:350:61)
        at fail (file:///Users/markmiller/src/ongithub/endojs/endo/packages/ses/src/error/assert.js:482:20)
        at baseAssert.Fail (file:///Users/markmiller/src/ongithub/endojs/endo/packages/ses/src/error/assert.js:492:39)
        at Object.bar (file:///Users/markmiller/src/ongithub/endojs/endo/packages/eventual-send/test/deep-send.test.js:14:28)
        at localApplyMethod (file:///Users/markmiller/src/ongithub/endojs/endo/packages/eventual-send/src/local.js:126:18)
        at Object.applyMethod (file:///Users/markmiller/src/ongithub/endojs/endo/packages/eventual-send/src/handled-promise.js:463:16)
        at dispatchToHandler (file:///Users/markmiller/src/ongithub/endojs/endo/packages/eventual-send/src/handled-promise.js:159:22)
        at doDispatch (file:///Users/markmiller/src/ongithub/endojs/endo/packages/eventual-send/src/handled-promise.js:494:7)
        at file:///Users/markmiller/src/ongithub/endojs/endo/packages/eventual-send/src/track-turns.js:56:18
        at win (file:///Users/markmiller/src/ongithub/endojs/endo/packages/eventual-send/src/handled-promise.js:514:26)
        at file:///Users/markmiller/src/ongithub/endojs/endo/packages/eventual-send/src/handled-promise.js:533:20
        at process.processTicksAndRejections (node:internal/process/task_queues:105:5)

      Error#1 ERROR_NOTE: Thrown from: (Error#2) : 2 . 0
      Nested error under Error#1
        Error#2: Event: 1.1
          at trackTurns (file:///Users/markmiller/src/ongithub/endojs/endo/packages/eventual-send/src/track-turns.js:100:24)
          at handle (file:///Users/markmiller/src/ongithub/endojs/endo/packages/eventual-send/src/handled-promise.js:503:33)
          at baseHandledPromise.applyMethod (file:///Users/markmiller/src/ongithub/endojs/endo/packages/eventual-send/src/handled-promise.js:426:14)
          at Proxy.bar (file:///Users/markmiller/src/ongithub/endojs/endo/packages/eventual-send/src/E.js:76:35)
          at Object.foo (file:///Users/markmiller/src/ongithub/endojs/endo/packages/eventual-send/test/deep-send.test.js:18:37)
          at localApplyMethod (file:///Users/markmiller/src/ongithub/endojs/endo/packages/eventual-send/src/local.js:126:18)
          at Object.applyMethod (file:///Users/markmiller/src/ongithub/endojs/endo/packages/eventual-send/src/handled-promise.js:463:16)
          at dispatchToHandler (file:///Users/markmiller/src/ongithub/endojs/endo/packages/eventual-send/src/handled-promise.js:159:22)
          at doDispatch (file:///Users/markmiller/src/ongithub/endojs/endo/packages/eventual-send/src/handled-promise.js:494:7)
          at file:///Users/markmiller/src/ongithub/endojs/endo/packages/eventual-send/src/track-turns.js:56:18
          at win (file:///Users/markmiller/src/ongithub/endojs/endo/packages/eventual-send/src/handled-promise.js:514:26)
          at file:///Users/markmiller/src/ongithub/endojs/endo/packages/eventual-send/src/handled-promise.js:533:20
          at process.processTicksAndRejections (node:internal/process/task_queues:105:5)

        Error#2 ERROR_NOTE: Caused by: (Error#3)
        Nested error under Error#2
          Error#3: Event: 0.1
            at trackTurns (file:///Users/markmiller/src/ongithub/endojs/endo/packages/eventual-send/src/track-turns.js:100:24)
            at handle (file:///Users/markmiller/src/ongithub/endojs/endo/packages/eventual-send/src/handled-promise.js:503:33)
            at baseHandledPromise.applyMethod (file:///Users/markmiller/src/ongithub/endojs/endo/packages/eventual-send/src/handled-promise.js:426:14)
            at Proxy.foo (file:///Users/markmiller/src/ongithub/endojs/endo/packages/eventual-send/src/E.js:76:35)
            at Object.test (file:///Users/markmiller/src/ongithub/endojs/endo/packages/eventual-send/test/deep-send.test.js:22:25)
            at exec (file:///Users/markmiller/src/ongithub/endojs/endo/packages/eventual-send/test/deep-send.test.js:29:21)
            at Runnable.fn (file:///Users/markmiller/src/ongithub/endojs/endo/node_modules/ava/lib/runner.js:347:21)
            at Test.callFn (file:///Users/markmiller/src/ongithub/endojs/endo/node_modules/ava/lib/test.js:525:26)
            at Test.run (file:///Users/markmiller/src/ongithub/endojs/endo/node_modules/ava/lib/test.js:534:33)
            at Runner.runSingle (file:///Users/markmiller/src/ongithub/endojs/endo/node_modules/ava/lib/runner.js:281:33)
            at Runner.runTest (file:///Users/markmiller/src/ongithub/endojs/endo/node_modules/ava/lib/runner.js:363:30)
            at process.processTicksAndRejections (node:internal/process/task_queues:105:5)
            at async Promise.all (index 0)
            at async file:///Users/markmiller/src/ongithub/endojs/endo/node_modules/ava/lib/runner.js:528:21
            at async Runner.start (file:///Users/markmiller/src/ongithub/endojs/endo/node_modules/ava/lib/runner.js:536:15)</details>

## `overrideTaming` Options

**Background**: JavaScript suffers from the so-called
[override mistake](https://web.archive.org/web/20141230041441/http://wiki.ecmascript.org/doku.php?id=strawman:fixing_override_mistake),
which prevents lockdown from _simply_ hardening all the primordials. Rather,
for each of
[these data properties](../src/enablements.js), we convert it to an accessor
property whose getter and setter emulate [a data property without the override
mistake](https://github.com/tc39/ecma262/pull/1320). For non-reflective code
the illusion is perfect. But reflective code sees that it is an accessor
rather than a data property. We add an `originalValue` property to the getter
of that accessor, letting reflective code know that a getter alleges that it
results from this transform, and what the original data value was. This enables
a form of cooperative emulation, where that code can decide whether to uphold
the illusion by pretending it sees the data property that would have been there.

The VSCode debugger's object inspector shows the own properties of an object,
which is a great aid to debugging. Unfortunately, it also shows the inherited
accessor properties, with one line for the getter and another line for the
setter. As we enable override on more properties of widely used prototypes,
we become compatible with more legacy code, but at the price of a significantly
worse debugging experience. Expand the "Expand for..." items at the end of this
section for screenshots showing the different experiences.

Enablements have a further debugging cost. When single stepping *into* code,
we now step into every access to an enabled property. Every read steps into
the enabling getter. This adds yet more noise to the debugging experience.

The file [src/enablements.js](../src/enablements.js) exports three different
lists definining which data properties to convert to enable override by
assignment, `minEnablements`, `moderateEnablements`, and `severeEnablements`.

```js
lockdown(); // overrideTaming defaults to 'moderate'
// or
lockdown({ overrideTaming: 'moderate' }); // Legacy compat usually good enough
// vs
lockdown({ overrideTaming: 'min' }); // Minimal mitigations for purely modern code
// vs
lockdown({ overrideTaming: 'severe' }); // More severe legacy compat
```

If `lockdown` does not receive a `overrideTaming` option, it will respect
`process.env.LOCKDOWN_OVERRIDE_TAMING`.

```console
LOCKDOWN_OVERRIDE_TAMING=moderate
LOCKDOWN_OVERRIDE_TAMING=min
LOCKDOWN_OVERRIDE_TAMING=severe
```

The `overrideTaming` default `'moderate'` option of `lockdown` is intended to
be fairly minimal, but we expand it as needed, when we
encounter code which should run under SES but is prevented from doing so
by the override mistake. As we encouter these we list them in the comments
next to each enablement. This process has rapidly converged. We rarely come
across any more such cases. ***If you find one, please file an issue.*** Thanks.

The `'min'` enablements setting serves two purposes: it enables a pleasant
debugging experience in VSCode, and it helps ensure that new code does not
depend on anything more than these being enabled, which is good practice.
All code authored by Agoric will be compatible with both settings, but
Agoric currently still pulls in some third party dependencies only compatible
with the `'moderate'` setting.

The `'severe'` setting enables all the properties on at least
`Object.prototype`, which is sometimes needed for
compatibility with code generated by rollup or webpack. However, this extra
compatibility comes at the price of a miserable debugging experience.

The following screenshots shows inspection of the `{ abc: 123 }` object, both
by hover and in the rightmost "VARIABLES" pane.
Only the `abc` property is normally useful. All other lines are noise introduced
by our override mitigation.

<details>
  <summary>Expand for { overrideTaming: 'moderate' } vscode inspector display</summary>

  ![overrideTaming: 'moderate' vscode inspector display](images/override-taming-moderate-inspector.png)
</details>

<details>
  <summary>Expand for { overrideTaming: 'min' } vscode inspector display</summary>

![overrideTaming: 'min' vscode inspector display](images/override-taming-min-inspector.png)
</details>

<details>
  <summary>Expand for { overrideTaming: 'severe' } vscode inspector display</summary>

![overrideTaming: 'severe' vscode inspector display](images/override-taming-star-inspector.png)
</details>

## `overrideDebug` Options

To help diagnose problems with the [Property Override Mistake][POM], you can
set this option to a list of properties that will print diagnostic information
when their override enablement is triggered.

  [POM]: https://github.com/endojs/endo/discussions/1855

For example, to find the client code that causes a `constructor` property override
mistake, set the options as follows:

```js
{
  overrideTaming: 'severe',
  overrideDebug: ['constructor']
}
```

If `lockdown` does not receive an `overrideDebug` option, it will respect
`process.env.LOCKDOWN_OVERRIDE_DEBUG`, a comma-separated list of property names
on shared intrinsics to replace with debugger accessors.

```console
LOCKDOWN_OVERRIDE_DEBUG=constructor,toString
```

The idiom for `@agoric/install-ses` when tracking down the override
mistake with the `constructor` property is to set the following
environment variable:

```sh
LOCKDOWN_ERROR_TAMING=unsafe \
LOCKDOWN_STACK_FILTERING=verbose \
LOCKDOWN_OVERRIDE_TAMING=severe \
LOCKDOWN_OVERRIDE_DEBUG=constructor \
node ...
```

Then, when some script deep in the require stack does:

```js
function MyConstructor() { }
MyConstructor.prototype.constructor = XXX;
```

the caller backtrace will be logged to the console, such as:

```
(Error#1)
Error#1: Override property constructor

  at Object.setter (packages/ses/src/enable-property-overrides.js:114:27)
  at packages/ses/test/override-tester.js:26:19
  at overrideTester (packages/ses/test/override-tester.js:25:9)
  at packages/ses/test/test-enable-property-overrides-severe-debug.js:14:3
```

## `domainTaming` Options

The deprecated Node.js `domain` module adds `domain` properties to callbacks
and promises.
These `domain` properties allow communication between client programs that
`lockdown` otherwise isolates.

To disable this safety feature, call `lockdown` with `domainTaming` set to
`'unsafe'` explicitly.

```js
lockdown(); // domainTaming defaults to 'safe'
// or
lockdown({ domainTaming: 'safe' }); // bans the unsafe Node.js `domain` module
// vs
lockdown({ domainTaming: 'unsafe' }); // allows the unsafe `domain` module
```

The `domainTaming` option, when set to `'safe'`, protects programs
by detecting whether the `'domain'` module has been initialized, and by laying
a trap that prevents it from initializing later.

The `domain` module adds a `domain` object to the `process` global object,
so it's possible to detect without consulting the module system.
Defining a non-configurable `domain` property on the `process` object
causes any later attempt to initialize domains to fail loudly.

Unfortunately, some modules ultimately depend on the `domain` module,
even when they do not actively use its features.
To run multi-tenant applications safely, these dependencies must be carefully
fixed or avoided.

## `legacyRegeneratorRuntimeTaming` Options

`regenerator-runtime` is a widely used package in the ecosystem.
It is used to support generators and async functions transpiled to ES5.

The option `legacyRegeneratorRuntimeTaming` is to fix `regenerator-runtime`
from 0.10.5 to 0.13.7.

The `legacyRegeneratorRuntimeTaming` option, when set to `'safe'`, it does nothing.

When set to `'unsafe-ignore'`, it converts `Iterator.prototype[Symbol.iterator]` to
a getter/setter that ignores all assignments to it.

```js
lockdown(); // legacyRegeneratorRuntimeTaming defaults to 'safe'
// or
lockdown({ legacyRegeneratorRuntimeTaming: 'safe' }); // do nothing
// vs
lockdown({ legacyRegeneratorRuntimeTaming: 'unsafe-ignore' }); // try fix compatibility with regenerator-runtime
Iterator.prototype[Symbol.iterator] = function() { return this } // this assignment fails without throwing with unsafe-ignore
```

## `__hardenTaming__` Options

The `__hardenTaming__` option to `lockdown`, with values `'safe'` (the default)
in which `harden` still works, and `'unsafe'`, in which `harden` is a do-nothing
identity function.

```js
lockdown(); // __hardenTaming__ defaults to 'safe'
// or
lockdown({ __hardenTaming__: 'safe' }); // harden works
// vs
lockdown({ __hardenTaming__: 'unsafe' }); // harden is noop. Other tests pretend
```

If `lockdown` does not receive a `__hardenTaming__` option, it will respect
`process.env.LOCKDOWN_HARDEN_TAMING`.

```console
LOCKDOWN_HARDEN_TAMING=safe
LOCKDOWN_HARDEN_TAMING=unsafe
```

We created this option specifically for
speed of the SwingSet kernel. It could also be used for other highly vetted, style
restricted, security-critical, and speed-critical code. This would be safe to turn
on in the SwingSet kernel or other such specialized code once we're confident that
they are free of the kinds of bugs that a working `harden` would have protected
them from.

There are various tests for whether something is frozen, sealed, non-extensible,
non-configurable, non-writable, that could all be broken by this fake `harden`.
However, in all cases in our non-test, non-demo code that we are aware of so far,
for each such branch, one side of the branch reports an error and only the other
side is the happy path. Once we're confident we have no bugs that `harden` would
have caught, then we need only ensure we go down the happy paths for such tests.

`Object.isFrozen`, `Object.isSealed`, `Object.isExtensible`, and
`Reflect.isExtensible` are patched to claim that everything is frozen, since that is
typically the happy path. But not always. For those rare occasions where not being
frozen is the happy path, we have added a `harden.isFake = true` property. When
this unsafe option is not turned on, there is no `isFake` property, so
`harden.isFake` is falsy. This lets code test `harden.isFake` to ensure it still
goes down the happy path.

We do not patch any of the builtins for reflecting on property
attributes, such as `Object.getOwnPropertyDescriptor`. When this creates a
problem, please use `harden.isFake` to adapt.

The "`__`" in the option name indicates that this option is temporary. XS now
has a fast native `harden`, but SwingSet currently runs on node/v8, which does
not. If node/v8 ever implements a fast native `harden`, we hope to deprecate
and eventually remove this option.
