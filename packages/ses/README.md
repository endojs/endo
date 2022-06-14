# SES

SES is *hardened JavaScript*. SES stands for *fearless cooperation*.
This package is a SES [shim][define shim] for JavaScript features
[proposed][SES proposal] to ECMA TC-39.
Hardened JavaScript is highly compatible with ordinary JavaScript.
Most existing JavaScript libraries can run on hardened JavaScript.

* **Compartments** Compartments are separate execution contexts: each one has
  its own global object and global lexical scope.
* **Frozen realm** Compartments share their intrinsics to avoid identity
  discontinuity. By freezing the intrinsics, SES protects programs from each
  other. By sharing the intrinsics, programs from separate compartments
  can recognize each other's arrays, data objects, and so on.
* **Strict mode** SES enforces JavaScript strict mode that enhances security,
  for example by changing some silent failures into thrown errors.
* **POLA** (Principle of Least Authority) By default, Compartments receive no
  ambient authority. They are created without host-provided APIs, (for example
  no `fetch`). Compartments can be selectively endowed with powerful arguments,
  globals, or modules.

SES safely executes third-party JavaScript 'strict' mode programs in
compartments that have no excess authority in their global scope.
SES runs atop an ES6-compliant platform, enabling safe interaction of
mutually-suspicious code, using object-capability -style programming.

See https://github.com/Agoric/Jessie to see how SES fits into the various
flavors of confined JavaScript execution. And visit
https://ses-demo.agoric.app/demos/ for a demo.

SES starts where the Caja project left off
https://github.com/google/caja/wiki/SES, and goes on to introduce compartments
and modernize the permitted JavaScript features.

## Install

```sh
npm install ses
```

## Usage

The SES shim runs in most engines, either as an ESM module `ses` or as a
`<script>` tag.
For a script tag, the content encoding charset must be UTF-8, either by virtue
of `<head><meta charset="utf-8"></head>` (a general best practice for all HTML
files) or specifically `<script src="node_modules/ses/dist/ses.umd.min.js"
charset="utf-8">`.

SES can be bundled by Webpack, Browseriy, Rollup, and Parcel, but any of these
tools could be coopted with a supply-chain attack to invalidate the security
properties of SES.  We generally recommend installing SES as a separate script
tag.

### Lockdown

SES introduces the `lockdown()` function.
Calling `lockdown()` alters the surrounding execution environment, or
**realm**, such that no two programs running in the same realm can observe or
interfere with each other until they have been introduced.

To do this, `lockdown()` tamper-proofs all of the JavaScript intrinsics, to
prevent **prototype pollution**.
After that, no program can subvert the methods of these objects (preventing
some **man in the middle attacks**).
Also, no program can use these mutable objects to pass notes to parties that
haven't been expressly introduced (preventing some **covert communication
channels**).

Lockdown freezes all objects accessible to any program in the realm.
The set of accessible objects includes but is not limited to: `globalThis`,
`[].__proto__`, `{}.__proto__`, `(() => {}).__proto__` `(async () =>
{}).__proto__`, and the properties of any accessible object.

The `lockdown()` function also **tames** some objects including regular
expressions, locale methods, and errors.
A tamed `RegExp` does not have the deprecated `compile` method.
A tamed error does not have a V8 `stack`, but the `console` can still see the
stack.
Lockdown replaces locale methods like `String.prototype.localeCompare` with
lexical versions that do not reveal the user locale.

```js
import 'ses';

lockdown();

console.log(Object.isFrozen([].__proto__));
// true
```

Lockdown does not erase any powerful objects from the initial global scope.
Instead, **Compartments** give complete control over what powerful objects
exist for client code.

See [`lockdown` options](docs/lockdown.md) for configuration options to
`lockdown`. However, all of these have sensible defaults that should
work for most projects out of the box.

### Harden

SES introduces the `harden` function.
*After* calling `lockdown`, the `harden` function ensures that every object in
the transitive closure over property and prototype access starting with that
object has been **frozen** by `Object.freeze`.
This means that the object can be passed among programs and none of those
programs will be able to tamper with the **surface** of that object graph.
They can only read the surface data and call the surface functions.

```js
import 'ses';

lockdown();

let counter = 0;
const capability = harden({
  inc() {
    counter++;
  },
});

console.log(Object.isFrozen(capability));
// true
console.log(Object.isFrozen(capability.inc));
// true
```

Note that although the **surface** of the capability is frozen, the capability
still closes over the mutable counter.
Hardening an object graph makes the surface immutable, but does not make
methods pure.


### Compartment

SES introduces the `Compartment` constructor.
A compartment is an evaluation and execution environment with its own
`globalThis` and wholly independent system of modules, but otherwise shares
the same batch of intrinsics like `Array` with the surrounding compartment.
The concept of a compartment implies an **initial compartment**, the initial
execution environment of a **realm**.

In the following example, we create a compartment endowed with a `print()`
function on `globalThis`.

```js
import 'ses';

const c = new Compartment({
  print: harden(console.log),
});

c.evaluate(`
  print('Hello! Hello?');
`);
```

The new compartment has a different global object than the start compartment.
The global object is initially mutable.
Locking down the realm hardened the objects in global scope.
After `lockdown`, no compartment can tamper with these **intrinsics** and
**undeniable** objects.
Many of these are identical in the new compartment.

```js
const c = new Compartment();
c.globalThis === globalThis; // false
c.globalThis.JSON === JSON; // true
```

Other pairs of compartments also share many identical intrinsics and undeniable
objects of the realm.
Each has a unique, initially mutable, global object.

```js
const c1 = new Compartment();
const c2 = new Compartment();
c1.globalThis === c2.globalThis; // false
c1.globalThis.JSON === c2.globalThis.JSON; // true
```

The global scope of every compartment includes a shallow, specialized copy of
the JavaScript intrinsics, omitting `Date.now` and `Math.random`.
Comaprtments leave these out since they can be used as covert communication
channels between programs.
However, a compartment may be expressly given access to these objects
through:

* the first argument to the compartment constructor or
* by assigning them to the compartment's `globalThis` after construction.

```js
const powerfulCompartment = new Compartment({ Math });
powerfulCompartment.globalThis.Date = Date;
```

### Compartment + Lockdown

Together, Compartment and lockdown isolate client code in an environment with
limited powers and communication channels.
A compartment has only the capabilities it is expressly given and cannot modify
any of the shared intrinsics.
Every compartment gets its own globals, including such objects as the
`Function` constructor.
Yet, compartment and lockdown do not break `instanceof` for any of these
intrinsics types!

All of the evaluators in one compartment are captured by that compartment's
global scope, including `Function`, indirect `eval`, dynamic `import`, and its
own `Compartment` constructor for child compartments.
For example, the `Function` constructor in one compartment creates functions
that evaluate in the global scope of that compartment.

```js
const c1 = new Compartment();
const f1 = new c.globalThis.Function('return globalThis');
f1() === c1.globalThis; // true

const c2 = new Compartment();
const f2 = new c.globalThis.Function('return globalThis');
f2() === c2.globalThis; // true

f1() === f2(); // false
```

Lockdown prepares for compartments with separate globals by freezing
their shared prototypes and replacing their prototype constructors
with powerless dummies.
So, `Function` is different in two compartments, `Function.prototype` is the
same, and `Function` is not the same as `Function.prototype.constructor`.
The `Function.prototype.constructor` can only throw exceptions.
So, a function passed between compartments does not carry access to
its compartment's globals along with it.
Yet, `f instanceof Function` works, even when `f` and `Function` are
from different compartments.

The `globalThis` in each compartment is mutable.
This can and should be frozen before running any dynamic code in that
compartment, yet is not strictly necessary if the compartment only
runs code from a single party.


### Modules

Any code executed within a compartment shares a set of module instances.
For modules to work within a compartment, the creator must provide
a `resolveHook` and an `importHook`.
The `resolveHook` determines how the compartment will infer the full module
specifier for another module from a referrer module and the import specifier.
The `importHook` accepts a full specifier and asynchronously returns a
`StaticModuleRecord` for that module.

```js
import 'ses';
import { StaticModuleRecord } from '@endo/static-module-record';

const c1 = new Compartment({}, {}, {
  name: "first compartment",
  resolveHook: (moduleSpecifier, moduleReferrer) => {
    return resolve(moduleSpecifier, moduleReferrer);
  },
  importHook: async moduleSpecifier => {
    const moduleLocation = locate(moduleSpecifier);
    const moduleText = await retrieve(moduleLocation);
    return new StaticModuleRecord(moduleText, moduleLocation);
  },
});
```

> The SES language specifies a global `StaticModuleRecord`, but this is not
> provided by the shim because it entrains a full JavaScript parser that is an
> unnecessary performance penalty for the SES runtime.
> Instead, the SES shim accepts a compiled static module record duck-type that
> is tightly coupled to the shim implementation.
> Third party modules can provide suitable implementations and even move the
> compile step to build time instead of runtime.

A compartment can also link a module in another compartment.
Each compartment has a `module` function that accepts a module specifier
and returns the module exports namespace for that module.
The module exports namespace is not useful for inspecting the exports of the
module until that module has been imported, but it can be passed into the
module map of another Compartment, creating a link.

```js
const c2 = new Compartment({}, {
  'c1': c1.module('./main.js'),
}, {
  name: "second compartment",
  resolveHook,
  importHook,
});
```

### importHook aliases

If a compartment imports a module specified as `"./utility"` but actually
implemented by an alias like `"./utility/index.js"`, the `importHook` may
follow redirects, symbolic links, or search for candidates using its own logic
and return a module that has a different "response specifier" than the original
"request specifier".
The `importHook` may return an "alias" object with `record`, `compartment`,
and `module` properties.

- `record` must be a static module record, either a third-party module record
  or a compiled static module record.
- `compartment` is optional, to be specified if the alias transits to a
  different compartment, and
- `specifier` is the full module specifier of the module in its compartment.
  This defaults to the request specifier, which is only useful if the
  compartment is different.

In the following example, the importHook searches for a file and returns an
alias.

```js
const importHook = async specifier => {
  const candidates = [specifier, `${specifier}.js`, `${specifier}/index.js`];
  for (const candidate of candidates) {
    const record = await wrappedImportHook(candidate).catch(_ => undefined);
    if (record !== undefined) {
      return { record, specifier };
    }
  }
  throw new Error(`Cannot find module ${specifier}`);
};

const compartment = new Compartment({}, {}, {
  resolveHook,
  importHook,
});
```

### moduleMapHook

The module map above allows modules to be introduced to a compartment up-front.
Some modules cannot be known that early.
For example, in Node.js, a package might have a dependency that brings in an
entire subtree of modules.
Also, a pair of compartments with cyclic dependencies between modules they each
contain cannot use `compartment.module` to link the second compartment
constructed to the first.
For these cases, the `Compartment` constructor accepts a `moduleMapHook` option
that is like the dynamic version of the static `moduleMap` argument.
This is a function that accepts a module specifier and returns the module
namespace for that module specifier, or `undefined`.
If the `moduleMapHook` returns `undefined`, the compartment proceeds to the
`importHook` to attempt to asynchronously obtain the module's source.

```js
const moduleMapHook = moduleSpecifier => {
  if (moduleSpecifier === 'even') {
    return even.module('./index.js');
  } else if (moduleSpecifier === 'odd') {
    return odd.module('./index.js');
  }
};

const even = new Compartment({}, {}, {
  resolveHook: nodeResolveHook,
  importHook: makeImportHook('https://example.com/even'),
  moduleMapHook,
});

const odd = new Compartment({}, {}, {
  resolveHook: nodeResolveHook,
  importHook: makeImportHook('https://example.com/odd'),
  moduleMapHook,
});
```

### Third-party modules

To incorporate modules not implemented as JavaScript modules, third-parties may
implement a `StaticModuleRecord` interface.
The record must have an `imports` array and an `execute` method.
The compartment will call `execute` with:

1. the proxied `exports` namespace object,
2. a `resolvedImports` object that maps import names (from `imports`) to their
   corresponding resolved specifiers (through the compartment's `resolveHook`),
   and
3. the `compartment`, such that `importNow` can obtain any of the module's
   specified `imports`.

:warning: A future breaking version may allow the `importNow` and the `execute`
method of third-party static module records to return promises, to support
top-level await.

### Compiled modules

Instead of the `StaticModuleRecord` constructor specified for the SES language,
the SES shim uses compiled static module records as a stand-in.
These can be created with a `StaticModuleRecord` constructor from a package
like `@endo/static-module-record`.
We omitted `StaticModuleRecord` from the SES shim because it entrains a heavy
dependency on a JavaScript parser.
The shim depends upon a `StaticModuleRecord` constructor to analyze and
transform the source of a JavaScript module (known as an ESM or a `.mjs` file)
into a JavaScript program suitable for evaluation with `compartment.evaluate`
using a particular calling convention to initialize a module instance.

A compiled static module record has the following shape:

- `imports` is a record that maps partial module specifiers to a list of
  names imported from the corresponding module.
- `exports` is an array of all the names that the module will export.
- `reexports` is an array of partial module specifier for which this
  module exports all imported names.
  This field is optional.
- `__syncModuleProgram__` is a string that evaluates to a function that accepts
  an initialization record and initializes the module.
  This property distinguishes this type of module record.
  The name implies a future record type that supports top-level await.
  - An initialization record has the properties `imports`, `liveVar`, `importMeta` and
    `onceVar`.
    - `imports` is a function that accepts a map from partial import
      module specifiers to maps from names that the corresponding module
      exports to notifier functions.
      A notifier function accepts an update function and registers
      to receive updates for the value exported by the other module.
    - `importMeta` is a null-prototype object with keys transferred from `importMeta`
      property in the envelope returned by importHook and/or mutated by
      calling `importMetaHook(moduleSpecifier, importMeta)`
    - `liveVar` is a record that maps names exported by this module
      to a function that may be called to initialize or update
      the corresponding value in another module.
    - `onceVar` is a record that maps constants exported by this
      module to a function that may be called to initialize the
      corresponding value in another module.
- `__liveExportsMap__` is a record that maps import names or names in the lexical
  scope of the module to export names, for variables that may change after
  initialization. Any reexported name is assumed to possibly change.
  The exported name is wrapped in a duple array like `["exportedName", true]`.
  The second value, a boolean, indicates that the variable has a temporal
  dead-zone (a time between creation and initialization) when access to that
  name should throw a `ReferenceError`.
- `__fixedExportsMap__` is a record that maps import names to export names
  for constants exported by this module.
  The fixed exports map is an aesthetic subtype of the live exports map,
  so the value is wrapped in a simple array like `["exportedName"]`

### Transforms

The `Compartment` constructor accepts a `transforms` option.
This is an array of JavaScript source to source translation functions,
in the order they should be applied.
Passing the source to the first function's input, then from each function's
output to the next's input, the final function's output must be a valid
JavaScript "Program" grammar construction, code that is valid in a `<script>`,
not a module.

```js
const transforms = [addCodeCoverageInstrumentation];
const globalLexicals = { coverage };
const c = new Compartment({ console }, null, { transforms, globalLexicals });
c.evaluate('console.log("Hello");');
```

The `evaluate` method of a compartment also accepts a `transforms` option.
These apply before and in addition to the compartment-scoped transforms.

```js
const transform = source => source.replace(/Farewell/g, 'Hello');
const transforms = [transform];
c.evaluate('console.log("Farewell, World!")', { transforms });
// Hello, World!
```

These transforms do not apply to modules.
To transform the source of a JavaScript module, the `importHook` must
intercept the source and transform it before passing it to the
`StaticModuleRecord` constructor.
These are distinct because programs and modules have distinct grammar
productions.

An **internal implementation detail** of the SES-shim is that it
converts modules to programs and evaluates them as programs.
So, only for this implementation of `Compartment`, it is possible for a program
transform to be equally applicable for modules, but that transform will
have a window into the internal translation, will be sensitive to changes to
that translation between any pair of releases, even those that do not disclose
any breaking changes, and will only work on SES-shim, not any other
implementation of `Compartment` like the one provided by XS.

The SES-shim `Compartment` constructor accepts a `__shimTransforms__`
option for this purpose.
For the `Compartment` to use the same transforms for both evaluated strings
and modules converted to programs, pass them as `__shimTransforms__`
instead of `transforms`.

```js
const __shimTransforms__ = [addMetering];
const globalLexicals = { meter };
const c = new Compartment({ console }, null, {
  __shimTransforms__,
  globalLexicals
});
c.evaluate('console.log("Hello");');
```

The `__shimTransforms__` feature is designed to uphold the security properties
of compartments, since an attacker may use all available features, whether they
are standard or not.

### Logging Errors

`lockdown()` adds new global `assert` and tames the global `console`. The error
taming hides error stacks, accumulating them in side tables. The `assert`
system generated other diagnostic information hidden in side tables. The tamed
console uses these side tables to output more informative diagnostics.
[Logging Errors](./src/error/README.md) explains the design.

## Security claims and caveats

The `ses` shim concerns boundaries between programs in the same process and
JavaScript realm.
In terms of the [Taxonomy of Security Issues](https://agoric.com/blog/all/taxonomy-of-security-issues/),
the `ses` shim creates a boundary that is finer than an operating system
process or thread and facilitates boundaries as fine as individual objects.
While `ses` can interpose at granularities where process isolation is not a
viable boundary, as between an application and its dependencies or between a
platform and a plugin, `ses` combines well with coarser boundaries for defense
in depth.

For the purposes of these claims and caveats, a "host program" is a program
that arranges `ses`, calls `lockdown`, and orchestrates one or more "guest
programs", providing limited access to its resources.

Provided that the `ses` implementation and its trusted compute base are
correct, we claim that a host program (Figure 1) can evaluate a guest program
(`program`) in a compartment after `lockdown` and that the program:

- will initially only have access to one mutable object, the compartment's
  `globalThis`,
- specifically cannot modify any shared primordial objects, which are part of
  the default execution environment,
- cannot initially perform any I/O (except I/O necessarily performed by the
  trusted compute base like paging virtual memory),
- and specifically cannot measure the passage of time at any resolution.

However, such a program can:

- execute for an indefinite amount of time,
- allocate arbitrary amounts of memory,
- detect the platform endianness,
- in some JavaScript engines, observe the contents of the stack.
  This may include sensitive information about the layout of files on the host
  disk.
  In cases where the stack is data-dependent, a guest can infer the data.
  `ses` occludes the stack on V8 and SpiderMonkey, but cannot on
  JavaScriptCore.

```js
// Claims, Figure 1
lockdown();
const compartment = new Compartment();
compartment.evaluate(program);
```

If the host program (Figure 2) arranges for the compartment's `globalThis` to
be frozen, we additionally claim that the host can evaluate any two guest
programs (`program1` and `program2`) such that neither program will:

- initially share *any* mutable objects.
- be able to observe the relative passage of time of the other program,
  as they would had they been given a reference to a working `Date.now()`.
- be able to communicate, as they would if they had shared access to mutable
  state like an unfrozen object, a hardened collection like a `Map`, or even
  `Math.random()`.

```js
// Claims, Figure 2
lockdown();
const compartment = new Compartment();
harden(compartment.globaThis);
compartment.evaluate(program1);
compartment.evaluate(program2);
```

However such programs (`program`, `program1`, or `program2`) are only
as useful as a calculator.
A host program is therefore responsible for maintaining any of the desired
invariants above when "endowing" a compartment with any of its own objects.

For example, a host program (Figure 3) may run two programs in separate
compartments, giving one program the ability to resolve a promise and the other
program the ability to observe the settlement (fulfillment or rejection) of
that promise.
The host program is responsible for hardening these objects.

```js
// Claims, Figure 2
lockdown();

const promise = new Promise(resolve => {
  const compartmentA = new Compartment(harden({
    resolve,
  }));
  compartment.evaluate(programA);
});

const compartmentB = new Compartment(harden({
  promise,
}));
compartmentB.evaluate(programB);
```

With `ses`, guest programs are initially powerless.
A host can explicitly share limited powers with guest programs
and provide intentional communication channels between them.

Host programs must maintain the `ses` boundary with care in what they present
as endowments.
A host program should take care not to share mutable state with guests,
or distribute mutable state to multiple guests, such as an unfrozen object (use
`harden`), direct read and write access to a collection, like a `Map` or `Set`,
even if hardened.
Furthermore, typed arrays are collections and cannot be hardened.

For the purposes of sharing state, pseudo-random number generators (PRNG) like
`Math.random()` are equivalent to read and write access to shared state, and
any guest can use one to eavesdrop on other guests or the host that share one.

If a guest program needs a high resolution timer to function, the host should
only invite one guest to a single operating system process and limit the
activity of the host program in the same process.

Hosts must avoid exposing `SharedArrayBuffer` to guests.
Any two JavaScript programs sharing a `SharedArrayBuffer` can use the shared
buffer to construct a high resolution timer.

The `ses` shim does not in itself isolate the stack of guest programs, even
when evaluated in separate compartments.
This is relevant when program created objects are shared between guest
programs.

When a program interacts with an object introduced by another program (as
through the per-compartment `globalThis`, function arguments or returned
values), there are potential risks due to the synchronous nature of object
access.
Even interactions that are not explicit function calls may cause code from
another program, like property accessors or proxy traps, to execute on the same
stack, which may be able to call back into the program (reentrancy), throw, or
detect the current stack height.

A host object can defend itself from reentrancy attacks by ensuring that it
interacts with guest objects on a clean stack through the use of promises.

Within these constraints, a host program can provide objects that grant limited
I/O capabilities to guest programs, and even revoke or suspend those
capabilities at runtime.

The trusted compute base (TCB) for `ses` includes:

- the host hardware,
- the host operating system,
- any intermediate virtual operating systems or hypervisors,
- the process memory manager,
- an implementation of JavaScript conforming to ECMAScript 262 as of
  2021, providing no unspecified embedding host behavior like the introduction of syntax
  that when evaluated reveals a mutable object.
  `ses` accounts for one such host behavior provided by Node.js, namely the `domain`
  property on promises, by preventing the use of `ses` in concert with the
  `domain` module.
- Also, any attached debugger, and
- any JavaScript that has executed in the same realm before the host program calls
  `lockdown`, including JavaScript that executes after `ses` initializes.

## Audits

In June 2021, `ses` underwent formal third party vulnerability assessment over a
period of 4 weeks with 3 engineers and a dedicated project manager that
surfaced no unknown security issues or vulnerabilities within the code. As a
result of this assessment, [a single code change was
made](https://github.com/endojs/endo/issues/126) to set a flag to disable the
domain module in Node.js to mitigate a known issue identified in the code.  The
code will be the subject of another round of intense application security
review mid-2022 by a reputable application security firm renowned for their
results in security reviews.

In July 2021, `ses` was the target of an intensive collaborative bug hunt lead by
the MetaMask team.
No critical flaws in the code surfaced during the review.
As a result of the search for flaws, deficiencies, and weaknesses in the code
(which is currently a Stage 1 proposal with the ECMA TC39 committee), a series
of small code changes and documentation improvements were made. There is a
report available on the
[Agoric blog](https://agoric.com/blog/technology/metamask-agoric-hardened-js-security-review/)
that includes links to recordings of code walk-throughs and technical
discussion, and issues are tagged
[audit-SEStival](https://github.com/endojs/endo/labels/audit-sestival). 

In addition to vulnerability assessments, active efforts to [formally verify
the Agoric kernel](https://agoric.com/blog/technology/the-path-to-verified-blds-how-informal-systems-and-agoric-are-using-formal-methods-analysis-to-improve-software-integrity/)
have found the object capability model that `ses` provides to be sound.

Hardened JavaScript is also within the scope of the [Agoric bug bounty
program](hackerone.com/agoric), which rewards researchers for surfacing valid
bugs in our code. We welcome the opportunity to cooperate with researchers,
whose efforts will undoubtedly yield stronger, more resilient code. 

## Bug Disclosure

Please help us practice coordinated security bug disclosure, by using the
instructions in [SECURITY.md][] to report security-sensitive bugs privately.

For non-security bugs, please use the [regular Issues page][SES Issues].

[define shim]: https://en.wikipedia.org/wiki/Shim_(computing)
[SES proposal]: https://github.com/tc39/proposal-ses
[SECURITY.md]: https://github.com/endojs/endo/blob/master/packages/ses/SECURITY.md
[SES Issues]: https://github.com/endojs/endo/issues
