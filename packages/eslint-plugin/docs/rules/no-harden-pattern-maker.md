# no-harden-pattern-maker

> Disallow `harden()` on values returned by Pattern makers (`M.*`), which are already hardened.

**Category:** Suggestions  
**Fixable:** Yes (code)

## Why this exists

Endo's Pattern-maker API (`M.string()`, `M.arrayOf(M.string())`, `M.recordOf(...)`, etc.) returns values that are **always hardened** by the implementation. Calling `harden()` on them again is a no-op: harmless, but noisy and misleading.

The double-`harden` pattern suggests the author didn't know that Pattern makers already harden their output, which may indicate broader confusion about which values need hardening. Flagging it keeps the codebase explicit and consistent.

## Rule details

The rule recognizes Pattern maker calls by the shape `M.<anything>(...)`. It checks both:

1. Inline calls — `harden(M.string())`
2. Variables bound to a Pattern maker — `const s = M.string(); harden(s);`

Only the bare identifier `M` (the global from the Endo Pattern namespace) is recognized. `thirdPartyM.string()` is not flagged.

### Incorrect

```js
// Inline — harden() is unnecessary
export const StringShape = harden(M.string());

// Via variable — M.string() is already hardened
const MyPattern = M.arrayOf(M.string());
harden(MyPattern);
```

### Correct

```js
// Pattern makers are already hardened; no harden() needed
export const StringShape = M.string();

// Non-M.* values do need harden()
export const config = { name: 'myPackage' };
harden(config);
```

## Options

This rule takes no options.

## When to disable

You should not need to disable this rule. The autofix removes the redundant `harden()` call safely.
