# no-assign-to-exported-let-var-or-function

> Disallow assignment to exported `let`, `var`, or `function` bindings.

**Category:** Possible Errors  
**Fixable:** No

## Why this exists

In standard ES module semantics, exported bindings are _live_: if you reassign an exported `let` variable inside the module, importers see the updated value on the next read. This sounds convenient, but it creates a subtle hazard.

When combined with Hardened JavaScript and `harden()`, live exports break the integrity guarantee: even if an importer cannot directly modify the exported binding (thanks to hardening), the **exporting module itself** can reassign it under the importer's feet. This is a form of confused-deputy bug and makes reasoning about module invariants much harder.

The rule catches:

- Direct assignment (`exportedLet = newValue`)
- Compound assignment (`exportedLet += 1`)
- Update expressions (`exportedLet++`)
- Destructuring assignment targeting an exported binding (`({ exportedLet } = obj)`)
- Exported `function` declarations (whose name is a mutable binding)
- Separate `export { local }` followed by `local = ...` in the same file

## Rule details

### Incorrect

```js
export let counter = 0;
counter++;            // ❌ assignment to exported let

export function increment() {}
increment = () => {}; // ❌ reassignment of exported function name

let value = 1;
export { value };
value = 2;            // ❌ assignment to separately-exported let
```

### Correct

```js
export const PI = 3.14; // const — cannot be reassigned anyway

let internal = 0;
export const getInternal = () => internal;
internal++;  // ✅ not exported directly

// Use a plain object or class for mutable state
export const counter = { value: 0 };
counter.value++; // ✅ property write, not a reassignment of the binding
harden(counter);
```

## Options

This rule takes no options.

## When to disable

If you intentionally rely on live-binding semantics (e.g. an `export let` that is updated during module initialization before any importer can observe it), you can disable the rule for specific lines:

```js
export let initialized = false;
// eslint-disable-next-line @endo/no-assign-to-exported-let-var-or-function
initialized = true;
```
