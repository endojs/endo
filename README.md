# Secure EcmaScript Shim (ses-shim)
[![npm version][npm-svg]][npm-url]
[![build status][ci-svg]][ci-url]
[![contributing][contributing-svg]][contributing-url]
[![license][license-image]][license-url]

Secure EcmaScript (SES) is an execution environment which provides fine-grained sandboxing via Compartments.

* **Compartments** Compartments are separate execution contexts: each one has its own global object and global lexical scope.
* **Frozen realm** Compartments share their intrinsics to avoid identity discontinuity. By freezing the intrinsics, SES removes programs abilities to interfere with each other.
* **Strict mode** SES enables JavaScript strict mode which enhances security, for example by changing some silent errors into throw errors.
* **POLA** (Principle of Least Authtorithy) By default, Compartments received no ambient authorthy. They are created without host-provided APIs, (for example no XMLHttpRequest).

[Learn about the SES specification](https://github.com/tc39/proposal-ses).

[Learn how to use SES in your own project](https://ses-secure-ecmascript.readthedocs.io/en/latest).

## Installation

## Documentation

## Examples

## Contributing

### Bug Disclosure

Please help us practice coordinated security bug disclosure, by using the instructions in our [security guide](./SECURITY.md) to report security-sensitive bugs privately.

For non-security bugs, please use the [regular Issues
page](https://github.com/Agoric/ses-shim/issues).

### License

SES is [Apache 2.0 licensed][license-url].

[npm-svg]: https://img.shields.io/npm/v/ses.svg?style=flat
[npm-url]: https://www.npmjs.com/package/ses
[ci-svg]: https://circleci.com/gh/Agoric/ses-shim.svg?style=svg
[ci-url]: https://circleci.com/gh/Agoric/ses-shim
[contributing-svg]: https://img.shields.io/badge/PRs-welcome-brightgreen.svg
[contributing-url]: ./CONTRIBUTING.md
[license-image]: https://img.shields.io/badge/License-Apache%202.0-blue.svg
[license-url]: ./LICENSE
