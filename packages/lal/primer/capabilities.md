# Working with Capabilities

## Names

There are two kinds of name in your inventory:

**Special names** start with `@` and are read-only and indelible
— you cannot remove, rename, or overwrite them:

- `@self` — Your own handle
- `@host` — Your host's handle (who can grant you capabilities).
- `@agent` — The own agent reference.
- `@main` - Your own worker, where you can run JavaScript programs.

**Pet names** are labels like `my-counter` or `project-data` that you choose.
You can create, rename, copy, and remove them freely.
By convention, they are lowercase alphanumeric with hyphens (`a-z0-9-`, 1–128
characters).

## define() vs evaluate()

Prefer `define()` when the user asks for code but you don't
have all the required capabilities in your directory. `define()`
lets the host choose what to bind:

```
define("E(counter).increment()", {"counter": {"label": "A counter to increment"}})
```

The host sees the slot labels, fills each one from their
inventory (endow), and the code executes. You receive a receipt,
not the result. The host sees the result in their inbox and may
share it with you via `reply()`.

Use `evaluate()` when you already have every capability needed
in your own directory and can provide them via
codeNames/edgeNames:

```
evaluate('@main', "E(counter).increment()", ["counter"], ["my-counter"], "increment-result")
```

`evaluate()` executes the code directly and stores the result under resultName.
You can send results back to the user with a reply, or a message to `@host`,
using the resultName.

The codeNames array lists variable names used in your source
code. The edgeNames array lists the pet names from YOUR
directory providing those values.

## How Endowments and Results Work

Endowments are *lexical bindings* — each code name in your
source becomes a variable in scope when the code executes.
If you `define()` with `{"db": {"label": "A database"}}`,
the variable `db` is available in the source code, bound to
whatever capability the host provides.

The *completion value* of the program (the value of its last
expression) becomes the result. To produce an output, make
sure the last expression evaluates to the value you want:

```
// Good — completion value is the promise from E()
E(db).get("users")
```

```
// Good — completion value is the new capability
makeExo("ReadOnly", iface, methods)
```

```
// Bad — the last expression is an assignment, result is undefined
const result = E(db).get("users")
```

Top-level `await` is not supported. If you need to sequence
multiple async operations, use an async IIFE:

```
(async () => {
  const users = await E(db).get("users");
  const count = users.length;
  return E(logger).log(`Found ${count} users`);
})()
```

The IIFE returns a promise, which becomes the completion
value. The host receives the resolved result.

Simple single-expression programs do not need an IIFE —
`E(counter).increment()` already returns a promise that
resolves to the result.

## Globals Available in Evaluated Code

When your code executes (after host grants), these globals are
available:

- **E(target)** — Eventual-send for remote method calls on
  capabilities.
  Example: `E(counter).increment()` calls increment() on a
  remote counter.
  Example: `E(store).get("key")` retrieves a value from a
  remote store.

- **M** — Pattern matchers for interface guards.
  Example: `M.string()` matches strings.
  Example: `M.interface('Foo', { bar: M.call().returns(M.number()) })`

- **makeExo(tag, interface, methods)** — Create new capability
  objects. Example:
  ```javascript
  makeExo('Counter', M.interface('Counter', {
    increment: M.call().returns(M.number()),
    getValue: M.call().returns(M.number()),
  }), {
    increment() { return ++this.state.count; },
    getValue() { return this.state.count; },
  })
  ```

Use these to:
- Invoke methods on capabilities passed as endowments
- Create new capabilities to send back to requesters
- Define type-safe interfaces for your created objects

## Workflow Examples

Using define() (preferred when you don't have the capability):

1. Receive request: "Please increment my counter"
2. `define("E(counter).increment()", {"counter": {"label": "The counter to increment"}})`
3. Host endows the slot with their counter -> you receive a
   receipt (not the result)
4. Wait for the host to share the result via a reply message,
   then `reply()` to the original sender

Using evaluate() (when you already have the capability in your
directory):

1. Receive request: "Please increment my counter" (and they
   sent you the counter)
2. `adopt()` the counter from the message
3. `evaluate(undefined, "E(counter).increment()", ["counter"], ["my-counter"], "increment-result")`
4. `lookup("increment-result")` then `reply()` to deliver it
   back
