# harden-exports

> Ensure each named export is immediately followed by a call to `harden`.

**Category:** Possible Errors  
**Fixable:** Yes (code)

## Why this exists

In Hardened JavaScript (powered by SES), `harden()` deep-freezes an object and all transitively-reachable objects, making them tamper-proof. Any value that could be reached by external code — in other words, anything you export — **must** be hardened before other code gets a chance to modify it.

If you forget to harden an exported value, a malicious or buggy importer can mutate it before you or another legitimate consumer uses it. This is the "confused-deputy" class of supply-chain attacks that SES is designed to prevent.

This rule enforces that every named export has a corresponding `harden(exportedName)` call somewhere in the module body. It also requires that exported functions be declared as `const` arrow functions (not `function` declarations) because `function` hoisting makes the binding mutable before it can be hardened.

Pattern-maker calls (`M.string()`, `M.arrayOf(...)`, etc.) are exempt because those values are already hardened by the Endo pattern-maker API.

## Rule details

### Incorrect

```js
// Missing harden()
export const foo = { key: 'value' };

// Function declarations cannot be hardened early enough
export function bar() { return 42; }
```

### Correct

```js
export const foo = { key: 'value' };
harden(foo);

// Use a const + arrow function instead
export const bar = () => 42;
harden(bar);

// Pattern makers are already hardened; harden() is optional
export const Shape = M.string();
```

### Destructuring

The rule understands all destructuring forms:

```js
// object destructuring
export const { a, b } = obj;
harden(a);
harden(b);

// aliased destructuring — harden the alias, not the original name
export const { x: aliasForX } = obj;
harden(aliasForX);

// array destructuring
export const [first, ...rest] = arr;
harden(first);
harden(rest);
```

## Options

This rule takes no options.

## When to disable

If you are writing a module that will never run in a hardened environment (e.g. a Node.js CLI tool that does not call `lockdown()`), this rule may not apply to you. Disable it with:

```js
/* eslint-disable @endo/harden-exports */
```
