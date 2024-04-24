# Unexpected `Error` own `stack` accessor property (`SES_UNEXPECTED_ERROR_OWN_STACK_ACCESSOR`)

## Background

Some non-standard implementations of errors have idiosyncratic unsafety problems that need idiosyncratic solutions, so the ses-shim can only repair the safety problems that fit into the categories it knows about.

Firefox/SpiderMonkey, Moddable/XS, and the [Error Stack proposal](https://github.com/tc39/proposal-error-stacks/issues/26) all agree on the safest behavior, to have an `Error.prototype.stack` accessor property that is inherited by error instances, enabling an initial-load library like the ses-shim to virtualize this behavior across all errors.

Safari/JSC and v8 up through Node 20 both had this appear as an own data property on error instances. This was safe enough for integrity purposes. In addition, v8 has magic error-stack initialization APIs that enabled us to hide the stack for confidentiality and determinism purposes.

Starting with the v8 of Node 21, v8 makes a per-instance `stack` own accessor property. Fortunately, for all errors in the same realm, all their `stack` own properties use the same getter, and they all use the same setter. This enables the [ses-shim to repair](https://github.com/endojs/endo/pull/2232) some of their safety problems.

## What this diagnostic means

Before doing the v8 repair described above, we first do a sanity check that we're on a platform that misbehaves in precisely this way. If we see that error instances are both with own accessor `stack` properties that fail this sanity check, then we have encountered another idiosyncratic that we're not yet prepared for and do not yet know how to secure. In that case, ses-shim initialization should fail with this diagnostic.

If you see this diagnostic, PLEASE let us know, and let us know what platform (JavaScript engine and version) you saw this on. Thanks!

## See

Root cause at https://chromium-review.googlesource.com/c/v8/v8/+/4459251

First reported at https://github.com/tc39/proposal-error-stacks/issues/26#issuecomment-1675512619

v8 issue at https://issues.chromium.org/issues/40279506

Endo issue at https://github.com/endojs/endo/issues/2198

Endo workaround at https://github.com/endojs/endo/pull/2232
