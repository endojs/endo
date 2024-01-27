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
 * @typedef { T extends Record<any, any> ? AsyncShallow<T> :
 *   T extends BigInt ? AsyncShallow<BigIntConstructor['prototype']> :
 *   T extends Boolean ? AsyncShallow<BooleanConstructor['prototype']> :
 *   T extends Function ? AsyncShallow<FunctionConstructor['prototype']> :
 *   T extends Number ? AsyncShallow<NumberConstructor['prototype']> :
 *   T extends String ? AsyncShallow<StringConstructor['prototype']> :
 *   T extends Symbol ? AsyncShallow<SymbolConstructor['prototype']> :
 *   {}
 * } AsyncObject Primitives need to be explicitly handled or else their
 * prototype methods aren't asyncified.
 */

/**
 * @template [T=any]
 * @typedef {Pick<Promise<Awaited<T>>, 'then' | 'catch' | 'finally'> &
 *   AsyncCallable<T, {}> & AsyncObject<T>}
 * OCell A cell is a wrapper for an object on which operations (await, call,
 * index) return a promise for execution in a future turn
 */

/**
 * TODO: use lockdown.
 * @type {<T>(x: T) => T}
 */
const harden = globalThis.harden || (x => x);

/**
 * TODO: use whenables.
 * @template T
 * @param {T} p
 */
const when = p => Promise.resolve().then(() => p);

/**
 * @param {unknown} _zone TODO: use zones.
 */
export const prepareOCell = _zone => {
  /** @type {WeakMap<WeakKey, OCell>} */
  const objToCell = new WeakMap();

  const promiseMethods = ['then', 'catch', 'finally'];
  harden(promiseMethods);

  /**
   * @template T
   * @param {T} rawObj
   * @param {unknown} [boundName]
   * @param {unknown} [boundThis]
   * @returns {OCell<T>}
   */
  const makeOCell = (rawObj, boundName, boundThis) => {
    const objRef = /** @type {WeakKey} */ (rawObj);
    /** @type {any} */
    let cell = objToCell.get(objRef);
    if (cell) {
      return cell;
    }

    // Get a promise for the fully shortened whenable chain.
    // TODO: use pipelining.
    const objP = when(rawObj);

    // Avoid contamination by our callable interface.
    const target = () => {};
    Object.setPrototypeOf(target, null);
    for (const key of Reflect.ownKeys(target)) {
      delete target[key];
    }
    for (const key of promiseMethods) {
      target[key] = Promise.prototype[key].bind(objP);
    }
    harden(target);

    cell = new Proxy(target, {
      apply(_target, thisArg, args) {
        const retP = Promise.all([objP, boundThis]).then(([obj, bt]) => {
          const spaceName = boundName
            ? ` ${JSON.stringify(String(boundName))}`
            : '';
          if (typeof obj !== 'function') {
            throw TypeError(`Cannot apply non-function${spaceName}`);
          }
          if (thisArg !== undefined && boundThis !== thisArg) {
            throw TypeError(
              `Cannot apply method${spaceName} to different this-binding`,
            );
          }
          return Reflect.apply(
            /** @type {(...args: any[]) => any} */ (obj),
            bt,
            args,
          );
        });
        return makeOCell(harden(retP));
      },
      get(_target, key) {
        if (typeof key === 'string' && promiseMethods.includes(key)) {
          // Base case, escape the cell via a promise method.
          return target[key];
        }
        if (key === Symbol.toPrimitive) {
          return undefined;
        }
        // Capture the this promise in case they apply a method, then move on.
        const retP = objP.then(obj =>
          makeOCell(obj == null ? obj : obj[key], key, cell),
        );
        return makeOCell(retP, key, cell);
      },
    });

    harden(cell);

    // Reuse cells if possible.
    if (Object(objRef) === objRef) {
      objToCell.set(objRef, cell);
    }
    objToCell.set(objP, cell);
    return cell;
  };

  harden(makeOCell);
  return makeOCell;
};
harden(prepareOCell);
