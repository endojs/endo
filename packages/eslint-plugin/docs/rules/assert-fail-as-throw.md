# assert-fail-as-throw

> Make `assert.fail()` count as a `throw` in ESLint's control-flow analysis.

**Category:** Possible Errors  
**Fixable:** No

## Why this exists

ESLint's built-in control-flow analysis knows that `throw` terminates a code path. It uses this information for rules like `no-unreachable`, `consistent-return`, and `no-fallthrough`.

In Endo/SES code, `assert.fail(message)` is the idiomatic way to throw an assertion error (it calls `Fail\`...\`` under the hood). However, ESLint's analyzer doesn't know that `assert.fail()` is equivalent to `throw`, so code that follows an `assert.fail()` is incorrectly flagged as reachable.

This rule patches ESLint's internal `CodePathAnalyzer` so that `assert.fail()` is treated as a terminating expression — exactly like `throw`. This allows all throw-aware rules to work correctly when `assert.fail()` is used.

> **Note:** ESLint 8.23+ restricts access to its internal modules via the `exports` field in `package.json`. When those internals are not accessible, this rule silently becomes a no-op rather than throwing an error. The rule will log no violations regardless.

## Rule details

### Without this rule

```js
function checkPositive(n) {
  if (n <= 0) {
    assert.fail(`Expected positive number, got ${n}`);
  }
  return n; // ESLint may incorrectly warn about "consistent-return" here
}
```

### With this rule enabled

ESLint treats `assert.fail()` as a throw, so the `return` on the happy path is recognized as the only return in the function body.

## Options

This rule takes no options.

## When to disable

Disable this rule if you are not using the Endo `assert` library, or if you are using a different assertion library that throws in a different way.
