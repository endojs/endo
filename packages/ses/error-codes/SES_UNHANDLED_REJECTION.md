# Error output beginning with `SES_UNHANDLED_REJECTION:`

The SES shim provides options for management of rejected promises that have not had a handler attached before the promise was garbage-collected.

This behavior is configured by calling `lockdown` with the [unhandledRejectionTrapping][] option.  If that option is explicitly set to `'none'`, the platform's default unhandled rejection trap remains in effect.

Otherwise, when unhandled rejections are detected, the SES shim will print `SES_UNHANDLED_REJECTION: reason...` to the error console.  In that case, `reason...` is the rejection reason, augmented with causal error information when possible.

For most programs, the error console is intended for human consumption, and so the `SES_UNHANDLED_REJECTION:` output can be useful in giving a clue as to the source of a failure.

[unhandledRejectionTrapping]: ../docs/lockdown.md#unhandledrejectiontrapping-options
