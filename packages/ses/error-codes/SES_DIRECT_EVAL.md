# SES cannot initialize unless 'eval' is the original intrinsic 'eval', suitable for direct-eval (dynamically scoped eval) (`SES_DIRECT_EVAL`)

The SES Hardened JavaScript shim captures the `eval` function when it is
initialized.
The `eval` function it finds must be the original `eval` because SES uses its
dynamic scope to implement its isolated eval. 

If you see this error, something running before `ses` initialized, most likely
another instance of `ses`, has replaced `eval` with something else.
