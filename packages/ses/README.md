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

### Install

`npm install`
`npm run build`

Run the test suite

`npm test`

### Bug Disclosure

Please help us practice coordinated security bug disclosure, by using the
instructions in
[SECURITY.md](https://github.com/Agoric/ses-shim/blob/master/SECURITY.md)
to report security-sensitive bugs privately.

For non-security bugs, please use the [regular Issues
page](https://github.com/Agoric/ses-shim/issues).

