# intrinsics

This package provides a snapshot of intrinsics needed by [`ses`][SES] and its
components.
Importing `@endo/intrisnics` early reduces the ways that modules evaluated
between `ses` and calling `lockdown` can interfere with the designed behavior
of HardenedJS.
We consider these "vetted shims" to be inside the Trusted Compute Base of
`ses`, but as they would not be in a position to interfere with a native
implementation of SES by replacing or altering Realm intrinsics, we strive to
emulate that resilience by capturing necessary intrinsics early and avoiding
the use of JavaScript protocols (like iteration protocol) that a vetted shim
could intercept.

[SES]: https://github.com/endojs/endo/tree/master/packages/ses
