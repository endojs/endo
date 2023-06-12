# `@endo/daemon`

The Endo Daemon allows us to bootstrap systems in which POLA confinement can be accomplished at the deepest level of granularity. In the case of an Endo application, the deepest level of granularity refers to the lexical environment of each object that exists within the system. This is otherwise known as the "object level".

Endo's approach differs from systems that seek to enforce security at the "application level". Confinement at application-level requires an attacker to bypass just one-level of a program in order to successfully gain access to all of the powers that it holds. Confinement at the object-level forces the attacker to break the security of each object directly to successfully gain access to all of the powers that a program requires to operates.

## Endo as a Powerbox

Endo makes use of the Powerbox pattern[^1]. By employing this pattern, Endo acts as a mediator between all of the objects in a system, past, present, and future, and the powers that an application may ever need in order to operate.

> **The powerbox is a composition of objects that grants, revokes, negotiates, and in general manages, the authorities granted to another object.** - _How Emily Tamed the Caml_

At the heart of the Endo Powerbox (and all programs that implement the powerbox pattern) is a `main` module for ensuring that each object is given the permissions that it needs to function properly. If implemented correctly, then the `main` module will hand out to each module **just enough authority to do the job needed by that particular module.**

The following powers made accessible through Endo's `main` module:

- `crypto`
- `net`
- `fs`
- `path`
- `popen`
- `url`

## Exports

### `makeEndoBootstrap`

### `start`

- Initializes setup of the initial process for creating Endo applications and communicating across existing Endo applications. This includes establishing an ipc channel which Endo applications can use to establish a connection `makeEndoClient` to create a new connection.

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

- terminates existing Endo daemon processess before calling [`clean`](#clean).
- takes one argument, `locator`. If nothing is passed in, this defaults to [`defaultLocator`](#defaultlocator).

### `defaultLocator`

- Default `locator` object which an Endo process will be initialized with. On MacOS this is `/Users/<username>/Library/Application Support/Endo`
- See [@endo/daemon](https://github.com/endojs/endo/blob/master/packages/daemon/index.js#L26)

```js
const defaultLocator = {
  statePath: whereEndoState(process.platform, process.env, info),
  ephemeralStatePath: whereEndoEphemeralState(
    process.platform,
    process.env,
    info,
  ),
  sockPath: whereEndoSock(process.platform, process.env, info),
  cachePath: whereEndoCache(process.platform, process.env, info),
};
```

# `@endo/cli`

### `endo start`

- executes [stop](#start) function definined within the `@endo/daemon`.

### `endo stop`

- executes [stop](#stop) function definined within the `@endo/daemon`.

### `endo clean`

- executes the [`clean`](#clean) function definined within the `@endo/daemon`.

### `endo restart`

- shorthand method for executing `endo stop`

# Questions

- after coming across the term "noncelocator" a number of times while reading erights.org, I'm wondering what is the locator within the context of SwingSet?
- What is the significance of `child.on` within the endo daemon's `start` function? What exactly occurs when a “message” event occurs?

[^1]: See The Powerbox Pattern from _[How Emily Tamed the Camel](https://www.hpl.hp.com/techreports/2006/HPL-2006-116.html)_
