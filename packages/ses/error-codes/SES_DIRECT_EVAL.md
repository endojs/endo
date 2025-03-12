# SES cannot initialize unless 'eval' is the original intrinsic 'eval', suitable for direct eval (dynamically scoped eval) (`SES_DIRECT_EVAL`)

The SES Hardened JavaScript shim captures the `eval` function when it is
initialized.
The `eval` function it finds must be the original `eval` because SES uses its
dynamic scope to implement its isolated eval.

If you see this error, something running before `ses` initialized, most likely
another instance of `ses`, has replaced `eval` with something else.

If you're running under an environment that doesn't support direct eval (Hermes),
try setting `hostEvaluators` to `no-direct`.

If you're running under CSP, try setting `hostEvaluators` to `none`.

# 'hostEvaluators' was set to 'all', but the Function() constructor and eval() are not allowed to execute (SES_DIRECT_EVAL)

The default option 'all' expects all evaluators to be allowed to execute, but they seem blocked.

If you're running under CSP, try setting `hostEvaluators` to `none`.

# 'hostEvaluators' was set to 'none', but the Function() constructor or eval() are allowed to execute (SES_DIRECT_EVAL)

You indicated that you expected evaluators to be blocked (e.g. by Content Security Policy),
but they actually work. It's either a misunderstanding of `hostEvaluators` option or whatever
method was used to block evaluators no longer works.

# 'hostEvaluators' was set to 'no-direct', but direct eval is available (SES_DIRECT_EVAL)

If evaluators are working, including direct eval, it seems you've upgraded to a version of 
the host environment that now supports them (future Hermes). Or you're running code intended
for Hermes in a different host.

# 'hostEvaluators' was set to 'no-direct', but all evaluators seem blocked (SES_DIRECT_EVAL)

You indicated that you expected a host with only indirect eval available (Hermes), but
all evaluators appear to be blocked.

If you're running under CSP, try setting `hostEvaluators` to `none`.
