# @endo/trampoline

> Multicolor trampolining using generators

**@endo/trampoline** is a utility library which helps share code between synchronous and asynchronous variations of the same algorithm.

## Example Usage

```js
import { asyncTrampoline, syncTrampoline } from '@endo/trampoline';

/**
 * This function "reads a file synchronously" and returns "a list of its imports"
 *
 * @param {string} filepath Source file path
 * @returns {string[]} List of imports found in source
 */
const findImportsSync = filepath => {
  // read a file, parse it for imports, return a list of import specifiers
  // (synchronously)
  // ...
};

/**
 * This function "reads a file asynchronously" and returns "a list of its imports"
 *
 * @param {string} filepath Source file path
 * @returns {Promise<string[]>} List of imports found in source
 */
const findImportsAsync = async filepath => {
  // read a file, parse it for imports, return a list of import specifiers
  // (asynchronously)
  // ...
};

/**
 * Recursively crawls a dependency tree to find all dependencies
 *
 * @template {string[] | Promise<string[]>} TResult Type of result (list of imports)
 * @param {(filepath: string) => TResult} finder Function which reads a file and returns its imports
 * @param {string} filename File to start from; entry point
 * @returns {Generator<TResult, string[], string[]>} Generator yielding list of imports
 */
function* findAllImports(finder, filename) {
  // it doesn't matter if finder is sync or async!
  let specifiers = yield finder(filename);

  // pretend there's some de-duping, caching,
  // scrubbing, etc. happening here

  for (const specifier of specifiers) {
    // it's okay to be recursive
    specifiers = [...specifiers, ...(yield* findAllImports(finder, specifier))];
  }
  return specifiers;
}

// results are an array of all imports found in some.js' dependency tree
const asyncResult = await asyncTrampoline(
  findAllImports,
  findImports,
  './some.js',
);

// same thing, but synchronously
const syncResult = syncTrampoline(
  findAllImports,
  findImportsAsync,
  './some.js',
);

asyncResult === syncResult; // true
```

In the above example, **@endo/trampoline** allows us to re-use the operations in `loadRecursive()` for _both_ sync and async execution. An implementation _without_ **@endo/trampoline** would need to duplicate the operations into two (2) discrete recursive functions—a synchronous-colored function and an asynchronous-colored function. Over time, this situation commonly leads to diverging implementations. If that _doesn't_ sound like a big deal for _whatever you're trying to do here_, then you probably don't need **@endo/trampoline**.

## What is this?

The pattern exposed by this library—known as [trampolining][]—helps manage control flow in a way that avoids deep recursion and potential stack overflows.

**@endo/trampoline** provides the trampolining pattern, but in such a way that a consumer can execute _either_ synchronous _or_ asynchronous operations _paired with operations common to both_.

In other words, **@endo/trampoline** can help _reduce code duplication_ when operations must be executed _in both sync and async_ contexts.

## Install

The usual sort of thing:

```sh
npm install @endo/trampoline
```

## License

Apache-2.0

## Disclaimer

By using this library, you agree to indemnify and hold harmless the authors of `@endo/trampoline` from any and all losses, liabilities and risk of bodily injury _including but not limited to_ broken bones, sprains, bruises or other hematomas, fibromas, teratomas, mesotheliomas, cooties, bubonic plague, psychic trauma or warts due to the inherent danger of trampolining.

[trampolining]: https://raganwald.com/2013/03/28/trampolines-in-javascript.html
