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

| option           | default setting  | other settings | about |
|------------------|------------------|----------------|-------|
| `regExpTaming`   | `'safe'`         | `'unsafe'`     | `RegExp.prototype.compile` |
| `localeTaming`   | `'safe'`         | `'unsafe'`     | `toLocaleString`           |
| `consoleTaming`  | `'safe'`         | `'unsafe'`     | deep stacks                |
| `errorTaming`    | `'safe'`         | `'unsafe'`     | `errorInstance.stack`      |
| `stackFiltering` | `'concise'`      | `'verbose'`    | deep stacks signal/noise   |
| `overrideTaming` | `'moderate'` :warning: | `'min'`  | override mistake antidote  |

:warning: The default setting of `overrideTaming` will switch to `'min'` in
an upcoming release. Beware that this is a potentially breaking change.

## `regExpTaming` Options

Background: In standard plain JavaScript, the builtin
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
lockdown({ regExpTaming: 'safe' }); // delete RegExp.prototype.compile
// vs
lockdown({ regExpTaming: 'unsafe' }); // preserve RegExp.prototype.compile
```


The `regExpTaming` default `'safe'` setting deletes this dangerous property. The
`'unafe'` setting preserves it for maximal compatibility at the price of some
risk.

In de facto plain JavaScript, the legacy RegExp static methods like
`RegExp.lastMatch` are an unsafe global communications channel.
They reveal on the RegExp constructor information derived from the last match
made by any RegExp instance. These static methods are currently part of de facto
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
`'unsafe' setting and *only* on the `RegExp`  constructor of the start
compartment. The `RegExp` constructor shared by other compartments will remain
safe and powerless.

## `localeTaming` Options

Background: In standard plain JavaScript, the builtin methods with
 `Locale` or `locale` in their name---`toLocaleString`,
`toLocaleDateString`, `toLocaleTimeString`, `toLocaleLowerCase`,
`toLocaleUpperCase`, and `localeCompare`---have a global behavior that is not
fully determined by the language spec, but rather varies with location and
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

The `localeTaming` default `'safe'` option replaces each of these methods with
the corresponding non-locale-specific method. `Object.prototype.toLocaleString`
becomes just another name for `Object.prototype.toString`. The `'unsafe'`
setting preserves the original behavior for maximal compatibility at the price
of some usually-negligible risk.

## `consoleTaming` Options

```js
lockdown(); // consoleTaming defaults to 'safe'
// or
lockdown({ consoleTaming: 'safe' }); // Wrap start console to show deep stacks
// vs
lockdown({ consoleTaming: 'unsafe' }); // Leave start console in place
```

## `errorTaming` Options

The `errorTaming` option to `lockdown` currently has three settings:
`'safe'`, `'unfiltered'`, and `'unsafe'`. If the option is omitted, it
defaults to `'safe'`. These options do not affect the safety of the `Error`
constructor. In all cases, the tamed `Error` constructor in the start
compartment follows ocap rules, but under v8 it emulates most of the
magic powers of the v8 `Error` constructor. In all cases, the `Error`
constructor shared by all other compartments is both safe and powerless.
The `errorTaming` options effect only the reporting of stack traces.
The `'unfiltered'` option is currently meaningful only on v8. On all
other engines, it acts the same as `'safe'`.

In most JavaScript engines running normal JavaScript, if `err` is an
Error instance, the expression `err.stack` will produce a string
revealing the stack trace. This is an overt information leak, a
confidentiality violation.
This `stack` property reveals information about the call stack that violates
the encapsulation of the callers.

This `stack` is part of de facto JavaScript, is not yet part
of the official standard, and is proposed at
[Error Stacks proposal](https://github.com/tc39/proposal-error-stacks).
Because it is unsafe, we propose that the `stack` property be "normative
optional", meaning that a conforming implementation may omit it. Further,
if present, it should be present only as a deletable accessor property
inherited from `Error.prototype` so that it can be deleted. However, the actual
stack information would be available by other means, so the SES console
can still operate as described above.

```js
lockdown(); // errorTaming defaults to 'safe'
// or
lockdown({ errorTaming: 'safe' }); // Deny unprivileged access to stacks, if possible
// vs
lockdown({ errorTaming: 'unsafe' }); // stacks also available by errorInstance.stack
```

The default `'safe'` setting makes the stack trace inaccessible from error
instances alone, when possible.
It currently does this only on v8. It will also do so on
Firefox. Currently is it not possible for the SES-shim to hide it on other
engines, leaving this information leak available. Note that it is only an
information leak. It reveals the magic information only as a powerless
string. This leak does not threaten integrity.

Since the current JavaScript de facto reality is that the stack is only
available by saying `err.stack`, a number of development tools assume they
can find it there. When the information leak is tolerable, the `'unsafe'`
setting will provide the filtered stack information on the `err.stack`.

:warning: This design will be revised to be more othogonal. Safety vs
filtering should be independently controllable. The options above cannot
express unsafe-unfiltered. Also, the filtering rules should not wire in
a particular ad hoc choice tuned to be useful for what we expect to be
typical usage of SES and Endo.

## `stackFiltering` Options

```js
lockdown(); // stackFiltering defaults to 'concise'
// or
lockdown({ stackFiltering: 'concise' }); // Preserve important deep stack info
// vs
lockdown({ stackFiltering: 'verbose' }); // Console shows full deep stacks
```

When looking at deep distributed stacks, in order to debug distributed
computation, seeing the full stacks is overwhelmingly noisy. The error stack
proposal leaves it to the host what stack trace info to show. SES virtualizes
elements of the host. With this freedom in mind, when possible, the SES-shim
filters and transforms the stack trace information it shows to be more useful,
by removing information that is more an artifact of low level infrastructure.
The SES-shim currently does so only on v8.

However, sometimes your bug might be in that infrastrusture, in which case
that information is no longer an extraneous distraction. The `'unfiltered'`
setting shows, on the console, the full raw stack information provided by v8.
This setting is still safe in the sense of the `'safe'` setting. It will
hide the information from the error instance when possible.

## `overrideTaming` Options

JavaScript suffers from the so-called
[override mistake](https://web.archive.org/web/20141230041441/http://wiki.ecmascript.org/doku.php?id=strawman:fixing_override_mistake),
which prevents lockdown from _simply_ hardening all the primordials. Rather,
for each of
[these data properties](src/enablements.js), we convert it to an accessor
property whose getter and setter emulate [a data property without the override
mistake](https://github.com/tc39/ecma262/pull/1320). For non-reflective code
the illusion is perfect. But reflective code sees that it is an accessor
rather than a data property. We add a `originalValue` property to the getter
of that accessor, letting reflective code know that a getter alleges that it
results from this transform, and what the original data value was. This enables
a form of cooperative emulation, where that code can decide whether to uphold
the illusion by pretending it sees the data property that would have been there.

The file [src/enablements.js](src/enablements.js) exports two different
whitelists definining which data properties to convert to enable override by
assignment, `moderateEnablements` and `minEnablements`.

```js
lockdown(); // overrideTaming will change from default 'moderate' to default 'min'

lockdown({ overrideTaming: 'min' }); // Minimal mitigations for modern code
// vs
lockdown({ overrideTaming: 'moderate' }); // Moderate mitigations for legacy
```

To select the moderate enablements, set the optional `overrideTaming` option to
`lockdown` to the string `'moderate'`.
This is intended to be fairly minimal, but we expand it as needed, when we
encounter code which should run under SES but is prevented from doing so
by the override mistake. As we encouter these we list them in the comments
next to each enablement. This process has rapidly converged. We rarely come
across any more such cases. If you find one, please file an issue. Thanks.

Unfortunately, the VSCode debugger's object inspector, when showing the
properties of an object,
show the own properties _plus any inherited accessor properties_.
Even the moderate taming creates so many accessors on widely shared prototypes
as to make the object inspector useless. To create a pleasant debugging
experience where possible, use the `'min'` enablements instead.

The `'min'` enablements setting serves two purposes: it enables a pleasant
debugging experience in VSCode, and it helps ensure that new code does not
depend on anything more than these being enabled, which is good practice.
All code from Agoric will be compatible with both settings.

:warning: Compatibility notice: Currently if the `overrideTaming` option is
omitted, it defaults to `moderate`, ensuring compatibility with the code
written before we introduced this option.
We are likely to make two changes which will cause
fewer enablements, which may break some old code. We will of course bump the
version number appropriately to indicate this.

- We are likely to change the default from `'moderate'` to `'min'`. Code
  that depends on the moderate taming can prepare by stating their
  dependency explicitly using the `overrideTaming` option.
- Currently the moderate taming enables all own data properties of
  `Object.prototype`, `Array.prototype` and more.
  This is way more than necessary,
  resulting in the VSCode debugging debacle. Instead, we are likely to
  explicitly enumerate all the properties to enable, and to enumerate far
  fewer. Again, as we encounter cases, we'll expand to accomodate, and
  expect to again rapidly coverge.
