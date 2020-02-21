# Compartmemt Shim
[![dependency status][deps-svg]][deps-url]
[![dev dependency status][dev-deps-svg]][dev-deps-url]
[![License][license-image]][license-url]

This folder contains a shim implementation of the Compartment from the [Draft Proposal for SES](https://github.com/tc39/proposal-ses).

## Motivation

Compartments can improve on security by enabling the application of the
[Principle Of Least Authority (POLA)](https://medium.com/agoric/pola-would-have-prevented-the-event-stream-incident-45653ecbda99).

Compartments can be created with the minimum access to globals and to modules (i.e. authority) required by the code executing in them.

Compartments have several advantages over root realms:
- because the same set of intrinsics are shared between them, they don't suffer from the problem of identity discontinuity that occur between different root realms.
- lighter JavaScript engines like XS from Moddable don't expose a mechanism to create a fresh new set of intrinsics (like an iframe in a browser, or a vm in node) and root realms cannot be created.

## Implementation & requirements

This code is a subset and simplification of the [original realm shim](https://github.com/Agoric/realms-shim).

## Assumptions

1. **Important: the Compartment shim doesn't bundle the platform repairs and taming required to maintain confinement. Those have to be loaded separately.** Typically, the Compartment shim will not be used directly, but via the [lockdown-shim] which handles all necessary repairs and taming:
- [Legacy accessors](../repair-legacy-accessors): those need to be loaded for older engines, but are not required on modern ones.
- [Function constructors](../tame-function-constructors): the Compartment shim will refuse to initialize if the repairs to the function constructors aren't performed beforehand.
- Hardening of [Intrinsics](../intrinsics) via [harden](../harden) : isolation between compartments can only be maintained if the intrinsics are transitively frozen.
- Additionally, [Date](../tame-global-date-object), [Error](../tame-global-date-object), [Math](../tame-global-date-object), [RegExp](../tame-global-date-object) all need to be tamed to remove state and maintain isolation.

2. In order to endow an evaluator with powerful objects, those powers need to be attenuated: for example XMLHttpRequest, Local DB, do not support segregation. This taming mechanism requires third party code.

3. Modules and imports are not supported. This requires third party code.

## Limitations

The current implementation has 5 main limitations:

* All code evaluated inside an evaluator runs in strict mode (including the code passed to `eval()` and `Function()`). This is in accordance with the SES specifications, which mandates that all code executes in strict mode.
* Direct eval is not supported
* Modules and imports are not supported.
* Top level `var` and function declarations do not create new bindings on the global object.
* Top level `let`, `const`, and any other feature that relies on the global lexical scope are not preserved between difference invocations of eval, instead we create a new lexical scope for every evaluation.

Other limitations:
* `(function() {}).constructor === Function` fails
* The detection of both direct eval() and import() will create false positives (notably with strings and in comments) due to the fast detection mechanism. For example `/*  eval() */` throws a syntax error.
* Even if all code runs in strict mode, variables not declared fail to throw a reference error when a variable of the same name is present on the unsafe global. On a browser `(function() { top = 2 })()` will create a global in the evaluator because the property `top` exists on the `window` object.

For more details about the divergence with specs, consult the list of tests skipped in test262.

## Open Questions

Consult the [issues](https://github.com/Agoric/compartment-shim/issues) page.

## Building the Shim

```
git clone https://github.com/Agoric/compartment-shim.git
cd compartment-shim
npm install
npm run build
```

This will install the necessary dependencies and build the shim locally.

## Running the tests

To run the tests, simply use:

```
npm run test
```

In addition, to run a subset of test262, simply use:

```
npm run test262
```

## Demo

To open the playground example in your default browser:

```
npm run build
npm run example
open http://localhost:8000
```

## Usage

### Script

To use the shim in a webpage, build the shim, then:

```html
  <script src="./dist/compartment-shim.umd.min.js"></script>
  <script>
    const e = new Evaluators();
    [...]
  </script>
```

### CommonJS Module

To use the shim with node, build the shim, then:
```js
  const Evaluator = require('./dist/compartment-shim.cjs.js');
  const e = new Evaluator();
  [...]
```

### Native ES6 Module Support

To use the shim with node with native ESM6 module support, build the shim, then:
```js
  import Evaluator from './dist/realms-shim.esm.js';  
  const r = new Evaluator();
  [...]
```

### ES6 Module via esm

You can also use the ES6 module version of the Evaluator shim in Node.js via the package `esm`. To do that, launch node with esm via the "require" option:

```bash
npm install esm
node -r esm main.js
```

And import the realm module in your code:

```js
  import Evaluator from './src/evaluator';
  const e = new Evaluator();
  [...]
```

## Examples

### Example 1: Compartments

To create one evaluator with a new global object and shared intrinsics with the current realm.

```js
const c = new Compartment();
c.global === global; // false
c.global.JSON === JSON; // true
```

### Example 2: Two Compartments

To create two evaluators each with a new global object and shared intrinsics between them and with the current realm.

```js
const c1 = new Compartment();
const c2 = new Compartment();
c1.global === c2.global; // false
c1.global.JSON === c2.global.JSON; // true
```

[deps-svg]: https://david-dm.org/Agoric/SES-shim.svg?path=packages/compartment-shim
[deps-url]: https://david-dm.org/Agoric/SES-shim?path=packages/compartment-shim
[dev-deps-svg]: https://david-dm.org/Agoric/SES-shim/dev-status.svg?path=packages/compartment-shim
[dev-deps-url]: https://david-dm.org/Agoric/SES-shim?type=dev&path=packages/compartment-shim
[license-image]: https://img.shields.io/badge/License-Apache%202.0-blue.svg
[license-url]: LICENSE
