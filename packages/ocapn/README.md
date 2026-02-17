# `@endo/ocapn`

A tentative implementation of the [OCapN][] (Object Capability Network)
protocol for Hardened JavaScript.
The OCapN specification remains a moving target and this package provides few
guarantees of future compatibility.
This is a testbed for building specification consensus and early discovery
of specification questions.

## Overview

OCapN is a protocol for secure distributed object programming.
It enables networked programming with the convenience of calling methods on
remote objects, much like local asynchronous programming.

This package provides:

- **CapTP**: The Capability Transport Protocol, the core message-passing
  layer of OCapN.
  See also the related [`@endo/captp`](../captp/README.md) package for a
  minimal CapTP implementation.
- **Syrup codec**: Encode and decode [Syrup][], the canonical binary
  serialization format tentatively used by OCapN.
- **Netlayer interface**: An abstraction for transport layers, allowing CapTP
  to operate over various network protocols.
- **Third-party handoffs**: Cryptographic mechanisms for securely transferring
  object references between peers.

For more information about the protocol, see [ocapn.org][OCapN].

## Status

This package is a work in progress and is not yet published to npm.
The API is subject to change.

## Syrup Encoding

[Syrup][] is a binary serialization format tentatively used by OCapN for encoding
messages.
This package includes a partial implementation that is strictly canonical and
limited to forms needed to express the passable value model.

Supported types:

| Syrup Type | JavaScript Type | Encoding |
|------------|-----------------|----------|
| Boolean | `true`, `false` | `t`, `f` |
| Integer | `bigint` | `0+`, `1-`, etc. |
| Double | `number` | `D` + 8 bytes IEEE 754 |
| Bytestring | `Uint8Array` | `3:cat` |
| String | `string` | `3"cat` |
| List | `Array` (frozen) | `[` ... `]` |
| Dictionary | `Object` (frozen) | `{` ... `}` |

Look to the [Syrup codec
README](https://github.com/endojs/endo/blob/master/packages/ocapn/src/syrup/README.md)
for implementation details and limitations.

## Architecture

The package is organized in layers, from high to low:

1. **Client** (`src/client/`): Session management, handoffs, sturdy references
2. **CapTP** (`src/captp/`): Message dispatch and slot management
3. **Codecs** (`src/codecs/`): Syrup encoding, descriptors, and operations
4. **Netlayer** (`src/netlayers/`): Network and transport abstraction

## Related Packages

- [`@endo/captp`](../captp/README.md): A minimal CapTP implementation using
  JSON encoding, suitable for simpler use cases.
- [`@endo/marshal`](../marshal/README.md): Serialization of passable objects.
- [`@endo/eventual-send`](../eventual-send/README.md): The `E()` proxy for
  asynchronous message passing.
- [`@endo/ocapn-noise`](../ocapn-noise/README.md): Cryptographic utilities
  for an OCapN network based on [Noise Protocol][].

## License

[Apache-2.0](./LICENSE)

[OCapN]: https://ocapn.org
[Syrup]: https://github.com/ocapn/syrup
[Noise Protocol]: https://noiseprotocol.org/
