# `@endo/captp`

A minimal CapTP implementation leveraging Agoric's published modules.

## Usage

NOTE: `myconn` below is not part of the CapTP library, it represents a connection
object that you have created where `makeCapTP` is called on both sides of the
connection, passing in the function to send a JSON-able object on the connection, and returning
a `dispatch` function to receive a decoded JSON object from the connection.

```js
import { E, makeCapTP } from '@endo/captp';

// Create a message dispatcher and bootstrap.
// Messages on myconn are exchanged with JSON-able objects.
const { dispatch, getBootstrap, abort } = makeCapTP('myid', myconn.send, myBootstrap);
myconn.onReceive = obj => dispatch(obj);

// Get the remote's bootstrap object and call a remote method.
E(getBootstrap()).method(args).then(res => console.log('got res', res));

// Tear down the CapTP connection if it fails (e.g. connection is closed).
abort(Error('Connection aborted by user.'));
```

## Loopback

The `makeLoopback()` function creates an async barrier between "near" and "far"
objects.  This is useful for testing and isolation within the same address
space.

## TrapCaps

In addition to the normal CapTP facilities, this library also has the notion of
"TrapCaps", which enable a "guest" endpoint to call a "host" object (which may
resolve an answer promise at its convenience), but the guest synchronously
blocks until it receives the resolved answer.

This is a specialized and advanced use case, not for mutually-suspicious CapTP
parties, but instead for clear "guest"/"host" relationship, such as user-space
code and synchronous devices.

1. Supply the `trapHost` and `trapGuest` protocol implementation (such as the
   one based on `SharedArrayBuffers` in `src/atomics.js`) to the host and guest
   `makeCapTP` calls.
2. On the host side, use the returned `makeTrapHandler(target)` to mark a target
   as synchronous-enabled.
3. On the guest side, use the returned `Trap(target)` proxy maker much like
   `E(target)`, but it will return a synchronous result.  `Trap` will throw an
   error if `target` was not marked as a TrapHandler by the host.

To understand how `trapHost` and `trapGuest` relate, consider the `trapHost` as
a maker of AsyncIterators which don't return any useful value.  These specific
iterators are used to drive the transfer of serialized data back to the guest.

`trapGuest` receives arguments to describe the specific trap request, including
`startTrap()` which sends data to the host to perform the actual work of the
trap.  The returned (synchronous) iterator from `startTrap()` drives the async
iterator of the host until it fully transfers the trap results to the guest, and
the guest unblocks.

The Loopback implementation provides partial support for TrapCaps, except it
cannot unwrap promises.  Loopback TrapHandlers must return synchronously, or an
exception will be thrown.
