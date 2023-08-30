User-visible changes in `@endo/exo`:

# Next

- Adds support for symbol-keyed methods in interface guards, e.g.
  ```
  const LabeledIterableI = M.interface('LabeledIterable', {
    getLabel: M.call().returns(M.string()),
    [Symbol.asyncIterator]: M.call().returns(M.remotable('Iterator')),
  });
  ```

# v0.2.2 (2023-04-20)

- Parse `$DEBUG` as comma-separated

# v0.2.1 (2023-04-14)

- Label remotable instances
