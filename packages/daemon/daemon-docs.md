# `@endo/cli`

### `endo start`

- starts the Endo daemon, a background process that supervises Endo extensions.

### `endo bundle`

- creates a JSON bundle containing an archive for an entry module path.

### `endo store`

- stores a readable file within a user's [pet-store](./src/pet-store.js).

### `endo list`

- returns a list of pet names that currently exist within a user's [pet-store](./src/pet-store.js).

### `endo stop`

- gracefully shuts down the Endo daemon and all running extensions.

### `endo reset`

- resets the Endo daemon’s persistent state to “factory defaults”.

### `endo restart`

- shorthand method for executing `endo stop && endo start`.

### `endo follow`

- follows an async iterable, printing each value as it arrives.

### `endo cat`

- prints the contents of a readable file that exists within a user's [pet-store](./src/pet-store.js).

### `endo show`

- prints the named value of an item that exists within a user's [pet-store](./src/pet-store.js).

### `endo rename`

- changes the name of value that exists within a user's [pet-store](./src/pet-store.js).

### `endo remove`

- removes a value from a user's [pet-store](./src/pet-store.js).

### `endo inbox`

- prints pending requests that have been sent to a user's endo instance.

### `endo resolve`

- responds to a pending request with a named value.

### `endo reject`

- responds to a pending request with a rejection message.

### `endo spawn`

- creates a worker which can be used to evaluate or import code.

### `endo where`

- prints paths for state, logs, caches, socket, and pids.

# `@endo/daemon`

The Endo Daemon allows us to bootstrap extensions confined under the Principle of Least Authority (or [POLA](https://en.wikipedia.org/wiki/Principle_of_least_privilege)) at the deepest level of granularity. In the case of an Endo extension, the deepest level of granularity refers to the lexical environment of each object that exists within the system. This is otherwise known as the "object level".

Endo's approach differs from systems that seek to enforce security at the "application level". Confinement at application-level requires an attacker to bypass just one-level of a program in order to successfully gain access to all of the powers that it holds. Confinement at the object-level forces the attacker to break the security of each object directly to successfully gain access to all of the powers that a program requires to operates.

## Endo as a Powerbox

Endo makes use of the Powerbox pattern[^1]. By employing this pattern, Endo acts as a mediator between all of the objects in a system, past, present, and future, and the powers that an application may ever need in order to operate.

> **The powerbox is a composition of objects that grants, revokes, negotiates, and in general manages, the authorities granted to another object.** - _How Emily Tamed the Caml_

At the heart of the Endo Powerbox (and all programs that implement the powerbox pattern) is a `main` module for ensuring that each object is given the permissions that it needs to function properly. If implemented correctly, then the `main` module will hand out to each module **just enough authority to do the job needed by that particular module.**

### Endo as a powerbox for Node.js Applications

There shape of an extension's `main` module depends entirely upon the requirements of _that_ extension. There is no notion of one-size-fits-all. It is more akin to a build-a-bear factory. Instead of a stuffed animal, we are constructing a `main` using whatever built-in modules an extension requires so that it can adequately fulfill its role of providing permissions to objects that it is introduced to so that they may function properly.

In order for the Endo daemon to fulfill its requirements, it's main module is constructed using the following built-in modules from Node.js:

- `crypto`
- `net`
- `fs`
- `path`
- `popen`
- `url`

These powers are referred to as the `DaemonicPowers` as they are the powers required in order for the Endo daemon to operate. (See [types.d.ts](./src/types.d.ts#L46))

## Exports

### `makeEndoBootstrap`

### `start`

- Initializes setup of the initial process for creating Endo new extensions and communicating across existing Endo extensions. This includes establishing an ipc channel which Endo applications can use to establish a connection `makeEndoClient` to create a new connection.

### `makeEndoClient`

- Used to spin up a new application within the context of an Endo daemon.
- The processess created with `makeEndoClient` come pre-assembled with the ability to communicate over CapTP using Node.js-based messages.
- Utilizes the global `net` package to create a socket connection for an Endo process. (`net.connect(sockPath)`)

### `terminate`

- creates a new endo client using [makeEndoClient](#makeendoclient) for the sole purpose of gaining access to the `terminate` method.
- Uses `terminate` in order to sever any existing connections.
- takes one argument, `locator`. If nothing is passed in, this defaults to [`defaultLocator`](#defaultlocator).

### `clean`

- recursively and forcibly removes any directories that have been created throughout the lifecycle of the previous Endo daemon.
- takes one argument, `locator`. If nothing is passed in, this defaults to [`defaultLocator`](#defaultlocator).

### `stop`

- terminates any existing Endo daemon processess.

### `defaultLocator`

- See [@endo/where](https://github.com/endojs/endo/tree/master/packages/where#where-is-endo)

# Questions

## CLI

- In what scenarios would it be applicable to execute `endo store` without using the `--name` option? It's my under

- after coming across the term "noncelocator" a number of times while reading erights.org, I'm wondering what is the locator within the context of SwingSet?

[^1]: See The Powerbox Pattern from _[How Emily Tamed the Camel](https://www.hpl.hp.com/techreports/2006/HPL-2006-116.html)_
