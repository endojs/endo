# no-polymorphic-call

> Disallow polymorphic method calls that may be corrupted or trapped.

**Category:** Possible Errors  
**Fixable:** No

## Why this exists

In Hardened JavaScript, method dispatch (`obj.method()`) goes through the object's prototype chain. A malicious or compromised object can provide a tainted method implementation that intercepts the call, exfiltrates arguments, or causes unexpected side effects — even if the caller believes it is talking to a trusted object.

This class of attack is called a **confused deputy via method call** or a **prototype-poisoning attack**. It is a known vector for supply-chain attacks in JavaScript.

The safe alternative is to use extracted, pre-hardened function references:

```js
// Instead of obj.method(arg)
const { method } = Object; // or whichever proto/intrinsic you're calling
method.call(obj, arg);
```

This rule flags _all_ method-call expressions (`expr.method()`) so authors make a conscious decision about trust.

> **Note:** This rule is intentionally strict and will fire on calls that are genuinely safe (e.g. `console.log()`, `array.push()`). It is best suited for high-security code paths such as SES bootstrap, not for general application code.
>
> The `@endo/ses` config enables this rule only for source files; test and demo files are exempt.

## Rule details

### Incorrect

```js
array.slice(1);       // ❌
obj.method();         // ❌
a.b.c(arg);           // ❌
console.log('hi');    // ❌ (even builtins are flagged)
```

### Correct

```js
const { slice } = Array.prototype;
slice.call(array, 1); // ✅

// Free function calls are not flagged
foo(arg);             // ✅
bar();                // ✅
```

## Options

This rule takes no options.

## When to disable

This rule is very aggressive by design. In most packages you'll want to enable it only for specific files (as the `@endo/ses` config does). For general-purpose code, disable it entirely or use inline exceptions for trusted calls:

```js
// eslint-disable-next-line @endo/no-polymorphic-call
console.error('Something went wrong:', err);
```
