# `@endo/common`

A collection of common low level utilities.

Each of the utilities in this packages
- are low level in the sense of not depending on anything higher level than `ses`, `@endo/eventual-send`, and `@endo/promise-kit`. Many depend on nothing beyond plain old JavaScript.
- highly reusable, i.e., potentially useful many places.
- sufficiently general that it would be awkward to import from a more specialized package.
- can be explained and motivated without much external knowledge.

Each utility is in its own top-level source file, named after the main export of that utility. (This is often that file's only export.) The `package.json` also lists each as a distinct `"export":`. There is no `index.js` file that rolls them together. Thus, each importer must do a deep import of exactly the export it needs. Some implementations (bundlers, packagers) can thus do tree-shaking, omitted code that isn't reachable by imports.

Currently there are no `src/something.js` files. The only source files that would go in `src/` are those that do not represent separately exported utilities.

Generally each utility also has its own test file. (An exception is that `make-iterator.js` is indirectly but adequately tested by `test-make-array-iterator.js`).

See the doc-comments within the source file of each utility for documentation of that utility. Sometimes the associated test files also serve as informative examples.
