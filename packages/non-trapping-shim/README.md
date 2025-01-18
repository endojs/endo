# Shim for Non-trapping Integrity Trait

Emulates support for the non-trapping integrity trait from the
[Stabilize proposal](https://github.com/tc39/proposal-stabilize).

A *shim* attempts to be as full fidelity as practical an emulation of the proposal itself. This is sometimes called a "polyfill". A *ponyfill* provides the functionality of the shim, but sacrifices fidelity of the API in order to avoid monkey patching the primordials. Confusingly, this is also sometimes called a "polyfill", which is why we avoid that ambiguous term.

A shim typically "exports" its functionality by adding properties to primordial objects. A ponyfill typically exports its functionality by explicit module exports, to be explicitly imported by code wishing to use it.

This package is currently organized internally as a ponyfill, and a shim based on that ponyfill. But it no longer exports the ponyfill, as the [eval twin problems](https://github.com/endojs/endo/issues/1583) for using the ponyfill are fatal.

See https://github.com/endojs/endo/blob/master/packages/ses/docs/preparing-for-stabilize.md for guidance on how to prepare for the changes that will be introduced by this proposal.

TODO: More explanation.
