// @ts-check

/** @typedef {'Send' | 'SendOnly'} ESendModes */
/** @typedef {'Deep' | 'Shallow' | 'None'} ERecursion */

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
 * @template [This=T]
 * @typedef {{ [P in keyof T]: T[P] extends (...args: infer A) => infer R ?
 *   ((this: This, ...args: A) => R) & T[P]
 *   : T[P] }} NeedThis
 */

/**
 * @template T
 * @template {ESendModes} [SendMode='Send']
 * @template {never | undefined} [OptionalChain=never]
 * @typedef {Promise<SendMode extends 'SendOnly' ? void : T | OptionalChain> & {
 *   then: {
 *     Once: ETarget<T, SendMode, OptionalChain, 'Shallow'>;
 *     Optional: ETarget<Exclude<T, null | undefined>, SendMode, undefined>;
 *     Send: ETarget<T, SendMode, OptionalChain>;
 *     SendOnly: ETarget<T, 'SendOnly', OptionalChain>;
 *   } & NullPrototype;
 * } & NullPrototype} EPromise
 */

/**
 * @template T
 * @template {ESendModes} SendMode
 * @template {never | undefined} OptionalChain
 * @typedef {T extends PromiseLike<infer U>
 *   ? EThenable<U, SendMode, OptionalChain>
 *   : EPromise<T, SendMode, OptionalChain>} EThenable
 */

/**
 * @template T
 * @template {ESendModes} SendMode
 * @template {never | undefined} OptionalChain
 * @template {ERecursion} Recursion
 * @typedef {Recursion extends 'None' ? {} : NeedThis<{
 *   [P in keyof PropsOf<T>]: ETarget<PropsOf<T>[P], SendMode,
 *     OptionalChain,
 *     Recursion extends 'Shallow' ? 'None' : Recursion>
 * }>} EProps
 */

/**
 * @template T
 * @template {ESendModes} [SendMode='Send']
 * @template {never | undefined} [OptionalChain=never]
 * @template {ERecursion} [Recursion='Deep']
 * @typedef {(T extends (...args: infer A) => infer R ?
 *       ((...args: A) => Recursion extends 'Deep' ?
 *         ETarget<R, SendMode, OptionalChain, Recursion>
 *         : EPromise<R, SendMode, OptionalChain>) &
 *       EProps<T, SendMode, OptionalChain, Recursion>
 *    : EProps<T, SendMode, OptionalChain, Recursion>) &
 *      EThenable<T, SendMode, OptionalChain>} ETarget
 */

/**
 * @template {keyof EPromise<any>['then']} M
 * @param {M} method
 */
const makeEMethod =
  method =>
  /**
   * @template T
   * @param {T} x
   * @return {EPromise<T>['then'][M]}
   */
  x => {
    // We push this to a future turn to thwart a malicious x.then.
    const ePromise = /** @type {EPromise<T>} */ (
      Promise.resolve().then(() => x)
    );
    return ePromise.then[method];
  };

const E = Object.assign(
    makeEMethod('Once'),
    /** @type {const} */ ({
    Once: makeEMethod('Once'),
    Optional: makeEMethod('Optional'),
    Send: makeEMethod('Send'),
    SendOnly: makeEMethod('SendOnly'),
  }),
);

async () => {
  /** @type {Map<number, 'abc' | undefined>} */
  const m = new Map();

  /** @type {null | (() => 'hello')} */
  const fnum = Math.random() < 0.5 ? null : () => 'hello';
  /** @satisfies {string | undefined} */ (await E(Math).min(3, 2).then.Optional.toString());
  /** @satisfies {void} */ (await E.SendOnly(m).set(9, 'abc'));
  /** @satisfies {string | undefined} */ (await E.Optional(2345).toFixed().charAt(3));
  /** @satisfies {'hello' | undefined} */ (await E({ abc: fnum }).abc.then.Optional());
  // @ts-expect-error expression is not callable
  await E({ abc: fnum }).abc();
  /** @satisfies {void} */ (await E.SendOnly(2).toFixed().at(-1));
  {
    const v5This = E(2);
    /** @satisfies {string} */ (await v5This.toExponential());
    const v5Fn = v5This.toExponential;
    // @ts-expect-error void not assignable to type...
    await v5Fn();
    const fakeThis = {
      toExponential: v5Fn,
    };
    // @ts-expect-error the this context of type...
    await fakeThis.toExponential();
  }
  // @ts-expect-error no inherited toString.
  await E(null).toString();
  /** @satisfies {number | undefined} */ (await E.Optional(fnum)().length);
};
