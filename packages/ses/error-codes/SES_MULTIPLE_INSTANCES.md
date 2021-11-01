# Already locked down but not by this SES instance (`SES_MULTIPLE_INSTANCES`)

Lockdown can only be applied once.

In this case, Lockdown appears to have already been called,
from a cursory inspection of some of the effects of calling Lockdown.
That would suggest that there are multiple instances of the SES shim installed
or another module is behaving like Lockdown.

## Mitigation

* Remove all calls to Lockdown except one.
  Generally, the earliest call is the best, so removing the call from this
  error's stack trace should suffice, or at least reveal the next redundant
  Lockdown.
  Be sure not to remove all calls to Lockdown!
* If you do find that the error persists even with a single call to Lockdown,
  there may be other copies of Lockdown initialized in the same realm (iframe,
  VM context) or another library interfering with Lockdown by modifying the
  primordial environment in a similar way to Lockdown, like freezing shared
  primordials.

## Related

This error is distinct from `SES_ALREADY_LOCKED_DOWN`, which occurs in the
simpler case: a single Lockdown function was called twice.
