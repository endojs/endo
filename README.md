# Secure EcmaScript (SES)

[![Build Status][ci-svg]][ci-url]
[![dependency status][deps-svg]][deps-url]
[![dev dependency status][dev-deps-svg]][dev-deps-url]
[![License][license-image]][license-url]

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
https://rawgit.com/Agoric/SES/master/demo/ for a demo.

Derived from the Caja project, https://github.com/google/caja/wiki/SES .

Still under development: do not use for production systems yet, there are
known security holes that need to be closed.

Incorporates (as a dependency) the [Realms shim](https://github.com/Agoric/realms-shim), which is a TC39 proposal spec here:
https://github.com/tc39/proposal-realms .

### Install

`npm install`
`npm run build`

Run the test suite

`npm test`

### Bug Disclosure

Please help us practice coordinated security bug disclosure, by using the
instructions in
[SECURITY.md](https://github.com/Agoric/SES/blob/master/SECURITY.md)
to report security-sensitive bugs privately.

For non-security bugs, please use the [regular Issues
page](https://github.com/Agoric/SES/issues).


<!-- [![Coverage Status][coveralls-svg]][coveralls-url] -->

[ci-svg]: https://circleci.com/gh/Agoric/SES.svg?style=svg
[ci-url]: https://circleci.com/gh/Agoric/SES
[coveralls-svg]: https://coveralls.io/repos/github/Agoric/SES/badge.svg
[coveralls-url]: https://coveralls.io/github/Agoric/SES
[deps-svg]: https://david-dm.org/Agoric/SES.svg
[deps-url]: https://david-dm.org/Agoric/SES
[dev-deps-svg]: https://david-dm.org/Agoric/SES/dev-status.svg
[dev-deps-url]: https://david-dm.org/Agoric/SES?type=dev
[license-image]: https://img.shields.io/badge/License-Apache%202.0-blue.svg
[license-url]: shim/LICENSE
