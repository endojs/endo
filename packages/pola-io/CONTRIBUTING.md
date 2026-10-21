# Contributing

Thanks for your interest in improving `@endo/pola-io`! This package is early-stage, and there’s plenty of room to shape it.

## Code Quality & Testing

Check your contributions with:

```sh
yarn test
yarn lint
```

- **Code style**: Follow [`@endo/eslint-plugin`](https://www.npmjs.com/package/@endo/eslint-plugin) rules
- **Static analysis**: Use [TypeScript with JSDoc](https://www.typescriptlang.org/docs/handbook/jsdoc-supported-types.html) to express and check types
- **Testing**: Use [`ava`](https://github.com/avajs/ava) for unit tests

## TODO

- Unit tests

  - recording WebRd

- API docs

- Consolidate overlapping I/O logic from `agoric-sdk` and `endojs/endo`:

  - Enhance this package to offer the relevant features
    - cache from @endo/bundle-source
    - config file objects in fast-usdc cli
    - makeAgd variants
    - multichain-testing / dapp-orchestration-basics stuff:
      - running in containers, pods
      - copying files into containers / pods
  - Replace ad hoc copies in upstream code

- Consider providing exhaustive coverage of Node.js `fs` and `path` APIs
  - read / write streams
  - Reference: [safej/java/io/File.safej](https://github.com/kpreid/e-on-java/blob/master/src/safej/java/io/File.safej)

- decide on package exports; e.g. `@endo/pola-io/cmd`?

- Move this package from `agoric-sdk` to `endo`

## Design Notes

- Ideally, we'd incorporate `openat` to minimize ambient authority at the OS level, but it's not supported in libuv ([libuv/libuv#4167](https://github.com/libuv/libuv/issues/4167)).
