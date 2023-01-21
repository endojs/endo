# SES failed to initialize, sloppy mode (SES_NO_SLOPPY)

SES sources are ECMAScript modules and rely on the execution environment to
correctly impose strict mode. If you see this error, it is most likely that you
have used a tool that bundles SES, translating the modules into a single
JavaScript program/script, but failing to add a `'use strict'` pragma, or
appended the SES distribution bundle to another script that does not lead with
`'use strict'`.

We advise using `ses/dist/ses.cjs`, `ses.umd.js`, or `ses.umd.min.js` as a
script or module directly, without passing it through a bundler or transpiler
since any source-to-source transform may corrupt the security invariants that
SES attempts to impose. These build products have been generated using
a module-to-program transform designed for SES that preserves the validity
of the sources.
