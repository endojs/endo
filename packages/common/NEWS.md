User-visible changes in `@endo/common`:

# v1.1.0 (2024-02-22)

- `throwLabeled` parameterized error construction
  - Like the assertion functions/methods that were parameterized by an error
    constructor (`makeError`, `assert`, `assert.fail`, `assert.equal`),
    `throwLabeled` now also accepts named options `cause` and `errors` in its
    immediately succeeding `options` argument.
  - Like those assertion functions, the error constructor argument to
    `throwLabeled` can now be an `AggregateError`.
    If `throwLabeled` makes an error instance, it encapsulates the
    non-uniformity of the `AggregateError` construction arguments, allowing
    all the error constructors to be used polymorphically
    (generic / interchangeable).
  - The error constructor argument is now typed `GenericErrorConstructor`,
    effectively the common supertype of `ErrorConstructor` and
    `AggregateErrorConstructor`.
