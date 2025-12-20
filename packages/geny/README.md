# @endo/geny

OCapN host for spawning and managing child processes with capability-based
security.

## Overview

`@endo/geny` provides a host that can spawn OCapN child processes and
communicate with them using the OCapN protocol. Each child process exposes a
control object that allows the parent to:

- Shut down the child process
- Evaluate code in a compartment with `E` and `Far` exposed
- Pass Passable data as endowments to evaluated code

## Usage

### Spawning a child

```js
import { makeGenyHost } from '@endo/geny';

const host = await makeGenyHost();

// Spawn a child process
const child = await host.spawn();

// Evaluate code in the child's compartment
const counter = await child.control.eval(
  `
  Far('counter', {
    value: 0,
    increment() { return ++this.value; },
    getValue() { return this.value; },
  })
`,
  {},
);

// Use the returned object
await E(counter).increment();
const value = await E(counter).getValue();
console.log(value); // 1

// Shut down the child
await child.control.shutdown();

// Shut down the host
host.shutdown();
```

### Passing endowments

You can pass Passable data (including Far objects) as endowments:

```js
const result = await child.control.eval(
  `
  async () => {
    const value = await E(endowments.counter).getValue();
    return value * 2;
  }
`,
  { counter: someRemoteCounter },
);
const doubled = await result();
```
