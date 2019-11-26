# `@agoric/captp`

A minimal CapTP implementation leveraging Agoric's published modules.

## Usage

NOTE: `myconn` below is not part of the CapTP library, it represents a connection
object that you have created where `makeCapTP` is called on both sides of the
connection, passing in the function to send a JSON-able object on the connection, and returning
a `dispatch` function to receive a decoded JSON object from the connection.

```js
import { E, makeCapTP } from '@agoric/captp';

// Create a message dispatcher and bootstrap.
// Messages on myconn are exchanged with JSON-able objects.
const { dispatch, getBootstrap, abort } = makeCapTP('myid', myconn.send, myBootstrap);
myconn.onReceive = obj => dispatch(obj);

// Get the remote's bootstrap object and call a remote method.
E(getBootstrap()).method(args).then(res => console.log('got res', res));

// Tear down the CapTP connection if it fails (e.g. connection is closed).
abort(Error('Connection aborted by user.'));
```
