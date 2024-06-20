# Promise Kit

The promise-kit package provides a simple abstraction for creating and managing a promise. It exports, `makePromiseKit` which is a utility function used to create a Promise and its associated resolver and rejector functions. This is particularly useful in asynchronous programming, where you might need to create a promise and resolve or reject it at a later point in time.
Note that this serves as a "ponyfill" for `Promise.withResolvers`, making certain accommodations to ensure that the resulting promises can pipeline messages through `@endo/eventual-send`.

## Usage

Here’s an example of how `makePromiseKit` might be used in an Agoric smart contract or JavaScript program:

### Basic Example

```javascript
import { makePromiseKit } from '@endo/promise-kit';

function asyncOperation() {

  const { promise, resolve, reject } = makePromiseKit();
  setTimeout(() => {
    const success = true; // Simulating success or failure
    if (success) {
      resolve("Operation successful!");
    } else {
      reject("Operation failed!");
    }
  }, 2000); 

  return promise;
}

async function handleAsyncOperation() {
  try {
    const result = await asyncOperation();
    console.log(result); // "Operation successful!"
  } catch (error) {
    console.error(error); // "Operation failed!"
  }
}

handleAsyncOperation();
```

### Creating Multiple Promise Kits

You can create multiple promise kits for managing various asynchronous tasks.

```javascript
const kit1 = makePromiseKit();
const kit2 = makePromiseKit();

kit1.promise.then(value => console.log('Kit 1 resolved with:', value));
kit2.promise.then(value => console.log('Kit 2 resolved with:', value));

kit1.resolve('First success');
kit2.resolve('Second success');

```

## API

### `makePromiseKit()`
Creates a new promise kit.

**Returns**
- **`promise`**: The promise object.
- **`resolve`**: The resolve function for the promise.
- **`reject`**: The reject function for the promise.

## Links
[Repository](https://github.com/endojs/endo/tree/master/packages/promise-kit)

## License
This package is licensed under the Apache-2.0 License.