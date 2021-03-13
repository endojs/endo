# Secure ECMAScript (SES)

Secure ECMAScript (SES) is an execution environment that provides fine-grained
sandboxing with Compartments.

* **Compartments** Compartments are separate execution contexts: each one has
  its own global object and global lexical scope.
* **Frozen realm** Compartments share their intrinsics to avoid identity
  discontinuity. By freezing the intrinsics, SES protects programs from each
  other. By sharing the intrinsics, programs from separate compartments
  can recognize each other's arrays, data objects, and so on. 
* **Strict mode** SES enforces JavaScript strict mode that enhances security,
  for example by changing some silent errors into throw errors.
* **POLA** (Principle of Least Authority) By default, Compartments receive no
  ambient authority. They are created without host-provided APIs, (for example
  no `fetch`). Compartments can be selectively endowed with powerful arguments,
  globals, or modules.

[Learn about the SES specification](https://github.com/tc39/proposal-ses).

[Learn how to use SES in your own project](https://ses-secure-ecmascript.readthedocs.io/en/latest).

Secure ECMAScript (SES) is a frozen environment for running ECMAScript
(Javascript) 'strict' mode programs with no ambient authority in their global
scope, and with the addition of Compartments to evaluate third-party code
safely.
By freezing everything accessible from the global scope, it removes programs'
abilities to interfere with each other, and thus enables isolated evaluation of
arbitrary code.

SES runs atop an ES6-compliant platform, enabling safe interaction of
mutually-suspicious code, using object-capability -style programming.

See https://github.com/Agoric/Jessie to see how SES fits into the various
flavors of confined ECMAScript execution. And visit
https://ses-demo.netlify.app/demos/ for a demo.

Derived from the Caja project, https://github.com/google/caja/wiki/SES.

Still under development: do not use for production systems yet, there are
known security holes that need to be closed.

## Install

```sh
npm install ses
```

## Usage

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
A tamed `RexExp` does not have the deprecated `compile` method.
A tamed error does not have a V8 `stack`, but the `console` can still see the
stack.
Lockdown replaces locale methods like `String.prototype.localeCompare` with
lexical versions that do not reveal the user locale.

```js
import 'ses';
import 'my-vetted-shim';

lockdown();

console.log(Object.isFrozen([].__proto__));
// true
```

Lockdown does not erase any powerful objects from the initial global scope.
Instead, **Compartments** give complete control over what powerful objects
exist for client code.

See [`lockdown` options](./lockdown-options.md) for configuration options to
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
const f = new Function("return this");
f() === globalThis
// true
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
The `importHook` may return an "alias" objeect with `record`, `compartment`,
and `module` properties.

- `record` must be a `StaticModuleRecord`,
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

To incorporate modules not implemented as ECMAScript modules, third-parties may
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
To transform the source of an ECMAScript module, the `importHook` must
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

## Bug Disclosure

Please help us practice coordinated security bug disclosure, by using the
instructions in
[SECURITY.md](https://github.com/Agoric/ses-shim/blob/master/SECURITY.md)
to report security-sensitive bugs privately.

For non-security bugs, please use the [regular Issues
page](https://github.com/Agoric/ses-shim/issues).
