# Harden

The `harden` package has been deprecated.
Please use the shim for `harden` provided [SES][].

SES: https://github.com/Agoric/SES-shim/blob/master/packages/ses/README.md#harden

Since calling `harden` before `lockdown` provides no security guarantees, and
since a single `harden` should be shared throughout a realm, SES now provides
this singleton and exposes it globally.

The last coherent version of `harden`, prior to deprecation, was version
`0.0.8`.
