// Marker class for objects to be exported by reference rather than by value.
//
// Cap'n Web compatibility: instances of `RpcTarget` (or any subclass) are
// always sent over the wire as ["export", id], not by-value-recursing through
// their own properties.
//
// Endo-style remotables (`Far(...)`, `Remotable(...)`) are also recognised by
// the devaluator and treated identically; the choice is just a matter of
// taste.

import harden from '@endo/harden';

export class RpcTarget {}
harden(RpcTarget);
