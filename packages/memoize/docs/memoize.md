
# Memoization Safety

Let's examime the contingent safety properties of the `memoize` function
implemented by the `memoize.js` module, whose implementation at the time of this writing is
```js
/**
 * @template {{}} A Should be WeakMap-key compatible
 * @template R Can be anything
 * @param {(arg: A) => R} fn
 * @returns {(arg: A) => R}
 */
export const memoize = fn => {
  const memo = new WeakMap();
  const memoFn = arg => {
    if (weakmapHas(memo, arg)) {
      return weakmapGet(memo, arg);
    }
    const result = fn(arg);
    weakmapSet(memo, arg, result);
    return result;
  };
  return harden(memoFn);
};
harden(memoize);
```

By "contingent safety", we mean the safety guarantees that follow given that
certain requirements are met. Before we examine these, let's first understand
the non-contingent semantics of this code.

## Base semantics

Given a function `fn`, the call `memoize(fn)` returns a `fn`-like function, `memoFn`.
The one-arg function `memoFn` is a memoizing form of `fn`
as a one-argument function. When `memoFn(arg)` is called the first time for any
given `arg`, it calls `fn(arg)`.

If `arg` is a valid `WeakMap` key and `fn(arg)` returns a result
rather than throwing, then the mapping from `arg` to this result is memoized in
`memoFn`'s encapsulated `WeakMap`, and `result` is returned.
All further calls `memoFn(arg)` with the same
`memoFn` and the same `arg` will return the same memoized result
without calling `fn`.

Otherwise:
   * If `fn(arg)` throws, then `memoFn(arg)` throws without any further effect
     beyond that performed by the `fn(arg)` call.
   * If `fn(arg)` returns a `result`, but `arg` is not a valid WeakMap key,
     then `memoFn(arg)` throws without any further effect
     beyond that performed by the `fn(arg)` call.

Notice that throws from `fn(arg)` are not memoized, but rejected promises
returned by `fn(arg)` ***are*** memoized.

## Defensiveness

For `fn` to be defensive, it should throw at least on any argument
that is not a valid WeakMap key. It should also throw on any argument
that is not a valid candidate for memoization, according to the goals of the
code calling `memoize(fn)`.

## Unobservable Memoization

If the following requirements are met, then the memoizing by `memoFn` is
not observable. IOW, under these circumstances, `memoize` is not observably
different from
```js
export const memoize = fn => arg => fn(arg);
harden(memoize);
```

The unobservability requirements are
   * The function `fn` is transitively immutable and powerless, i.e.,
     it contains no mutable state or ability to cause effects.
   * Even if `arg` is mutable, when `fn(arg)` returns a result rather
     than throwing, it has not caused any effects. Thus, on any `arg`
     that `fn` cannot examine without causing effects, `fn(arg)` must throw.
     Note that `arg` may be a proxy, making this requirement hard to meet.
   * For those cases where `fn(arg)` does not throw, it must be
     reproducible in the sense that `fn(arg)` must always return
     exactly the same result for the same `arg`.

## Preserving Isolation

There is a similar guarantee to unobservability that can be provided by
meeting similar requirements. In Hardened JavaScript, `lockdown` makes all the
implicitly shared JavaScript intrinsics transitively immutable and powerless.
This ensures that they cannot be used to communicate, and so can be shared
without violating isolation.

Likewise, if `fn` is transitively immutable
and powerless, then `fn` is already not a communications channel.
If Alice
and Bob are isolated except that they have been given access to such a
shared `fn`, then Alice and Bob can still not communicate with each other.
What is needed to guarantee is that `memoFn` is also not a
communications channel?

If the following requirements are met, then `memoFn` is also not
a communication channel.
   * As above, `fn` itself must be transitively immutable and powerless.
   * As above, if `fn(arg)` returns a result rather than throwing,
     then it must not have caused any effects.
   * For those cases where `fn(arg)` does not throw, if must be
     deterministic in the sense that, for a given `arg`, for every object
     in the result,
      * the object is transitively immutable and powerless.
      * that object is equivalent aside from object identity.
      * Either the object always has the same identity for all
        `fn(arg)` calls, as with reproducibility, or it has a fresh identity
        per call, as with fresh allocation by the call. This weaker
        guarantee is "determinism", which we define to allow
        such always-fresh but otherwise equivalent.

Allowing fresh identities within the result would be adequate for `fn` not
to be a communications channel, even if those fresh objects were mutable,
since all their mutable state must have been allocated per call. But the
memoized form of such a function will share these result objects. If they
contained mutable state, then this sharing would have introduced a
communications channel. But even meeting all these requirements, the
resulting memoization is observable because it turns observably
distinct identities into observably shared identities.

## What Happens When a Module Meets its Eval Twin?

Only those modules whose exports preserve isolation
should be widely shared across a system.
But because of JavaScript's
[Eval Twin](https://github.com/endojs/endo/issues/1583) problem, such a module
should also be prepared to be haphazardly duplicated. Ideally, such a module
should act in such a way that its haphazard duplication is unobservable, so
when the haphazardness of its duplication changes, those changes are not
disruptive.

Some widely shared modules export expensive validation checks. When these
validation checks are expensive, we would often like to memoize their results.

For example, the function `passStyleOf` from the package `@endo/pass-style`
internally uses a memo for a huge efficiency gain, but is nevertheless
   * defensive
   * unobservable
   * not a communications channel

The `passStyleOf` function does accept primitives as well as valid WeakMap keys,
so `passStyleOf` itself is not the `memoFn` memoizing function.
Rather, `passStyleOf` case splits
and only memoizes its internal algorithm for the WeakMap-key cases.

## Caution

We do not currently have the tooling to check or enforce the above requirements.
That's why we phrase this as *contingent safety*. The `memoize` function
only guarantees this if-then safety property, but it cannot tell if the
condition part was satisfied. When it is not, the guarantees do not follow.
