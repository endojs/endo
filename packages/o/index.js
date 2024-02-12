/* global globalThis */
/* eslint-disable max-classes-per-file */

/**
 * @template T,U
 * @typedef {T extends { (...args: infer P): infer R; } ?
 *   { (...args: P): OCell<Awaited<R>>; } :
 *   U
 * } AsyncCallable ensure that all callables are async
 */

/**
 * @template T
 * @typedef { { [K in keyof T]: AsyncCallable<T[K], OCell<Awaited<T[K]>>> } } AsyncShallow
 */

/**
 * @template T
 * @typedef {BigInt extends T ? AsyncShallow<BigIntConstructor['prototype']> :
 *   String extends T ? AsyncShallow<StringConstructor['prototype']> :
 *   Boolean extends T ? AsyncShallow<BooleanConstructor['prototype']> :
 *   Number extends T ? AsyncShallow<NumberConstructor['prototype']> :
 *   Symbol extends T ? AsyncShallow<SymbolConstructor['prototype']> :
 *   {}
 * } AsyncPrimitive Primitives need to be explicitly handled or else their
 * prototype methods aren't asyncified.
 */

/**
 * @template [T=any]
 * @typedef {Promise<Awaited<T>> & AsyncCallable<T, {}> & AsyncShallow<T> &
 * AsyncPrimitive<T>} OCell A cell is a wrapper for an object on which
 * operations (await, call, index) return a promise for execution in a future
 * turn
 */

/**
 * @type {<T>(x: T) => T}
 */
const harden = globalThis.harden || (x => x);

const sink = harden(() => {});

const promiseMethods = ['then', 'catch', 'finally'];
harden(promiseMethods);

/**
 * @typedef {(...args: any[]) => any} T
 * @param {T} target
 * @returns {T}
 */
export const stripFunction = target => {
  Object.setPrototypeOf(target, null);
  for (const key of Reflect.ownKeys(target)) {
    delete target[key];
  }
  return target;
};

const makeTarget = getThisArg => {
  const target = stripFunction(() => {});
  const promiseMethodEntries = promiseMethods.map(key => [
    key,
    Promise.prototype[key],
  ]);
  for (const [key, fn] of promiseMethodEntries) {
    target[key] = (...args) => Reflect.apply(fn, getThisArg(), args);
  }
  harden(target);
  return target;
};

/**
 * @param {unknown} _zone TODO: use zones.
 * @param {object} [powers]
 * @param {{
 *   applyFunction: (x: unknown, args: any[]) => Promise<unknown>
 *   applyMethod: (x: unknown, prop: PropertyKey, args: any[]) => Promise<unknown>
 *   get: (x: unknown, prop: PropertyKey) => Promise<unknown>
 * }} [powers.HandledPromise]
 * @param {(specimen: unknown) => Promise<any>} [powers.when]
 */
export const prepareOTools = (_zone, powers) => {
  const {
    when = x => {
      const p = Promise.resolve(x);
      p.catch(sink);
      return p;
    },
    HandledPromise = globalThis.HandledPromise,
  } = powers || {};

  const hpGet = HandledPromise
    ? HandledPromise.get
    : (x, prop) => when(x).then(y => y[prop]);
  const hpApplyFunction = HandledPromise
    ? HandledPromise.applyFunction
    : (x, args) => when(x).then(y => y(...args));
  const hpApplyMethod = HandledPromise
    ? HandledPromise.applyMethod
    : (x, prop, args) => when(x).then(y => y[prop](...args));

  /**
   * @param {unknown} boundThis
   * @param {OCell<any>} [parentCell]
   * @param {PropertyKey} [boundName]
   */
  const makeBoundOCell = (boundThis, parentCell, boundName) => {
    let cachedThisArg;
    const getThisArg = () => {
      if (cachedThisArg === undefined) {
        if (boundName === undefined) {
          cachedThisArg = when(boundThis);
        } else {
          cachedThisArg = when(hpGet(boundThis, boundName));
        }
      }
      return cachedThisArg;
    };

    const target = makeTarget(getThisArg);

    const spaceName = boundName ? ` ${JSON.stringify(String(boundName))}` : '';
    const cell = new Proxy(target, {
      apply(_target, thisArg, args) {
        if (thisArg !== parentCell) {
          return when(
            Promise.reject(
              TypeError(
                `Cannot apply method${spaceName} to different this-binding`,
              ),
            ),
          );
        }

        if (boundName === undefined) {
          const retP = hpApplyFunction(boundThis, args);
          return makeBoundOCell(retP, cell);
        }

        const retP = hpApplyMethod(boundThis, boundName, args);
        return makeBoundOCell(retP, cell);
      },
      get(_target, key) {
        if (typeof key === 'string' && promiseMethods.includes(key)) {
          // Base case, escape the cell via a promise method.
          return target[key];
        }
        if (key === Symbol.toPrimitive) {
          // Work around a bug that somehow freezes the Node.js REPL.
          return undefined;
        }
        const thisArg = getThisArg();

        // Capture the key, since we won't know if this is a property get or a
        // method call until later.
        return makeBoundOCell(thisArg, cell, key);
      },
    });

    harden(cell);
    return cell;
  };

  /**
   * @template T
   * @param {T} obj
   * @returns {Promise<Awaited<T>> & AsyncPrimitive<T> & AsyncShallow<T> & {
   * <U>(x: U): OCell<U> }}
   */
  const makeO = obj => {
    const cell = makeBoundOCell(obj);
    const O = new Proxy(cell, {
      apply(_target, _thisArg, args) {
        return makeBoundOCell(args[0]);
      },
    });
    return O;
  };

  /**
   * @template T
   * @param {T} obj
   * @returns {OCell<T>}
   */
  const makeOCell = obj => makeBoundOCell(obj);
  harden(makeOCell);
  return { makeOCell, makeO };
};
harden(prepareOTools);
