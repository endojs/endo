User-visible changes in `@endo/errors`:

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
