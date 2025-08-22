User-visible changes in `@endo/errors`:

# Next release

- `hideAndHardenFunction` - If a function `foo` is first frozen with `hideAndHardenFunction(foo)` rather than `freeze(foo)` or `harden(foo)`, then `foo.name` is changed from `'foo'` to `'__HIDE_foo'`. When `stackFiltering: 'concise'` or `stackFiltering: 'omit-frames'`, then (currently only on v8), the stack frames for that function are omitted from the stacks reported by our causal console.

# v1.1.0 (2024-02-22)

- `AggegateError` support
  - Assertion functions/methods that were parameterized by an error constructor
    (`makeError`, `assert`, `assert.fail`, `assert.equal`) now also accept named
    options `cause` and `errors` in their immediately succeeding
    `options` argument.
  - For all those, the error constructor can now be an `AggregateError`.
    If they do make an error instance, they encapsulate the
    non-uniformity of the `AggregateError` construction arguments, allowing
    all the error constructors to be used polymorphically
    (generic / interchangeable).
  - Adds a `GenericErrorConstructor` type to be effectively the common supertype
    of `ErrorConstructor` and `AggregateErrorConstructor`, for typing these
    error constructor parameters that handle the error constructor
    polymorphically.
  - The SES `console` now includes `error.cause` and `error.errors` in
    its diagnostic output for errors.
