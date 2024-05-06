User-visible changes in `@endo/exo`:

# v1.5.0 (2024-05-06)

- A call to an exo will only throw a throwable, i.e., a Passable without capabilities, i.e., without Remotables or Promises. It will consist only of copy data and Passable errors. Passable errors themselves cannot contain capabilities, and so are throwable. An async exo `callWhen` method will likewise only reject with a throwable reason. Both contraints help security reviews, since experience shows it is too hard for reviewers to be adequately vigilant about capabilities communicated over the implicit exceptional control flow pathways.

# v0.2.6 (2023-09-11)

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
