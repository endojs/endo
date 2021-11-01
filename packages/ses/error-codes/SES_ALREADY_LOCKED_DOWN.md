# Already locked down (`SES_ALREADY_LOCKED_DOWN`)

Lockdown can only be applied once.
The error code `SES_ALREADY_LOCKED_DOWN` should appear twice whenever it is
raised, to indicate the call sites for the first and second occasion Lockdown
was called.

```
(TypeError#1)
TypeError#1: Already lockded down (SES_ALREADY_LOCKED_DOWN)

  at repairIntrinsics
  at lockdown
  at example.js:2:1

TypeError#1 ERROR_NOTE: Prior call (TypeError#2)
Nested error under TypeError#1
  TypeError#2: Prior lockdown (SES_ALREADY_LOCKED_DOWN)

    at repairIntrinsics
    at lockdown
    at example.js:1:1
```

## Mitigation

Remove all calls to Lockdown except one.
Generally, the earliest call is the best, so removing the call from this
error's stack trace should suffice, or at least reveal the next redundant
Lockdown.
Be sure not to remove all calls to Lockdown!

## Related

This error is distinct from `SES_MULTIPLE_INSTANCES`, which attempts to
distinguish the case where Lockdown functions initialized by different
instances of the SES shim were both called.
In this case, Lockdown detects the other's behavior by its impact on the
environment.
