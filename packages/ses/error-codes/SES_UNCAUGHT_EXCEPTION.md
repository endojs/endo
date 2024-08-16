# Error output beginning with `SES_UNCAUGHT_EXCEPTION:`

The SES shim provides options for management of exceptions that are not caught by any user code.

This behavior is configured by calling `lockdown` with the [errorTrapping][] option.  If that option is explicitly set to `'none'`, the platform's default error trap remains in effect.

Otherwise, when thrown exceptions have no `catch` handler, the SES shim will print `SES_UNCAUGHT_EXCEPTION: exception...` to the error console.  In that case, `exception...` is the thrown exception, augmented with causal error information when possible.

For most programs, the error console is intended for human consumption, and so the `SES_UNCAUGHT_EXCEPTION:` output can be useful in giving a clue as to the source of a failure.

[errorTrapping]: ../docs/lockdown.md#errortrapping-options
