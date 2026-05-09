# @endo/ocapn-simulator

A browser-based playground for experimenting with promise-shortening
scenarios on top of `@endo/ocapn`. Each "client" runs in its own web
worker, hosting a real `@endo/ocapn` client wired to a custom
`MessagePort`-based netlayer with simulated latency.

This package is **private** to the workspace and is not published to
npm. It exists to make the `op:flush` / `op:flush-done` proposal
concrete: you can watch the export tables, kick off forwarder chains,
and manually trigger flushes that mirror what an automatic shortening
implementation would do.

## Quick start

From the workspace root:

```sh
yarn install
yarn workspace @endo/ocapn-simulator dev
```

Vite will print a local URL (typically `http://localhost:5173`).

To produce a production bundle:

```sh
yarn workspace @endo/ocapn-simulator build:bundle
```

The package's plain `build` script is intentionally a no-op (Vite 7
requires Node 20.19+; the workspace-wide `yarn build` in CI runs on
Node 18 too).

## Layout

```
packages/ocapn-simulator/
  index.html
  package.json
  vite.config.js
  src/
    main.js                page bootstrap
    sim-controller.js      worker pool, viz state, UI wiring
    bridge.js              brokers MessagePort pairs between workers
    visualization.js       SVG rendering of clients/sessions/flow
    sim-netlayer.js        custom netlayer (transport: 'simworker')
    worker.js              per-worker entry: SES, ocapn client, Forwarder
    styles.css
    shims/
      node-crypto.js       browser shim for `node:crypto`
```

## Wire protocol with the worker

Each worker hosts one `@endo/ocapn` client. The main thread brokers
`MessagePort` pairs in response to the worker's outgoing connections:

```
worker → main : { type: 'sim/connect', toDesignator }
main   → worker (peer A) : { type: 'sim/outgoing-port', toDesignator, port }
main   → worker (peer B) : { type: 'sim/incoming-port', peerDesignator, port }
```

After that, the two ports carry application bytes
(`{ kind: 'data', bytes }`) directly, with each side's netlayer
applying the user-configured per-write latency.

## Visualization

- One circle per worker, labelled with the first hex bytes of its
  designator.
- A solid edge between two circles means an active OCapN session
  (the workers have completed handshake; the export tables on each
  side hold at least the bootstrap plus one additional reference once
  any forward traffic begins).
- Dashed = idle session, solid blue = recent forward traffic.
- The blue ring on a node = currently busy serving or initiating
  a `forward(N)`.
- Small dots animate from sender to receiver each time a `forward`
  call is dispatched.

## Controls

- **Restart** — tear down all workers and bring up a fresh ring.
- **Kick off random chain** — pick a random worker and call its
  local `forward(<length>)`.
- **Flush a random imported promise** — pick a random worker that
  has at least one `desc:import-promise` open and invoke the debug
  `flushExport()` on it. The exporter swaps in a fresh local promise
  at that slot and replies with `op:flush-done`. This is the same
  primitive that a future shortening implementation would invoke
  automatically as part of a 3PH; here it's exposed manually so you
  can watch the table replacement happen.

## Browser compatibility

`@endo/ocapn`'s cryptography module imports `randomBytes` from
`node:crypto`. The simulator aliases that to `src/shims/node-crypto.js`
through Vite's `resolve.alias` so the package can run unmodified in the
browser.

## Known limitations

- The `flushExport` API is part of the prototype branch's debug
  surface; the simulator probes positions `p-0` through `p-63` to find
  candidates rather than iterating the export table, since the public
  `OcapnTable` doesn't expose iteration.
- The "exports beyond bootstrap" indicator is approximated from the
  active-session reports a worker emits on a 500 ms timer; visually
  it lags real-time table changes.
- This is a prototype to make the proposal concrete; it is not a
  conformance test for the spec.
