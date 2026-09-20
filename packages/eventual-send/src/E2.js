// @ts-check

/** @typedef {'Optional' | 'Send' | 'SendOnly'} EModes */

/**
 * @template T
 * @typedef {|
 *   (Function extends T ? FunctionConstructor['prototype'] :
 *   BigInt extends T ? BigIntConstructor['prototype'] :
 *   String extends T ? StringConstructor['prototype'] :
 *   Boolean extends T ? BooleanConstructor['prototype'] :
 *   Number extends T ? NumberConstructor['prototype'] :
 *   Symbol extends T ? SymbolConstructor['prototype'] :
 *   never) | T} PropsOf
 */

/**
 * @typedef {Record<keyof ObjectConstructor['prototype'], void>} NullPrototype
 */

/**
 * @template T
 * @template {EModes} [Mode='Send']
 * @template {never | undefined} [OptionalChain=never]
 * @typedef {Promise<Mode extends 'SendOnly' ? void : T | OptionalChain> & {
 *   then: {
 *     Optional: ENext<T, 'Optional', OptionalChain>;
 *     Send: ENext<T, 'Send', OptionalChain>;
 *     SendOnly: ENext<T, 'SendOnly', OptionalChain>;
 *   } & NullPrototype;
 * } & NullPrototype} EPromise
 */

/**
 * @template T
 * @template {EModes} Mode
 * @template {never | undefined} OptionalChain
 * @typedef {T extends PromiseLike<infer U>
 *   ? EThenable<U, Mode, OptionalChain>
 *   : EPromise<T, Mode, OptionalChain>} EThenable
 */

/**
 * @template NT
 * @template {EModes} Mode
 * @template {never | undefined} OptionalChain
 * @typedef {Mode extends 'Optional' ? ETarget<Exclude<NT, null | undefined>,
 *     'Send', undefined>
 *   : ETarget<NT, Mode, OptionalChain>} ENext
 */

/**
 * @template T
 * @template {EModes} Mode
 * @template {never | undefined} OptionalChain
 * @typedef {EThenable<T, Mode, OptionalChain> &
 *   { [P in keyof PropsOf<T>]: ENext<PropsOf<T>[P], Mode, OptionalChain> }
 * } EProps
 */

/**
 * @template T
 * @template {EModes} [Mode='Send']
 * @template {never | undefined} [OptionalChain=never]
 * @typedef {(T extends (...args: infer A) => infer R ?
 *      EProps<T, Mode, OptionalChain> & ((...args: A) => ENext<R, Mode, OptionalChain>)
 *    : EProps<T, Mode, OptionalChain>)} ETarget
 */

/**
 * @template T
 * @param {T} x
 * @returns {EPromise<T>['then']['Send']}
 */
const makeESender = x => {
    // We push this to a future turn to thwart a malicious x.then.
    const ePromise = /** @type {EPromise<T>} */ (Promise.resolve().then(() => x));
    return ePromise.then.Send;
};
const E = Object.assign(makeESender, /** @type {const} */ ({}));

(async () => {
    /** @type {Map<number, 'abc' | undefined>} */
    const m = new Map();

    /** @type {null | (() => 'hello')} */
    const fnum = Math.random() < 0.5 ? null : () => 'hello';
    const v1 = await E(Math).min(3, 2).then.Optional.toString();
    const v2 = await E(m).then.SendOnly.set(9, 'abc');
    const v3 = await E(2).toFixed.then.Optional().charAt(3);
    const o1p = E({ abc: fnum }).abc.then.Optional();
    // @ts-expect-error expression is not callable
    const o1 = await E({ abc: fnum }).abc();
    const v4 = await E(2).then.SendOnly.toFixed().at(-1);
    const v5This = E(2);
    /** @type {(this: EProps<number, 'Send', never>) => EProps<string, 'Send', never>} */
    const v5Fn = v5This.toExponential;
    const v5real = await v5This.toExponential();
    const v5 = await v5Fn();
    const fakeThis = {
        v5Fn,
    };
    const v5Fake = await fakeThis.v5Fn();
    // @ts-expect-error no inherited toString.
    const zot = await E(null).toString();
    const zot2 = await E(fnum).then.Optional().length;
});
