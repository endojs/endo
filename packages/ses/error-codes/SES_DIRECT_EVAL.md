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

It seems your CSP allows execution of `eval()`, try setting `hostEvaluators` to `all` or `no-direct`.

# `"hostEvaluators" was set to "no-direct", but direct eval is functional

If evaluators are working, if seems you've upgraded host to a version that now supports them (future Hermes).
