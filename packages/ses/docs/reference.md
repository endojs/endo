# Endo and Hardened JavaScript (SES) Programming Reference

This document describes how Hardened JavaScript (formerly SES) affects writing
Agoric JavaScript code.
It is very much a "how to do something" document, with little explanation about why and
how something was implemented or other background information. For that, see the more
comprehensive [Endo and Hardened JavaScript Programming Guide](./guide.md).

## Using SES with your code

The SES shim transforms ordinary JavaScript environments into Hardened JavaScript environments.

On Node.js you can import or require `ses` in either CommonJS or ECMAScript modules, then call `lockdown()`. This is a *shim*. It mutates the environment in place so any code running after the shim can assume it’s running in a Hardened JavaScript environment. This includes the globals `lockdown()`, `harden()`, `Compartment`, and so on. For example:

```js
require("ses");
lockdown();
```

Or:

```js
import 'ses';
lockdown();
```

To ensure a module runs in a Hardened JavaScript environment, wrap the above code in a `ses-lockdown.js` module and import it:

```js
import './non-ses-code-before-lockdown.js';
import './ses-lockdown.js'; // calls lockdown.
import './ses-code-after-lockdown.js';
```

To use SES as a script on the web, use the UMD build.

```js
<script src="node_modules/ses/dist/ses.umd.min.js">
```

To run shims after `ses` repairs the intrinsics but before `ses` hardens the
intrinsics, calling `lockdown(options)` is equivalent to running
`repairIntrinsics(options)` then `hardenIntrinsics()` and vetted shims can run
in between.

```js
import './non-ses-code-before-lockdown.js';
import './ses-repair-intrinsics.js'; // calls repairIntrinsics.
import './vetted-shim.js';
import './ses-harden-intrinsics.js'; // calls hardenIntrinsics.
import './ses-code-after-lockdown.js';
```

SES is vulnerable to any code that runs before hardening intrinsics.
All such code, including vetted shims, must receive careful review to ensure it
preserves the invariants of the OCap security model.

## Removed by Hardened JavaScript summary

The following are missing or unusable under Hardened JavaScript:
- Most [Node.js-specific global objects](https://nodejs.org/dist/latest-v14.x/docs/api/globals.html)
- All [Node.js built-in modules](https://nodejs.org/dist/latest-v14.x/docs/api/) such as `http` and
  `crypto`.
- [Features from browser environments](https://developer.mozilla.org/en-US/docs/Web/API) presented as names in the global scope including `atob`, `TextEncoder`, and `URL`.
- HTML comments
- Dynamic `import` expressions
- Direct evals

## Added/Changed by Hardened JavaScript summary

Hardened JavaScript adds the following to JavaScript or changes them significantly:
- `lockdown()`
- `harden()`
- `Compartment`
- `console`
- `assert`
- Shared JavaScript primordials are frozen.

## `lockdown()`

`lockdown()` tamper-proofs all of the JavaScript intrinsics, so no program can subvert their methods
(preventing some man in the middle attacks). Also, no program can use them to pass notes to parties
that haven't been expressly introduced (preventing some covert communication channels).

Lockdown *freezes* all JavaScript defined objects accessible to any program in the realm. The frozen
accessible objects include but are not limited to:
- `globalThis`
- `[].__proto__` the array prototype, equivalent to `Array.prototype` in a pristine JavaScript environment.
- `{}.__proto__` the `Object.prototype`
- `(() => {}).__proto__` the `Function.prototype`
- `(async () => {}).__proto__` the prototype of all asynchronous functions, and has no alias
   in the global scope of a pristine JavaScript environment.
- The properties of any accessible object

`lockdown()` also *tames* some objects, such as:
- Regular expressions
  - A tamed RexExp does not have the deprecated compile method.
- Locale methods
  - Lockdown replaces locale methods like `String.prototype.localeCompare()` with lexical
    versions that do not reveal the user locale.
- Errors
  - A tamed error does not have a V8 stack, but the console can still see the stack.

Lockdown does not erase any powerful objects from the initial global scope. Instead,
Compartments give complete control over what powerful objects exist for client code.

## `lockdown()` and `harden()`

`lockdown()` and `harden()` essentially do the same thing; freeze objects so their
properties cannot be changed. You can only interact with frozen objects through
their methods. Their differences are what objects you use them on, and when you use them.

`lockdown()` **must** be called first. It hardens JavaScript's built-in *primordials*
(implicitly shared global objects) and enables `harden()`. Calling `harden()`
before `lockdown()` executes throws an error.

`lockdown()` works on objects created by the JavaScript language itself as part of
its definition. Use `harden()` to freeze objects created by your JavaScript code
after `lockdown()`was called.

## `lockdown` Options

### Default `'safe'` settings

All four of these safety-relevant options default to `'safe'` if omitted
from a call to `lockdown()`. Their other possible value is `'unsafe'`.
- `regExpTaming`
- `localeTaming`
- `consoleTaming`
- `errorTaming`

The tradeoff is safety vs compatibility with existing code. However, much legacy
JavaScript code does run under Hardened JavaScript, even if both not written to
do so and with all the options set to `'safe'`. Only consider an `'unsafe'`
value if you both need it and can evaluate its risks.

### Options quick reference

This section provides a quick usage reference for `lockdown()`'s options, their possible
values, and their usage. Each is described in more detail in their individual sections
below.

<table>
  <tbody>
  <tr>
    <td><center><b>Option</b></center></td>
    <td><center><b>Values</b></center></td>
    <td><center><b>Functionality</b></center></td>
  </tr>
  <tr>
    <td><code>regExpTaming</code></td>
    <td><code>'safe'</code> (default) or <code>'unsafe'</code></td>
    <td><code>'safe'</code> disables all <code>RegExp.*</code> methods,<br>
        <code>'unsafe'</code> disables all but <code>RegExp.prototype.compile()</code></td>
  </tr>
    <tr>
    <td><code>localeTaming</code></td>
    <td><code>'safe'</code> (default) or <code>'unsafe'</code></td>
    <td><code>'safe'</code> aliases <code>toLocaleString()</code> to <code>toString()</code>, etc.,<br>
        <code>'unsafe'</code> keeps JavaScript locale methods as is</td>
  </tr>
  <tr>
    <td><code>consoleTaming</code></td>
    <td><code>'safe'</code> (default) or <code>'unsafe'</code></td>
    <td><code>'safe'</code> wraps start console to show deep stacks,<br>
        <code>'unsafe'</code> uses the original start console.</td>
  </tr>
  <tr>
    <td><code>errorTaming</code></td>
    <td><code>'safe'</code> (default) or <code>'unsafe'</code></td>
    <td><code>'safe'</code> denies unprivileged stacks access,<br>
        <code>'unsafe'</code> makes stacks also available by <code>errorInstance.stackkeeps()</code>.</td>
  </tr>
  <tr>
    <td><code>stackFiltering</code></td>
    <td><code>'concise'</code> (default) or <code>'verbose'</code></td>
    <td><code>'concise'</code> preserves important deep stack info,<br>
        <code>'verbose'</code> console shows full deep stacks</td>
  </tr>
  <tr>
    <td><code>overrideTaming</code></td>
    <td><code>'moderate'</code> (default) or <code>'min'</code></td>
    <td><code>'moderate'</code> moderates mitigations for legacy compatibility,<br>
        <code>'min'</code> minimal mitigations for purely modern code</td>
  </tr>
  </tbody>
</table>

### `regExpTaming` Option

With its default `'safe'` value, regExpTaming prevents using `RegExp.*()` methods in the locked down code.

With its `'unsafe'` value, `RegExp.prototype.compile()` can be used in locked down code.
All other `RegExp.*()` methods are disabled.

```js
lockdown(); // regExpTaming defaults to 'safe'
// or
lockdown({ regExpTaming: 'safe' }); // Disables all RegExp.*() methods.
// vs
lockdown({ regExpTaming: 'unsafe' }); // Disables all RegExp.*() methods except RegExp.prototype.compile()
```

### `localeTaming` Option

The default `'safe'` setting replaces each method listed below with their
corresponding non-locale-specific method. For example, `Object.prototype.toLocaleString()`
becomes another name for `Object.prototype.toString()`.
- `toLocaleString`
- `toLocaleDateString`
- `toLocaleTimeString`
- `toLocaleLowerCase`
- `toLocaleUpperCase`
- `localeCompare`

The `'unsafe'` setting keeps the original behavior for compatibility at the price
of reproducibility and fingerprinting.

```js
lockdown(); // localeTaming defaults to 'safe'
// or
lockdown({ localeTaming: 'safe' }); // Alias toLocaleString to toString, etc
// vs
lockdown({ localeTaming: 'unsafe' }); // Allow locale-specific behavior
```

### `consoleTaming` Options

The default `'safe'` option actually expands what you would expect from `console`'s logging
output. It will show information from the `assert` package and error objects.
Errors can report more diagnostic information that should be hidden from other objects. See
the [error README](../src/error/README.md)
for an in depth explanation of this.

The `'unsafe'` setting leaves the original `console` in place. The `assert` package
and error objects continue to work, but the `console` logging output will not
show this extra information. `'unsafe'` does **not** remove any additional `console`
methods beyond its de facto "standards". Since we do not know if these
methods violate OCap security, we should assume they are unsafe. A raw `console`
object should only be handled by very trustworthy code.

```js
lockdown(); // consoleTaming defaults to 'safe'
// or
lockdown({ consoleTaming: 'safe' }); // Wrap start console to show deep stacks
// vs
lockdown({ consoleTaming: 'unsafe' }); // Leave original start console in place
```

### `errorTaming` Options

The `errorTaming` default `'safe'` setting makes the stack trace inaccessible
from error instances alone. It does this on v8 engines (Chrome, Brave, Node).
Note that it is **not** hidden on other engines, leaving an information
leak available. It reveals information only as a powerless string.

In JavaScript the stack is only available via `err.stack`, so some
development tools assume it is there. When the information leak is tolerable,
the `'unsafe'` setting preserves `err.stack`'s filtered stack information.

`errorTaming` does not affect the `Error` constructor's safety.
After calling `lockdown`, the tamed `Error` constructor in the
start compartment follows OCap rules. Under v8 it emulates most of the
magic powers of the v8 `Error` constructor&mdash;those consistent with the
discourse level of the proposed `getStack`. In all cases, the `Error`
constructor shared by all other compartments is both safe and powerless.
```js
lockdown(); // errorTaming defaults to 'safe'
// or
lockdown({ errorTaming: 'safe' }); // Deny unprivileged access to stacks, if possible
// vs
lockdown({ errorTaming: 'unsafe' }); // Stacks also available by errorInstance.stack
```

### `stackFiltering` Options

`stackFiltering` trades off stronger stack traceback filtering to
minimize distractions vs completeness for tracking down bugs in
obscure places.

The default `'concise'` setting removes "noise" from the full distributed
stack traces, in particularly artifacts from low level infrastructure. It
only works on v8 engines.

With the `'verbose'` setting, the `console` displays the full raw stack
information for each level of the "deep stack", tracing back through the
[eventually sent messages](https://github.com/tc39/proposal-eventual-send)
from other turns of the event loop. This makes JavaScript's already voluminous
error stacks even more so. However, this is sometimes useful for finding bugs
in low level infrastructure.

Both settings are safe. Stack information will
or will not be available from error objects according to the `errorTaming`
option and the platform error behavior.

```js
lockdown(); // stackFiltering defaults to 'concise'
// or
lockdown({ stackFiltering: 'concise' }); // Preserve important deep stack info
// vs
lockdown({ stackFiltering: 'verbose' }); // Console shows full deep stacks
```

### `overrideTaming` Options

The `overrideTaming` option trades off better code
compatibility vs better tool compatibility.

When starting a project, we recommend using the non-default `'min'` option to make
debugging more pleasant. You may need to reset it to the `'moderate'` default if
third-party shimming code interferes with `lockdown()`.

`'moderate'` option is intended to be fairly minimal. Expand it when you
encounter code which should run under Hardened JavaScript but can't due to
the [override mistake](https://web.archive.org/web/20141230041441/http://wiki.ecmascript.org/doku.php?id=strawman:fixing_override_mistake),

The `'min'` setting serves two purposes:
- It enables a pleasant VSCode debugging experience.
- It helps ensure new code does not depend on anything more than enabled legacy code.

All Agoric-authored code is compatible with both settings, but
Agoric currently still pulls in some third party dependencies only compatible
with the `'moderate'` setting.

 ```js
lockdown(); // overrideTaming defaults to 'moderate'
// or
lockdown({ overrideTaming: 'moderate' }); // Moderate mitigations for legacy compat
// vs
lockdown({ overrideTaming: 'min' }); // Minimal mitigations for purely modern code
```

