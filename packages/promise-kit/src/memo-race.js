// @ts-check
/*
Initial version authored by Brian Kim:
https://github.com/nodejs/node/issues/17469#issuecomment-685216777

This is free and unencumbered software released into the public domain.

Anyone is free to copy, modify, publish, use, compile, sell, or
distribute this software, either in source code form or as a compiled
binary, for any purpose, commercial or non-commercial, and by any
means.

In jurisdictions that recognize copyright laws, the author or authors
of this software dedicate any and all copyright interest in the
software to the public domain. We make this dedication for the benefit
of the public at large and to the detriment of our heirs and
successors. We intend this dedication to be an overt act of
relinquishment in perpetuity of all present and future rights to this
software under copyright law.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS BE LIABLE FOR ANY CLAIM, DAMAGES OR
OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE,
ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
OTHER DEALINGS IN THE SOFTWARE.

For more information, please refer to <http://unlicense.org/>
*/

const isObject = value => Object(value) === value;

/**
 * @template [T=any]
 * @typedef {object} Deferred
 * @property {(value?: import("../index.js").ERef<T> ) => void} resolve
 * @property {(err?: any ) => void} reject
 */

/**
 * @typedef { never
 *  | {settled: false, deferreds: Set<Deferred>}
 *  | {settled: true, deferreds?: undefined}
 * } PromiseMemoRecord
 */

// Keys are the values passed to race, values are a record of data containing a
// set of deferreds and whether the value has settled.
/** @type {WeakMap<object, PromiseMemoRecord>} */
const knownPromises = new WeakMap();

/**
 * @param {PromiseMemoRecord | undefined} record
 * @returns {Set<Deferred>}
 */
const markSettled = record => {
  if (!record || record.settled) {
    return new Set();
  }

  const { deferreds } = record;
  Object.assign(record, {
    deferreds: undefined,
    settled: true,
  });
  Object.freeze(record);
  return deferreds;
};

/**
 *
 * @param {any} value
 * @returns {PromiseMemoRecord}
 */
const getMemoRecord = value => {
  if (!isObject(value)) {
    // If the contender is a primitive, attempting to use it as a key in the
    // weakmap would throw an error. Luckily, it is safe to call
    // `Promise.resolve(contender).then` on a primitive value multiple times
    // because the promise fulfills immediately. So we fake a settled record.
    return { settled: true };
  }

  let record = knownPromises.get(value);

  if (!record) {
    record = { deferreds: new Set(), settled: false };
    knownPromises.set(value, record);
    // This call to `then` happens once for the lifetime of the value.
    Promise.resolve(value).then(
      val => {
        for (const { resolve } of markSettled(record)) {
          resolve(val);
        }
      },
      err => {
        for (const { reject } of markSettled(record)) {
          reject(err);
        }
      },
    );
  }
  return record;
};

const { race } = {
  /**
   * Creates a Promise that is resolved or rejected when any of the provided Promises are resolved
   * or rejected.
   *
   * Unlike `Promise.race` it cleans up after itself so a non-resolved value doesn't hold onto
   * the result promise.
   *
   * @template T
   * @template {PromiseConstructor} [P=PromiseConstructor]
   * @this {P}
   * @param {Iterable<T>} values An iterable of Promises.
   * @returns {Promise<Awaited<T>>} A new Promise.
   */
  race(values) {
    let deferred;
    /** @type {T[]} */
    const cachedValues = [];
    const C = this;
    const result = new C((resolve, reject) => {
      deferred = { resolve, reject };
      for (const value of values) {
        cachedValues.push(value);
        const { settled, deferreds } = getMemoRecord(value);
        if (settled) {
          // If the contender is settled (including primitives), it is safe
          // to call `Promise.resolve(value).then` on it.
          C.resolve(value).then(resolve, reject);
        } else {
          deferreds.add(deferred);
        }
      }
    });

    // The finally callback executes when any value settles, preventing any of
    // the unresolved values from retaining a reference to the resolved value.
    return result.finally(() => {
      for (const value of cachedValues) {
        const { deferreds } = getMemoRecord(value);
        if (deferreds) {
          deferreds.delete(deferred);
        }
      }
    });
  },
};

export { race as memoRace };
