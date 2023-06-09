# `@endo/cli`

### `endo start`

- executes [stop](#start) function definined within the `@endo/daemon`.

### `endo stop`

- executes [stop](#stop) function definined within the `@endo/daemon`.

### `endo clean`

- executes the [`clean`](#clean) function definined within the `@endo/daemon`.

### `endo restart`

- shorthand method for executing `endo stop`

# `@endo/daemon`

### `start`

- handles setup of the initial process for creating Endo applications, and communicating across
  which Endo applications can be created within. communicate.
- this includes establishing an ipc channel which Endo applications can use to establish a connection
  `makeEndoClient` to create a new connection.
- The powers accessible within this new context are:

  - `crypto`
  - `net`
  - `fs`
  - `path`
  - `popen`
  - `url`

- takes one argument, `locator`. If nothing is passed in, this defaults to [`defaultLocator`](#defaultlocator).

### `terminate`

- creates a new endo client using [makeEndoClient](#makeendoclient) for the sole purpose of gaining access to the `terminate` method.
- Uses `terminate` in order to sever any existing connections.
- takes one argument, `locator`. If nothing is passed in, this defaults to [`defaultLocator`](#defaultlocator).

```js
export const terminate = async (locator = defaultLocator) => {
  const { resolve: cancel, promise: cancelled } = makePromiseKit();
  const { getBootstrap, closed } = await makeEndoClient(
    'harbinger',
    locator.sockPath,
    cancelled,
  );
  const bootstrap = getBootstrap();
  await E(bootstrap)
    .terminate()
    .catch(() => {});
  // @ts-expect-error zero-argument promise resolve
  cancel();
  await closed.catch(() => {});
};
```

### `clean`

- recursively and forcibly removes any directories that have been created throughout the lifecycle of the previous Endo daemon.
- takes one argument, `locator`. If nothing is passed in, this defaults to [`defaultLocator`](#defaultlocator).

### `stop`

- terminates existing Endo daemon processess before calling [`clean`](#clean).
- takes one argument, `locator`. If nothing is passed in, this defaults to [`defaultLocator`](#defaultlocator).

### `makeEndoClient`

- Used to spin up a new application within the context of an Endo daemon.
- The processess created with makeEndoClient come pre-assembled with the ability to communicate over CapTP using Node.js-based messages.
- Utilizes the global `net` package to create a socket connection for an Endo process. (`net.connect(sockPath)`)

### defaultLocator

- default `locator` object which an Endo process will be initialized with.
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

# Questions

- the `main` function seems is where “all of it” starts.
- where does `main0` come from?
- Regarding the locator...
  - what is the difference between:
    - statePath
    - ephemeralStatPath
    - sockPath
    - cachePath
  - after coming across the term "noncelocator" a number of times while reading erights.org, I'm wondering what is the locator within the context of SwingSet?
- What is the significance of `child.on` within the endo daemon's `start` function? What exactly occurs when a “message” event occurs?
- What facets does `@endo/daemon` make accessible upon calling the `start` function?
- Confusion around the `bootstrap` object.
  - `makeMessagesCapTP`
    - This function takes a `bootstrap` object as an argument, which is then passed into `makeCapTP` in exchange for a few values, one of which being `getBootstrap`.
    - I'm trying to figure out how imports/exports of bootstrap objects work.
