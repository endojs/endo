# Secure EcmaScript (SES)

[![Build Status][travis-svg]][travis-url]
[![dependency status][deps-svg]][deps-url]
[![dev dependency status][dev-deps-svg]][dev-deps-url]
[![License][license-image]][license-url]

Secure EcmaScript is a frozen environment for running EcmaScript 'strict'
mode programs. These programs run without ambient authority in their global
scope, and add safe two-argument evaluator (`SES.confine(code, endowments)`)
to each realm. It runs atop an ES6-compliant platform, enabling safe
interaction of mutually-suspicious code, using object-capabilities.

See https://github.com/Agoric/TinySES to see how SES fits into the various
flavors of confined EcmaScript execution. And visit
https://rawgit.com/Agoric/SES/master/demo/ for a demo.

Derived from the Caja project, https://github.com/google/caja/wiki/SES .

Still under development: do not use for production systems yet, there are
known security holes that need to be closed.

Incorporates (as a git submodule) the Realms shim from
https://github.com/tc39/proposal-realms .

### Bug Disclosure

Despite this not being ready for production use, we'd like to get into the
practice of responsible disclosure. If you find a security-sensitive bug that
should not be revealed publically until a fix is available, please send email
to `security` at (@) `agoric.com`. To encrypt, please use my (@warner)
personal GPG key
[A476E2E6 11880C98 5B3C3A39 0386E81B 11CAA07A](http://www.lothar.com/warner-gpg.html)
.

For non-security bugs, use the
[regular Issues page](https://github.com/Agoric/SES/issues).


<!-- [![Coverage Status][coveralls-svg]][coveralls-url] -->

[travis-svg]: https://travis-ci.com/Agoric/SES.svg?branch=master
[travis-url]: https://travis-ci.com/Agoric/SES
[coveralls-svg]: https://coveralls.io/repos/github/Agoric/SES/badge.svg
[coveralls-url]: https://coveralls.io/github/Agoric/SES
[deps-svg]: https://david-dm.org/Agoric/SES.svg
[deps-url]: https://david-dm.org/Agoric/SES
[dev-deps-svg]: https://david-dm.org/Agoric/SES/dev-status.svg
[dev-deps-url]: https://david-dm.org/Agoric/SES?type=dev
[license-image]: https://img.shields.io/badge/License-Apache%202.0-blue.svg
[license-url]: shim/LICENSE
