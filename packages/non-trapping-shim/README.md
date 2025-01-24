# Opt-in Shim for Non-trapping Integrity Trait

Emulates support for the non-trapping integrity trait from the
[Stabilize proposal](https://github.com/tc39/proposal-stabilize).

A *shim* attempts to be as full fidelity as practical an emulation of the proposal itself. This is sometimes called a "polyfill". A *ponyfill* provides the functionality of the shim, but sacrifices fidelity of the API in order to avoid monkey patching the primordials. Confusingly, this is also sometimes called a "polyfill", which is why we avoid that ambiguous term.

A shim typically "exports" its functionality by adding properties to primordial objects. A ponyfill typically exports its functionality by explicit module exports, to be explicitly imported by code wishing to use it.

This package is currently organized internally as a ponyfill, and a shim based on that ponyfill. But it no longer exports the ponyfill, as the [eval twin problems](https://github.com/endojs/endo/issues/1583) for using the ponyfill are fatal.

See https://github.com/endojs/endo/blob/master/packages/ses/docs/preparing-for-stabilize.md for guidance on how to prepare for the changes that will be introduced by this proposal.

## Opt-in env-option `SES_NON_TRAPPING_SHIM`

To cope with various compat problems in linking code that uses or assumes this shim to code that does not, we have made this shim opt-in via the env-option `SES_NON_TRAPPING_SHIM`. This has two settings, `'enabled'` and the default `'disabled'`. As with all env options, this is represented at the property `process.env.SES_NON_TRAPPING_SHIM`, which typically represents the environment variable `SES_NON_TRAPPING_SHIM`. Thus, if nothing else sets `process.env.SES_NON_TRAPPING_SHIM`, you can opt-in at the shell level by
```sh
$ export SES_NON_TRAPPING_SHIM=enabled
```

When not opted into, importing the shim has no effect.
