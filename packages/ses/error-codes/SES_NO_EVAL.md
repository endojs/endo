# SES is disallowing eval in the current compartment (`SES_NO_EVAL`)

The SES Hardened JavaScript shim is configured to reject any source evaluation in the current compartment. This is configured in the `lockdown` option. To mitigate this error, change the [lockdown option `"evalTaming"`](../docs/lockdown.md) from `"noEval"` to either `"safeEval"` (default) or `"unsafeEval"`.
