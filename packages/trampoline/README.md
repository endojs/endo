# @endo/trampoline

> Multicolor trampolining using generators (for your pleasure)

## Example Usage

```js
import {trampoline, syncTrampoline} from '@endo/trampoline';

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
 * @template {string[]|Promise<string[]>} TResult
 * @param {ThunkFn<string, TResult>} thunk
 * @param {string} filename
 * @returns {Generator<TResult, string[], string[]>}
 */
function* loadRecursive(thunk, filename) {
  let specifiers = yield thunk(filename);
  
  // pretend there's some de-duping, caching, 
  // scrubbing, etc. happening here!

  for (const specifier of specifiers) {
    specifiers = [...specifiers, ...(yield* loadRecursive(thunk, specifier))];
  }
  return specifiers;
}

// results are an array of all imports found in some.js' dependency tree

const asyncResult = await trampoline(loadRecursive, readAsync, './some.js');
const syncResult = syncTrampoline(loadRecursive, readSync, './some.txt');

asyncResult === syncResult; // true
```

In the above example, **@endo/trampoline** allows us to re-use the operations in `loadRecursive` for both sync and async execution. An implementation _without_ **@endo/trampoline** would need to duplicate the operations into two (2) discrete recursive functions—a synchronous-colored function and an asynchronous-colored function. Over time, this situation commonly leads to diverging implementations. If that _doesn't_ sound like a big deal for _whatever you're trying to do here_, then you probably don't need **@endo/trampoline**.

## What is this?

The pattern exposed by this library—known as [trampolining][]—helps manage control flow in a way that avoids deep recursion and potential stack overflows. It effectively "converts" recursive calls into a loop. This is especially helpful in a language like JavaScript [because reasons][proper-tail-calls].

**@endo/trampoline** provides the trampolining pattern, but in such a way that consumer can execute _either_ synchronous _or_ asynchronous operations _paired with operations common to both_.

In other words, **@endo/trampoline** can help _reduce code duplication_ when recursive operations must be executed _in both sync and async_ contexts.

## Install

The usual sort of thing:

```sh
npm install @endo/trampoline
```

## License

Apache-2.0

[trampolining]: https://raganwald.com/2013/03/28/trampolines-in-javascript.html
[proper-tail-calls]: https://www.mgmarlow.com/words/2021-03-27-proper-tail-calls-js/

