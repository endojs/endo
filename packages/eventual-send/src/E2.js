// @ts-check

/**
 * @file Type experiment for a fluent eventual-send facade.
 *
 * The runtime code here is intentionally tiny; most of the file describes the
 * shape of an `E` proxy with JSDoc typedefs. `E(x)` is the same as
 * `E.Once(x)`: it permits at most one property access and at most one
 * function or method call before returning a promise-like result. Further
 * pipelining can be expressed either with nested `E(...)` calls or by selecting
 * a chaining proxy through `.then.Send`, `.then.SendOnly`, `.then.Optional`, or
 * `.then.Once`.
 */

/**
 * A normal eventual send returns a promise for the eventual result. SendOnly
 * queues the operation but discards the result, so its promise resolves to
 * `void`.
 *
 * @typedef {'Send' | 'SendOnly'} ESendModes
 */

/**
 * Controls how far the proxy type follows returned properties. Deep recursion
 * models the chaining proxies, which keep pipelining through every property
 * access. Shallow models `Once`, which exposes only one property step. None
 * suppresses further property forwarding after that step.
 *
 * @typedef {'Deep' | 'Shallow' | 'None'} ERecursion
 */

/**
 * Select the property-bearing surface for `T`.
 *
 * Primitive values have methods on their boxed prototypes, so `E(2).toFixed`
 * needs `Number.prototype` rather than the literal `2`. Object and function
 * targets keep their own declared members. No `Object.prototype` fallback is
 * included, which keeps inherited methods like `toString` out of the sendable
 * surface unless they are explicitly present on `T`.
 *
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
 * A marker type used to hide the usual `Object.prototype` members from the
 * proxy surface. Intersecting with this keeps structural object operations from
 * making inherited methods appear sendable.
 *
 * @typedef {Record<keyof ObjectConstructor['prototype'], void>} NullPrototype
 */

/**
 * Rebind method properties so TypeScript tracks the receiver they came from.
 *
 * The generated proxy methods are meant to be called as methods of the proxy
 * node that produced them. Adding an explicit `this: This` parameter makes an
 * extracted method reject calls that have lost that receiver, matching the
 * runtime `E` proxy's receiver checks.
 *
 * @template T
 * @template [This=T]
 * @typedef {{ [P in keyof T]: T[P] extends (...args: infer A) => infer R ?
 *   ((this: This, ...args: A) => R) & T[P]
 *   : T[P] }} NeedThis
 */

/**
 * Thenable part of an eventual-send proxy.
 *
 * Awaiting the proxy gives either the target result or `void` for SendOnly.
 * The customized `then` property is also the control surface for choosing the
 * send mode, optional-chain behavior, and whether the next operation should be
 * one-step (`Once`) or continue pipelining (`Send`, `SendOnly`, `Optional`).
 *
 * @template T
 * @template {ESendModes} [SendMode='Send']
 * @template {never | undefined} [OptionalResult=never]
 * @typedef {Promise<SendMode extends 'SendOnly' ? void : T | OptionalResult> & {
 *   then: {
 *     Once: ETarget<T, SendMode, OptionalResult, 'Shallow'>;
 *     Optional: ETarget<Exclude<T, null | undefined>, SendMode, undefined>;
 *     Send: ETarget<T, SendMode, OptionalResult>;
 *     SendOnly: ETarget<T, 'SendOnly', OptionalResult>;
 *   } & NullPrototype;
 * } & NullPrototype} EPromise
 */

/**
 * Normalize promise-like targets before exposing their eventual proxy surface.
 * If the current target is itself thenable, the proxy tracks the fulfilled
 * value; otherwise it behaves as a plain `EPromise<T>`.
 *
 * @template T
 * @template {ESendModes} SendMode
 * @template {never | undefined} OptionalResult
 * @typedef {T extends PromiseLike<infer U>
 *   ? EThenable<U, SendMode, OptionalResult>
 *   : EPromise<T, SendMode, OptionalResult>} EThenable
 */

/**
 * Property-access surface for an eventual target.
 *
 * In Deep recursion, each property is itself represented as an `ETarget`, so
 * chains selected with `E.Send(x)` or `E(x).then.Send` can type
 * `E.Send(x).a.b.c()` without awaiting at every step. In Shallow recursion,
 * used by default `E(x)`/`E.Once(x)`, only the next property is exposed; any
 * further pipelining must be made explicit with nested `E(...)` calls or a
 * `.then` control proxy. Optional mode removes `null` and `undefined` before
 * the next property access and unions the eventual result with `undefined`.
 *
 * @template T
 * @template {ESendModes} SendMode
 * @template {never | undefined} OptionalResult
 * @template {ERecursion} Recursion
 * @typedef {Recursion extends 'None' ? {} : NeedThis<{
 *   [P in keyof PropsOf<T>]: ETarget<PropsOf<T>[P], SendMode,
 *     OptionalResult,
 *     Recursion extends 'Shallow' ? 'None' : Recursion>
 * }>} EProps
 */

/**
 * Complete proxy type for `E(x)`.
 *
 * Callable targets become callable proxies. Object targets expose only their
 * property surface. Both cases also include the thenable control surface, so a
 * value can be awaited or used to select the next send mode and recursion
 * behavior.
 *
 * @template T
 * @template {ESendModes} [SendMode='Send']
 * @template {never | undefined} [OptionalResult=never]
 * @template {ERecursion} [Recursion='Deep']
 * @typedef {(T extends (...args: infer A) => infer R ?
 *       ((...args: A) => Recursion extends 'Deep' ?
 *         ETarget<R, SendMode, OptionalResult, Recursion>
 *         : EPromise<R, SendMode, OptionalResult>) &
 *       EProps<T, SendMode, OptionalResult, Recursion>
 *    : EProps<T, SendMode, OptionalResult, Recursion>) &
 *      EThenable<T, SendMode, OptionalResult>} ETarget
 */

/**
 * Build one of the top-level `E` entry points.
 *
 * The default entry point is built from `Once`, so `E(x)` intentionally has the
 * same one-step surface as `E.Once(x)`. The other entry points expose the same
 * target with different send and recursion semantics.
 *
 * The returned function first moves `x` into a future turn before consulting
 * `.then[method]`. That avoids synchronously invoking a hostile or surprising
 * user-defined `then` accessor on `x`.
 *
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

// Type assertions below document the intended behavior of the typedefs above.
// They are not runtime coverage for eventual-send; they are compiler checks for
// the fluent proxy surface.
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
