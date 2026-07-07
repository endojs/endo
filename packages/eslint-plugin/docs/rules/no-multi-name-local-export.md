# no-multi-name-local-export

> Disallow exporting the same local binding under multiple names.

**Category:** Possible Errors  
**Fixable:** No

## Why this exists

When the same local value is exported under more than one name, it creates aliasing that makes a module's public API ambiguous. Consumers may use either name, receive the same object, and become confused when mutation (or hardening) through one alias is observed through the other.

In Hardened JS, this matters because `harden()` calls in the exporting module are typically written per-export-name:

```js
export const a = makeValue();
export { a as b };
harden(a); // does this cover 'b' too?
```

The answer is "yes, they're the same object" — but it's easy to miss. Forbidding multi-name exports of the same binding makes the intent clear.

This rule only checks _local value exports_. Re-exports from other modules (`export { x } from 'mod'`) and type-only exports (`export type { T }`) are ignored.

## Rule details

### Incorrect

```js
const foo = 1;
export { foo, foo as bar }; // ❌ 'foo' exported as both 'foo' and 'bar'

export const a = 1;
export { a as b };          // ❌ 'a' exported under two names across statements
```

### Correct

```js
// Each local binding exported under exactly one name
export const foo = 1;
export const bar = foo; // a separate binding
harden(foo);
harden(bar);

// Re-exports from another module are fine
export { x as y } from 'mod';

// Type-only exports are fine
export type { MyType };
```

## Options

This rule takes no options.

## When to disable

Rare compatibility shims sometimes deliberately export the same value under a legacy name and a new name (e.g., `{ createFoo, makeFoo }`). If you need this pattern, disable the rule inline:

```js
// eslint-disable-next-line @endo/no-multi-name-local-export
export { makeFoo, makeFoo as createFoo };
```
