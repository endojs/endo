# SES

SES is a [shim][define shim] for [Hardened JavaScript][] as [proposed][SES
proposal] to ECMA TC39.
SES stands for *fearless cooperation*.
Hardened JavaScript is highly compatible with ordinary JavaScript.
Most existing JavaScript libraries can run on Hardened JavaScript.

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

Agoric and MetaMask rely on Hardened JavaScript and this SES shim as part of
systems that sandbox third-party plugins or smart contracts and mitigate supply
chain attacks for production web applications, web extensions, and build
systems.

[![Agoric Logo](docs/agoric-x100.png)](https://agoric.com/)
[![MetaMask Logo](docs/metamask-x100.png)](https://metamask.io/)

See <https://github.com/Agoric/Jessie> to see how SES fits into the various
flavors of confined JavaScript execution. And visit
<https://ses-demo.agoric.app/demos/> for a demo.

SES starts where the Caja project left off
<https://github.com/google/caja/wiki/SES>, and goes on to introduce compartments
and modernize the permitted JavaScript features.

Please join the conversation on our [Mailing List][SES Strategy Group] and
[Matrix][Endo Matrix].
We record a [weekly conference call][SES Strategy Recordings] with the Hardened
JavaScript engineering community.

*Hardened JavaScript*, Kris Kowal:

[![Primer on Hardened JavaScript](https://img.youtube.com/vi/RZ7bBIU8DRc/0.jpg)](https://www.youtube.com/watch?v=RZ7bBIU8DRc)

*Don't add Security, Remove Insecurity*, Mark Miller:

[![Don't add Security, Remove Insecurity](https://img.youtube.com/vi/u-XETUbxNUU/0.jpg)](https://www.youtube.com/watch?v=u-XETUbxNUU)

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
affect each other until they have been introduced, and even then can only
interact through their own exposed interfaces.

To do this, `lockdown()` tamper-proofs all of the JavaScript intrinsics, to
prevent **prototype pollution**.
After that, no program can subvert the methods of these objects (preventing
some **man in the middle attacks**).
Also, no program can use these mutable objects to pass notes to parties that
haven't been expressly introduced (preventing some **covert communication
channels**).

Lockdown freezes all objects that are effectively undeniable to programs in the
realm. The set of such objects includes but is not limited to: `globalThis`,
prototype objects of Array, Function, GeneratorFunction, and Object, and objects
accessible from those objects (such as `Object.prototype.toString`).

The `lockdown()` function also **tames** some objects including regular
expressions, locale methods, and errors.
A tamed `RegExp` does not have the deprecated `compile` method.
A tamed error does not have a V8 `stack`, but the `console` can still see the
stack.
Lockdown replaces locale methods like `String.prototype.localeCompare` with
generic versions that do not reveal the host locale.

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
Hardening an object graph makes the surface immutable, but does not guarantee
that methods are free of side effects.

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

lockdown();

const c = new Compartment({
  globals: {
    print: harden(console.log),
  },
  __options__: true, // temporary migration affordance
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
the JavaScript intrinsics, disabling `Math.random`, `Date.now` and the
behaviors of the `Date` constructor which would reveal the current time.
Compartments leave these out since they can be used as covert communication
channels between programs.
However, a compartment may be expressly given access to these objects
through:

* the first argument to the compartment constructor or
* by assigning them to the compartment's `globalThis` after construction.

```js
const powerfulCompartment = new Compartment({
  globals: { Math },
  __options__: true, // temporary migration affordance
});
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
module descriptors.
A compartment can be configured with module descriptors, from highest to lowest
precedence:

* the `modules` map provided to the `Compartment` constructor,
* returned by a `moduleMapHook(specifier)` passed as an option to the
  `Compartment` constructor.
* returned by either the `importHook(specifier)` or `importNowHook(specifier)`
  option passed to the `Compartment` constructor. Calling
  `compartment.import(specifier)` falls through to the `importHook` which may
  return a promises, whereas `compartment.importNow(specifier)` falls through
  to the synchronous `importNowHook`.

The `resolveHook` determines how the compartment will infer the full module
specifier for another module from a referrer module and the import specifier.

```js
import 'ses';
import { ModuleSource } from '@endo/module-source';

const c1 = new Compartment({
  name: "first compartment",
  resolveHook: (moduleSpecifier, moduleReferrer) => {
    return resolve(moduleSpecifier, moduleReferrer);
  },
  importHook: async moduleSpecifier => {
    const moduleLocation = locate(moduleSpecifier);
    const moduleText = await retrieve(moduleLocation);
    return {
        source: new ModuleSource(moduleText, moduleLocation)
    };
  },
  __options__: true, // temporary migration affordance
});
```

> The Hardened JavaScript language specifies a global `ModuleSource`, but this
> is not provided by the shim because it entrains a full JavaScript parser that
> is an unnecessary performance penalty for the SES runtime.
> Instead, the SES shim accepts a pre-compiled module source duck-type that
> is tightly coupled to the shim implementation.

A compartment can also link a module in another compartment.

```js
const c2 = new Compartment({
  name: "second compartment",
  modules: {
    'c1': {
      source: './main.js',
      compartment: c1,
    },
  },
  resolveHook,
  importHook,
  __options__: true, // temporary migration affordance
});
```

#### Module Descriptors

Comparments can load and initialize module namespaces from module descriptors.
Like property descriptors, module descriptors are ordinary objects with various
forms.

##### Descriptors with `source` property

* If fhe value of the `source` property is a string, the parent compartment
  loads the module but the compartment itself initializes the module.

* Otherwise, if the value of the `source` property is the module source, the
  module is initialized from the module source.

* Otherwise, the value of the `source` property must be an object. The module
  is loaded and initialized from the object according to the [virtual module
  source](#VirtualModuleSource) pattern.

If the `importMeta` property is present, its value must be an object. The
default `importMeta` object is an empty object.

Compartments copy the `importMeta` object properties into the module
`import.meta` object like `Object.assign`.

If the `specifier` property is present, its value is coerced into a string and
becomes the referrer specifier of the module, on which all import specifiers
are resolved using the `resolveHook`.

##### Descriptors with `namespace` property

* If fhe value of the `namespace` property is a string, the descriptor shares a
  module to be loaded and initialized by the compartment referred by the
  `compartment` property.

  * If the `compartment` property is present, its value must be a
      compartment.
  * If absent, the `compartment` property defaults to the compartment being
      constructed in the `modules` option, or being hooked in the `loadHook`
      and `loadNowHook` options.

* Otherwise, if the value of the `namespace` property is a module namepace, the
  descriptor shares a module that is already available.

* Otherwise, the value of `namespace` property must be an object. The module is
  loaded and initialized from the object according to the [virtual module
  namespace](#VirtualModuleNamespace) pattern.

#### Redirects

If a compartment imports a module specified as `"./utility"` but actually
implemented by an alias like `"./utility/index.js"`, the `importHook` may
follow redirects, symbolic links, or search for candidates using its own logic
and return a module that has a different "response specifier" than the original
"request specifier".
The `importHook` may return an "alias" object with `source`, `compartment`,
and `specifier` properties.

* `source` must be a module source, either a virtual module source
  or a compiled module source.
* `compartment` is optional, to be specified if the alias transits to a
  the specified different compartment, and
* `specifier` is the full module specifier of the module in its compartment.
  This defaults to the request specifier, which is only useful if the
  compartment is different.

In the following example, the importHook searches for a file and returns an
alias.

```js
const importHook = async specifier => {
  const candidates = [specifier, `${specifier}.js`, `${specifier}/index.js`];
  for (const candidate of candidates) {
    const source = await maybeImportSource(candidate);
    if (source !== undefined) {
      return {
        source,
        specifier: candidate,
        compartment,
      };
    }
  }
  throw new Error(`Cannot find module ${specifier}`);
};

const compartment = new Compartment({
  resolveHook,
  importHook,
  __options__: true, // temporary migration affordance
});
```

#### moduleMapHook

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
    return {
      source: './index.js',
      compartment: even,
    };
  } else if (moduleSpecifier === 'odd') {
    return {
      source: './index.js',
      compartment: odd,
    };
  }
};

const even = new Compartment({
  resolveHook: nodeResolveHook,
  importHook: makeImportHook('https://example.com/even'),
  moduleMapHook,
  __options__: true, // temporary migration affordance
});

const odd = new Compartment({
  resolveHook: nodeResolveHook,
  importHook: makeImportHook('https://example.com/odd'),
  moduleMapHook,
  __options__: true, // temporary migration affordance
});
```

#### importNowHook

Additionally, an `importNowHook` may be provided that the compartment will use
as means to synchronously load modules not seen before in situations where
calling out to asynchronous `importHook` is not possible.
Specifically, when `compartmentInstance.importNow('specifier')` is called, the
compartment will first look up module records it's already aware of and call
`moduleMapHook` and if none of that is successful in finding a module record
matching the specifier, it will call `importNowHook` expecting to synchronously
receive the same record type as from `importHook` or throw if it cannot.

```js
import 'ses';
import { ModuleSource } from '@endo/module-source';

const compartment = new Compartment({
  name: "first compartment",
  modules: {
    c: {
      source: new ModuleSource(''),
    },
  },
  resolveHook: (moduleSpecifier, moduleReferrer) => {
    return resolve(moduleSpecifier, moduleReferrer);
  },
  importHook: async moduleSpecifier => {
    const moduleLocation = locate(moduleSpecifier);
    const moduleText = await retrieve(moduleLocation);
    return {
      source: new ModuleSource(moduleText, moduleLocation),
    };
  },
  importNowHook: moduleSpecifier => {
    const moduleLocation = locate(moduleSpecifier);
    // Platform-specific synchronous read API can be used
    const moduleText = fs.readFileSync(moduleLocation);
    return {
      source: new ModuleSource(moduleText, moduleLocation),
    };
  },
  __options__: true, // temporary migration affordance
});
//...                   | importHook | importNowHook
await compartment.import('a'); //| called     | not called
compartment.importNow('b');    //| not called | called
compartment.importNow('a');    //| not called | not called
compartment.importNow('c');    //| not called | not called
```

### <a name="VirtualModuleSource"></a> Virtual Module Source

To incorporate modules not implemented as JavaScript modules, third-parties may
implement a `VirtualModuleSource` interface.
The object must have an `imports` array and an `execute` method.
The compartment will call `execute` with:

1. the proxied `exports` namespace object,
2. a `resolvedImports` object that maps import names (from `imports`) to their
   corresponding resolved specifiers (through the compartment's `resolveHook`),
   and
3. the `compartment`, such that `importNow` can obtain any of the module's
   specified `imports`.

:warning: A future breaking version may allow the `importNow` and the `execute`
method of virtual module sources to return promises, to support
top-level await.

:warning: The virtual module source interface does not yet agree with the
[XS](https://www.moddable.com/hardening-xs) implementation of [Hardened
JavaScript](https://hardenedjs.org/).

### Compiled modules

Instead of the `ModuleSource` constructor specified for the SES language,
the SES shim uses compiled module source records as a stand-in.
These can be created with a `ModuleSource` constructor from a package
like `@endo/module-source`.
We omitted `ModuleSource` from the SES shim because it entrains a heavy
dependency on a JavaScript parser.
The shim depends upon a `ModuleSource` constructor to analyze and
transform the source of a JavaScript module (known as an ESM or a `.mjs` file)
into a JavaScript program suitable for evaluation with `compartment.evaluate`
using a particular calling convention to initialize a module instance.

A compiled module source record has the following shape:

* `imports` is a record that maps partial module specifiers to a list of
  names imported from the corresponding module.
* `exports` is an array of all the names that the module will export.
* `reexports` is an array of partial module specifier for which this
  module exports all imported names.
  This field is optional.
* `__syncModuleProgram__` is a string that evaluates to a function that accepts
  an initialization record and initializes the module.
  This property distinguishes this type of module record.
  The name implies a future record type that supports top-level await.
  * An initialization record has the properties `imports`, `liveVar`, `importMeta` and
    `onceVar`.
    * `imports` is a function that accepts a map from partial import
      module specifiers to maps from names that the corresponding module
      exports to notifier functions.
      A notifier function accepts an update function and registers
      to receive updates for the value exported by the other module.
    * `importMeta` is a null-prototype object with keys transferred from `importMeta`
      property in the envelope returned by importHook and/or mutated by
      calling `importMetaHook(moduleSpecifier, importMeta)`
    * `liveVar` is a record that maps names exported by this module
      to a function that may be called to initialize or update
      the corresponding value in another module.
    * `onceVar` is a record that maps constants exported by this
      module to a function that may be called to initialize the
      corresponding value in another module.
* `__syncModuleFunctor__` is an optional function that if present is used
  instead of the evaluation of the `__syncModuleProgram__` string. It will be
  called with the initialization record described above. It is intended to be
  used in environments where eval is not available. Sandboxing of the functor is
  the responsibility of the author of the ModuleSource.
* `__liveExportsMap__` is a record that maps import names or names in the lexical
  scope of the module to export names, for variables that may change after
  initialization. Any reexported name is assumed to possibly change.
  The exported name is wrapped in a duple array like `["exportedName", true]`.
  The second value, a boolean, indicates that the variable has a temporal
  dead-zone (a time between creation and initialization) when access to that
  name should throw a `ReferenceError`.
* `__fixedExportsMap__` is a record that maps import names to export names
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
const c = new Compartment({
  globals: { console, coverage },
  transforms,
  __options__: true, // temporary migration affordance
});
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
`ModuleSource` constructor.
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
const __shimTransforms__ = [addCoverage];
const c = new Compartment({
  globals: { console, coverage },
  __shimTransforms__,
  __options__: true, // temporary migration affordance
});
c.evaluate('console.log("Hello");');
```

The `__shimTransforms__` feature is designed to uphold the security properties
of compartments, since an attacker may use all available features, whether they
are standard or not.

### Logging Errors

`lockdown()` adds new global `assert` and tames the global `console`. The error
taming hides error stacks, accumulating them in side tables. The `assert`
system generates other diagnostic information hidden in side tables. The tamed
console uses these side tables to output more informative diagnostics.
[Logging Errors](./src/error/README.md) explains the design.

### Controlling Module-Loading Errors

The `Compartment` constructor now accepts a `boolean` option, `noAggregateLoadErrors`, to control how module-loading errors are reported.

By default, its value is `false`, which causes all relevant errors to be collected and rejected or thrown in a single exception from `compartment.import()` or `compartment.importNow()`, respectively.

If set to `true`, this will cause the *first* module-loading error encountered to be thrown (or rejected) immediately; no further module-loading will be attempted, and no further errors will be collected.

This is mostly useful for supporting optional dependencies in CommonJS modules, for example:

```js
try {
  require('something-optional')
} catch (err) {
  // continue
}
```

## Security claims and caveats

The `ses` shim concerns boundaries between programs in the same process and
JavaScript realm.
In terms of the [Taxonomy of Security Issues](https://papers.agoric.com/taxonomy-of-security-issues/),
the `ses` shim creates a boundary that is finer than an operating system
process or thread and facilitates boundaries as fine as individual objects.
While `ses` can interpose at granularities where process isolation is not a
viable boundary, as between an application and its dependencies or between a
platform and a plugin, `ses` combines well with coarser boundaries for defense
in depth.

For the purposes of these claims and caveats, a "host program" is a program
that arranges `ses`, calls `lockdown`, and orchestrates one or more "guest
programs", providing limited access to its resources.

### Single-guest Compartment Isolation

Provided that the `ses` implementation and its
[trusted compute base](#trusted-compute-base) are correct, we claim that a host
program can evaluate a guest program (`program`) in a compartment after
`lockdown` and that the guest program:

* will initially only have access to one mutable object, the compartment's
  `globalThis`,
* specifically cannot modify any shared primordial objects, which are part of
  the default execution environment,
* cannot initially perform any I/O (except I/O necessarily performed by the
  trusted compute base like paging virtual memory),
* and specifically cannot measure the passage of time at any resolution.

However, such a program can:

* execute for an indefinite amount of time,
* allocate arbitrary amounts of memory,
* detect the platform endianness,
* in some JavaScript engines, observe the contents of the stack.
  This may include sensitive information about the layout of files on the host
  disk.
  In cases where the stack is data-dependent, a guest can infer the data.
  `ses` occludes the stack on V8 and SpiderMonkey, but cannot on
  JavaScriptCore.

```js
lockdown();
const compartment = new Compartment();
compartment.evaluate(program);
```

### Multi-guest Compartment Isolation

If the host program arranges for the compartment's `globalThis` to
be frozen, we additionally claim that the host can evaluate any two guest
programs (`program1` and `program2`) in that compartment such that neither
guest program will:

* initially share *any* mutable objects.
* be able to observe the relative passage of time of the other program,
  as they would had they been given a reference to a working `Date.now()`.
* be able to communicate, as they would if they had shared access to mutable
  state like an unfrozen object, a hardened collection like a `Map`, or even
  `Math.random()`.

```js
lockdown();
const compartment = new Compartment();
harden(compartment.globaThis);
compartment.evaluate(program1);
compartment.evaluate(program2);
```

### Endowment Protection

The above `program`, `program1`, and `program2` guest programs are only useful
as glorified calculators.
When going beyond that by "endowing" a compartment with extra objects, a host
program is responsible for maintaining any of the invariants above that it
considers necessary.

For example, a host program may run two guest programs in separate
compartments, giving one the ability to resolve a promise and the other
the ability to observe the settlement (fulfillment or rejection) of
that promise.
The host program is responsible for hardening the objects implementing such
abilities.

```js
lockdown();

const promise = new Promise(resolve => {
  const compartmentA = new Compartment({
    globals: harden({ resolve }),
  __options__: true, // temporary migration affordance
  });
  compartmentA.evaluate(programA);
});

const compartmentB = new Compartment({
  globals: harden({ promise }),
  __options__: true, // temporary migration affordance
});
compartmentB.evaluate(programB);
```

With `ses`, guest programs are initially powerless.
A host can explicitly share limited powers with guest programs
and provide intentional communication channels between them.

### Caveats

Host programs must maintain the `ses` boundary with care in what they present
as endowments.
A host program should take care not to share mutable state with guests,
or distribute mutable state to multiple guests, such as an object that has not
been frozen with `harden` or a collection like a `Map` or `Set` or typed array
(collections retain some mutability even if hardened).

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
This is relevant when objects are shared between guest programs.

When a program interacts with an object introduced by another program (as
through the per-compartment `globalThis`, function arguments or returned
values), there are potential risks due to the synchronous nature of object
access.
Even interactions that are not explicit function calls may cause code from
another program, like property accessors or proxy traps, to execute on the same
stack, which may be able to detect the stack height, throw an exception, or call
back into the program in pursuit of a reentrancy attack.

A host object can defend itself from reentrancy attacks by ensuring that it
interacts with guest objects on a clean stack through the use of promises.

Within these constraints, a host program can provide objects that grant limited
I/O capabilities to guest programs, and even revoke or suspend those
capabilities at runtime.

### Trusted Compute Base

The trusted compute base (TCB) for `ses` includes:

* the host hardware,
* the host operating system,
* any intermediate virtual operating systems or hypervisors,
* the process memory manager,
* an implementation of JavaScript conforming to ECMAScript 262 as of
  2021, providing no unspecified embedding host behavior like the introduction of syntax
  that when evaluated reveals a mutable object.
  `ses` accounts for one such host behavior provided by Node.js, namely the `domain`
  property on promises, by preventing the use of `ses` in concert with the
  `domain` module.
* Also, any attached debugger, and
* any JavaScript that has executed in the same realm before the host program calls
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
As a result of the search for flaws, deficiencies, and weaknesses in the code,
a series of small code changes and documentation improvements were made. There
is a report available on the
[Agoric blog](https://agoric.com/blog/technology/purple-teaming-how-metamask-and-agoric-hunted-bugs-to-harden-javascript)
that includes links to recordings of code walk-throughs and technical
discussion, and issues are tagged
[audit-SEStival](https://github.com/endojs/endo/issues?q=label%3Aaudit-sestival).
The [video recordings of the MetaMask and Agoric collaborative
review](https://www.youtube.com/playlist?list=PLzDw4TTug5O2d1XOdB7VNCZbIxRZu3gov).
provide useful background for future audits, reviews, and for learning more
about how the `ses` shim constructs a Hardened JavaScript environment.

In addition to vulnerability assessments, active efforts to [formally verify
the Agoric kernel](https://agoric.com/blog/technology/the-path-to-verified-blds-how-informal-systems-and-agoric-are-using-formal)
have found the object capability model that `ses` provides to be sound.

Hardened JavaScript is also within the scope of the [Agoric bug bounty
program](https://hackerone.com/agoric), which rewards researchers for surfacing valid
bugs in our code. We welcome the opportunity to cooperate with researchers,
whose efforts will undoubtedly yield stronger, more resilient code.

## Bug Disclosure

Please help us practice coordinated security bug disclosure, by using the
instructions in [SECURITY.md][] to report security-sensitive bugs privately.

For non-security bugs, please use the [regular Issues page][SES Issues].

## Ecosystem Compatibility

Most ordinary JavaScript can run without issues in a realm locked down by SES.
Exceptions are tracked at [issue #576][incompatibility tracking], and almost
always take the form of assignments that fail because the
"[override mistake][override mistake]" prevents overriding properties inherited
from a frozen intrinsic object in the prototype chain. When that is the case,
the code is often incompatible with *all* environments in which intrinsic
objects are frozen (such as in Node.js with the
[`--frozen-intrinsics`][Node frozen intrinsics] option) and can be fixed by
replacing `<lhs>.<propertyKey> = <rhs>;` or `<lhs>[<propertyKey>] = <rhs>;` with

```js
Object.defineProperties(<lhs>, {
  [<propertyKey>]: {
    value: <rhs>,
    writable: true,
    enumerable: true,
    configurable: true,
  },
});
```

Upon encountering an incompatibility, we recommend that you add a comment to
[issue #576][incompatibility tracking] and file an issue with the external
project referencing this section.
Projects often have their own unique issue reporting templates, but generally
provide some place to include text like

> ```
> This project has some assignments that break in an environment with frozen
> intrinsic objects, such as
> [Hardened JS (a.k.a. SES)](https://github.com/endojs/endo/blob/master/packages/ses#ecosystem-compatibility)
> or Node.js with the
> [`--frozen-intrinsics`](https://nodejs.org/docs/latest/api/cli.html#--frozen-intrinsics)
> option.
> Specifically, [link to source in the project] does not work correctly in such
> an environment.
>
> Please consider increasing support by replacing assignments to object
> properties inherited from intrinsics with use of `Object.defineProperties`
> (thereby working around the JavaScript "override mistake"), and if applicable
> also by avoiding mutation of intrinsic objects.
> If you don't have the capacity but would accept a PR, please comment to that
> effect so that a volunteer knows their efforts would be welcomed.
> ```

We find that library authors are generally amenable to making these small changes to increase
compatibility with any environment that protects itself from prototype pollution attacks by freezing
intrinsics, including `ses`.

[Hardened JavaScript]: https://hardenedjs.org/
[define shim]: https://en.wikipedia.org/wiki/Shim_(computing)
[Endo Matrix]: https://matrix.to/#/#endojs:matrix.org
[incompatibility tracking]: https://github.com/endojs/endo/issues/576
[Node frozen intrinsics]: https://nodejs.org/docs/latest/api/cli.html#--frozen-intrinsics
[override mistake]: https://web.archive.org/web/20141230041441/http://wiki.ecmascript.org/doku.php?id=strawman:fixing_override_mistake
[SECURITY.md]: https://github.com/endojs/endo/blob/master/packages/ses/SECURITY.md
[SES Issues]: https://github.com/endojs/endo/issues
[SES proposal]: https://github.com/tc39/proposal-ses
[SES Strategy Group]: https://groups.google.com/g/ses-strategy
[SES Strategy Recordings]: https://www.youtube.com/playlist?list=PLzDw4TTug5O1jzKodRDp3qec8zl88oxGd
