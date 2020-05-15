# Secure EcmaScript (SES)

Secure EcmaScript (SES) is a frozen environment for running EcmaScript
(Javascript) 'strict' mode programs with no ambient authority in their global
scope, and with the addition of a safe two-argument evaluator
(`SES.confine(code, endowments)`). By freezing everything accessible from the
global scope, it removes programs abilities to interfere with each other, and
thus enables isolated evaluation of arbitrary code.

It runs atop an ES6-compliant platform, enabling safe interaction of
mutually-suspicious code, using object-capability -style programming.

See https://github.com/Agoric/Jessie to see how SES fits into the various
flavors of confined EcmaScript execution. And visit
https://rawgit.com/Agoric/ses-shim/master/demo/ for a demo.

Derived from the Caja project, https://github.com/google/caja/wiki/SES.

Still under development: do not use for production systems yet, there are
known security holes that need to be closed.

## Install

```sh
npm install ses
```

## Usage

### Module

This example locks down the current realm, turning it into a starting
compartment.
Within a compartment, there is a `Compartment` constructor that conveys
"endownments" into the new compartment's global scope, and a `harden` method
that that object and any object reachable from its surface.
The compartment can import modules and evaluate programs.

```js
import {lockdown} from "ses";

lockdown();

const c = new Compartment({
    print: harden(console.log),
});

c.evaluate(`
    print("Hello! Hello?");
`);
```

The new compartment has a different global object than the start compartment.
The global object is initially mutable.
Locking down the start compartment hardened many of the intrinsics in global
scope.
After lockdown, no compartment can tamper with these intrinsics.
Many of these intrinsics are identical in the new compartment.

```js
const c = new Compartment();
c.global === global; // false
c.global.JSON === JSON; // true
```

The property holds among any other compartments.
Each has a unique, initially mutable, global object.
Many intrinsics are shared.

```js
const c1 = new Compartment();
const c2 = new Compartment();
c1.global === c2.global; // false
c1.global.JSON === c2.global.JSON; // true
```

### Compartments

Any code executed within a compartment shares a set of module instances.
For modules to work within a compartment, the creator must provide
a `resolveHook` and an `importHook`.
The `resolveHook` determines how the compartment will infer the full module
specifier for another module from a referrer module and the module specifier
imported within that module.
The `importHook` accepts a module specifier and asynchronously returns a
`ModuleStaticRecord` for that module.

```js
import { Compartment, ModuleStaticRecord } from 'ses';
const c1 = new Compartment({}, {}, {
  resolveHook: (moduleSpecifier, moduleReferrer) => {
    return new URL(moduleSpecifier, moduleReferrer).toString();
  },
  importHook: async moduleSpecifier => {
    const moduleLocation = locate(moduleSpecifier);
    const moduleText = await retrieve(moduleLocation);
    return new ModuleStaticRecord(moduleText, moduleLocation);
  },
});
```

A compartment can also link a module in another compartment.
Each compartment has a `module` function that accepts a module specifier
and returns the ModuleNamespace for that module.
The ModuleNamespace is not useful for inspecting the exports of the
module until that module has been imported, but it can be passed into the
module map of another Compartment, creating a link.

```js
const c2 = new Compartment({}, {
  'https://example.com/packages/example/': c1.module('./main.js'),
}, {
  resolveHook,
  importHook,
});
```

## Bug Disclosure

Please help us practice coordinated security bug disclosure, by using the
instructions in
[SECURITY.md](https://github.com/Agoric/ses-shim/blob/master/SECURITY.md)
to report security-sensitive bugs privately.

For non-security bugs, please use the [regular Issues
page](https://github.com/Agoric/ses-shim/issues).
