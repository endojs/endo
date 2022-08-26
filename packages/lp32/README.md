# LP32

Also known as the web extension "Native Host Message" protocol, this package
implements async iterator streams for reading and writing with 32-bit
host-byte-order length-prefix message envelopes for binary data, represented
with Uint8Arrays.

These streams are "hardened" and depend on Hardened JavaScript.
Most JavaScript environments can be locked down with the
[SES shim](../ses/README.md).
