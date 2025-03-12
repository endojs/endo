# SES cannot initialize unless 'eval' is the original intrinsic 'eval', suitable for direct-eval (dynamically scoped eval) (`SES_DIRECT_EVAL`)

The SES Hardened JavaScript shim captures the `eval` function when it is
initialized.
The `eval` function it finds must be the original `eval` because SES uses its
dynamic scope to implement its isolated eval.

If you see this error, something running before `ses` initialized, most likely
another instance of `ses`, has replaced `eval` with something else.

If you're running under an environment that doesn't support direct eval (Hermes), try setting `hostEvaluators` to `no-direct`.

If you're running under CSP, try setting `hostEvaluators` to `none`.

# _hostEvaluators_ was set to _none_, but evaluators are not blocked (`SES_DIRECT_EVAL`)

You indicated that you expected evaluators to be blocked (eg. by Content Security Policy) but they actually work. It's either a misunderstanding of `hostEvaluators` option or whatever method was used to block evaluators no longer works.

# `"hostEvaluators" was set to "no-direct", but direct eval is functional

If evaluators are working, including direct eval, it seems you've upgraded to a version of host environment that now supports them (future Hermes). Or you're running code intended for Hermes in a different host.
