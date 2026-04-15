import harden from '@endo/harden';

/**
 * @typedef {<O extends Record<string, unknown>>(
 *   obj: O,
 * ) => { [K in keyof O]: K extends string ? [K, O[K]] : never }[keyof O][]} TypedEntries
 */
export const typedEntries = /** @type {TypedEntries} */ (Object.entries);

/**
 * @typedef {<
 *   const Entries extends ReadonlyArray<readonly [PropertyKey, unknown]>,
 * >(
 *   entries: Entries,
 * ) => { [Entry in Entries[number] as Entry[0]]: Entry[1] }} FromTypedEntries
 */
export const fromTypedEntries = /** @type {FromTypedEntries} */ (
  Object.fromEntries
);

/**
 * @typedef {<A extends unknown[], V>(
 *   arr: A,
 *   mapper: <K extends number>(el: A[K], idx: K, arr: A) => V,
 * ) => V[]} TypedMap
 */
export const typedMap = /** @type {TypedMap} */ (
  Function.prototype.call.bind(Array.prototype.map)
);

/**
 * By analogy with how `Array.prototype.map` will map the elements of
 * an array to transformed elements of an array of the same shape,
 * `objectMap` will do likewise for the string-named own enumerable
 * properties of an object.
 *
 * Typical usage applies `objectMap` to a CopyRecord, i.e.,
 * an object for which `passStyleOf(original) === 'copyRecord'`. For these,
 * none of the following edge cases arise. The result will be a CopyRecord
 * with exactly the same property names, whose values are the mapped form of
 * the original's values.
 *
 * When the original is not a CopyRecord, some edge cases to be aware of
 *    * No matter how mutable the original object, the returned object is
 *      hardened.
 *    * Only the string-named enumerable own properties of the original
 *      are mapped. All other properties are ignored.
 *    * If any of the original properties were accessors, `Object.entries`
 *      will cause its `getter` to be called and will use the resulting
 *      value.
 *    * No matter whether the original property was an accessor, writable,
 *      or configurable, all the properties of the returned object will be
 *      non-writable, non-configurable, data properties.
 *    * No matter what the original object may have inherited from, and
 *      no matter whether it was a special kind of object such as an array,
 *      the returned object will always be a plain object inheriting directly
 *      from `Object.prototype` and whose state is only these new mapped
 *      own properties.
 *
 * With these differences, even if the original object was not a CopyRecord,
 * if all the mapped values are Passable, then the returned object will be
 * a CopyRecord.
 *
 * @template {Record<string, unknown>} O
 * @template R map result
 * @param {O} original
 * @param {<K extends string & keyof O>(value: O[K], key: K) => R} mapFn
 * @returns {{ [K in keyof O]: K extends string ? R : never }}
 */
export const objectMap = (original, mapFn) => {
  const oldEntries = typedEntries(original);
  /** @type {<K extends string & keyof O>(entry: [K, O[K]]) => [K, R]} */
  const mapEntry = ([k, v]) => [k, mapFn(v, k)];
  const newEntries = typedMap(oldEntries, mapEntry);
  const newObj = fromTypedEntries(newEntries);
  return /** @type {any} */ (harden(newObj));
};
harden(objectMap);

/**
 * Like {@link objectMap}, but preserves the per-key correlation between
 * each original value's type and the result by *extending* every value
 * with the same additional properties rather than mapping it to an
 * unrelated type.  Phrasing the result as `{ [K in keyof O]: O[K] & Ex }`
 * in the return type evaluates `O[K]` fresh per key, where a single
 * generic R would collapse to a union.
 *
 * @example
 * ```ts
 * const chains = {
 *   ethereum: { namespace: 'eip155', reference: '1' },
 *   solana: { namespace: 'solana', reference: 'mainnet' },
 * } as const;
 *
 * const withChainId = objectExtendEach(chains, v => ({
 *   chainId: `${v.namespace}:${v.reference}`,
 * }));
 * // {
 * //   ethereum: { namespace: 'eip155'; reference: '1' } & { chainId: string };
 * //   solana:   { namespace: 'solana'; reference: 'mainnet' } & { chainId: string };
 * // }
 * ```
 *
 * Each value in `original` must be an object, because the implementation
 * spreads `v` (`{ ...v, ...extendFn(v, k) }`) — spreading a primitive
 * would silently yield an empty object (or, for strings, per-character
 * indices) and the intersection `O[K] & Ex` would collapse to `never`
 * for primitive `O[K]`.  Constraining `O` to `Record<string, object>`
 * makes the type and runtime behavior agree.
 *
 * @template {Record<string, object>} O
 * @template {Record<string, unknown>} Ex
 * @param {O} original
 * @param {(value: O[keyof O & string], key: string & keyof O) => Ex} extendFn
 * @returns {{ [K in keyof O]: O[K] & Ex }}
 */
export const objectExtendEach = (original, extendFn) => {
  const newEntries = typedMap(
    typedEntries(original),
    /** @type {([k, v]: [string, object]) => [string, object]} */
    ([k, v]) => [k, { ...v, ...extendFn(v, k) }],
  );
  return /** @type {any} */ (harden(fromTypedEntries(newEntries)));
};
harden(objectExtendEach);
