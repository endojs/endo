# Evaluator Shim
[![Build Status][circleci-svg]][circleci-url]
[![Coverage Status][coveralls-svg]][coveralls-url]
[![dependency status][deps-svg]][deps-url]
[![dev dependency status][dev-deps-svg]][dev-deps-url]
[![License][license-image]][license-url]

This folder contains a shim implementation of the [Evaluator API Proposal]().

## Motivation

Compartment can improve on security by enabling the application of the
[Principle Of Least Authority (POLA)](https://medium.com/agoric/pola-would-have-prevented-the-event-stream-incident-45653ecbda99).

Compartments can be created with the minimum access to globals and to modules (i.e. authority) required by the code executing in them.

Compartments have several advantages over root realms:
- because same set of intrinsics are shared between them, they don't suffer from the problem of identity discontinuity that occur between different root realms.
- lighter JavaScript engines like XS from Moddable don't expose a mechanism to create a fresh new set of intrinsics (an iframe in a browser, or a vm in node) and root realms cannot be created.

## Implementation

This code is a subset and simplification of the original realm shim.

## Requirements

In order to endow an evaluator with powerful objects, those powers need to be attenuated. This requires third party code.

## Limitations

The current implementation has 4 main limitations:

* All code evaluated inside an evaluator runs in strict mode.
* Direct eval is not supported.
* Modules and imports are not supported.
* `let`, global function declarations and any other feature that relies on new bindings in global contour are not preserved between difference invocations of eval, instead we create a new contour every time.

## Open Questions

n/a

## Building the Shim

```bash
git clone https://github.com/Agoric/evaluator-shim.git
cd evaluator-shim
npm install
npm run build
```

This will install the necessary dependencies and build the shim locally.

## Demo

To open the playground example in your default browser:

```bash
npm run build
open demo/index.html
```

## Usage

### Script

To use the shim in a webpage, build the shim, then:

```html
  <script src="./dist/evaluator-shim.umd.min.js"></script>
  <script>
    const r = new Compartment();
    [...]
  </script>
```

### CommonJS Module

To use the shim with node, build the shim, then:
```js
  const Compartment = require('./dist/evaluator-shim.cjs.js');
  const r = new Compartment();
  [...]
```

### Native ES6 Module Support

To use the shim with node with native ESM6 module support, build the shim, then:
```js
  import Compartment from './dist/realms-shim.esm.js';  
  const r = new Compartment();
  [...]
```

### ES6 Module via esm

You can also use the ES6 module version of the Compartments shim in Node.js via the package `esm`. To do that, launch node with esm via the "require" option:

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

### Example 1: Compartment

To create one evaluator with a new global object and shared intrinsics with the current realm.

```js
const e = new Evaluator();
e.global === global; // false
e.global.JSON === JSON; // true
```

### Example 2: Two Evaluators

To create two evaluators each with a new global object and shared intrinsics between them and with the current realm.

```js
const e1 = new Evaluator();
const e2 = new Evaluator();
e1.global === e2.global; // false
e1.global.JSON === e2.global.JSON; // true
```

## Bug Disclosure

Please help us practice coordinated security bug disclosure. If you find a security-sensitive bug that should not be revealed publically until a fix is available, please send email to `security` at (@) `agoric.com`. To encrypt, please use my (@warner) personal GPG key [A476E2E6 11880C98 5B3C3A39 0386E81B 11CAA07A](http://www.lothar.com/warner-gpg.html) . Keybase users can also send messages to `@agoric_security`, or share code and other log files via the Keybase encrypted file system (`/keybase/private/agoric_security,$YOURNAME`). We will create a github security advisory and add you to the collaborator list.

For non-security bugs, use the
[regular Issues page](https://github.com/Agoric/evaluator-shim/issues).

[circleci-svg]: https://circleci.com/gh/Agoric/evaluator-shim.svg?style=svg
[circleci-url]: https://circleci.com/gh/Agoric/evaluator-shim
[coveralls-svg]: https://coveralls.io/repos/github/Agoric/evaluator-shim/badge.svg
[coveralls-url]: https://coveralls.io/github/Agoric/evaluator-shim
[deps-svg]: https://david-dm.org/Agoric/evaluator-shim.svg
[deps-url]: https://david-dm.org/Agoric/evaluator-shim
[dev-deps-svg]: https://david-dm.org/Agoric/evaluator-shim/dev-status.svg
[dev-deps-url]: https://david-dm.org/Agoric/evaluator-shim?type=dev
[license-image]: https://img.shields.io/badge/License-Apache%202.0-blue.svg
[license-url]: LICENSE
