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

## Tor netlayer (experimental)

This package currently ships an implementation-oriented Tor netlayer constructor
at `src/netlayers/tor.js`, designed to be compatible with Spritely Goblins'
Guile onion netlayer conventions.

```js
import { makeTorNetLayer } from '@endo/ocapn/src/netlayers/tor.js';

await client.registerNetlayer((handlers, logger) =>
  makeTorNetLayer({
    handlers,
    logger,
    controlSocketPath: '~/.cache/ocapn/tor/tor-control-sock',
    socksSocketPath: '~/.cache/ocapn/tor/tor-socks-sock',
    // optional when restoring a stable onion identity:
    // privateKey: 'ED25519-V3:...',
    // serviceId: '<56-char-onion-service-id>',
  }),
);
```

`makeTorNetLayer` currently follows these interoperability defaults:

- transport: `onion`
- location URI shape: `ocapn://<service-id>.onion`
- Tor command: `ADD_ONION ... PORT=9045,unix:<local-ocapn-socket>`
- outgoing dial target: `<service-id>.onion:9045` via SOCKS5

### Tor daemon setup

The recommended daemon model is one Tor process "as your user", shared by
multiple local OCapN peers (Endo, Goblins, test clients, etc.).

Example `tor` config:

```txt
DataDirectory /home/<user>/.cache/ocapn/tor/data/
SocksPort unix:/home/<user>/.cache/ocapn/tor/tor-socks-sock RelaxDirModeCheck
ControlSocket unix:/home/<user>/.cache/ocapn/tor/tor-control-sock RelaxDirModeCheck
Log notice file /home/<user>/.cache/ocapn/tor/tor-log.txt
```

Create state directory and run Tor:

```sh
mkdir -p ~/.cache/ocapn/tor/data
tor -f ~/.config/ocapn/tor-config.txt
```

For Goblins interop, you can point `controlSocketPath` and `socksSocketPath`
at Goblins' defaults (for example `~/.cache/goblins/tor/*`) so both stacks
share a single daemon.

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
