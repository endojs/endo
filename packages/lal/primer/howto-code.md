# How-To: Evaluating Code and Defining Programs

Endo lets you evaluate JavaScript in a secure sandbox with
access to capabilities. There are two main patterns:
evaluate (you provide the capabilities) and define/endow
(the agent proposes, you provide).

## Quick Evaluation

```
/js E(counter).increment()
```

Chat's `/js` opens an inline form. Type `@` to add
endowments — you bind variable names in the code to
capabilities in your inventory. Press Enter to evaluate,
or Cmd+Enter to expand to a full editor.

## The Define/Endow Pattern

This is the key pattern for agent-assisted work. The agent
proposes code with named slots; you choose which capabilities
to bind.

**Step 1** — The agent calls `define()`:
```
define("E(db).get('users')", {
  "db": {"label": "A database to query"}
})
```

**Step 2** — You receive a definition message. In Chat,
the message card shows an inline form with a slot for each
named parameter. Fill in the pet name for each slot (e.g.,
bind `db` to `my-database`) and click Submit.

You can also use the `/endow` command to open a full modal
for reviewing the code and filling in bindings:
```
/endow 5
```

The code runs in a sandbox with your chosen endowments.
The result is named and stored in your inventory.

This pattern is central to attenuation — the agent proposes
a transformation, you provide the powerful input, and the
output is a less-powerful capability you can share safely.

## Viewing Code Before Endowing

When you receive a definition message, you can review the
proposed code before providing any capabilities. Use `/view`
on the definition or `/endow` to open the full modal, which
shows the source alongside the binding form.

## Running a Program File (CLI Only)

Program files run from the terminal — there is no Chat
equivalent:
```
endo run ./my-script.js --powers @agent
```

With `--UNCONFINED` for full host access:
```
endo run --UNCONFINED ./setup.js --powers @agent
```

## Creating a Worker

Workers are isolated execution contexts:

```
/spawn -n my-worker
```

## What's Available in Evaluated Code

- `E(target)` — Eventual-send for remote method calls
- `M` — Pattern matchers for interface guards
- `makeExo(tag, interface, methods)` — Create capability objects
- `harden(obj)` — Freeze an object for safe sharing

Endowments are lexical bindings — each code name becomes a
variable in scope. The *completion value* (the last expression)
becomes the result, so make sure the final expression
evaluates to whatever you want to produce.

Top-level `await` is not supported. For single async calls,
the promise itself is the completion value:
```
E(counter).increment()
```

For multiple async steps, use an async IIFE:
```
(async () => {
  const val = await E(counter).getValue();
  return E(logger).log(`Current: ${val}`);
})()
```

## Building Capabilities: A Graduated Guide

### 1. Simple value transformation

Evaluate code that transforms an existing capability:
```
/js E(counter).getValue()
```

### 2. Creating a new capability object

```
/js makeExo('Greeter', M.interface('Greeter', {
  hello: M.call(M.string()).returns(M.string()),
}), {
  hello(name) { return `Hello, ${name}!`; },
})
```

Name the result and share it with others.

### 3. Wrapping for attenuation

Create a read-only view by wrapping a read-write capability:
```
/js makeExo('ReadOnly', M.interface('ReadOnly', {
  get: M.call(M.string()).returns(M.any()),
  list: M.call().returns(M.any()),
}), {
  get(key) { return E(store).get(key); },
  list() { return E(store).list(); },
})
```

Bind `store` to your full-access store; the result exposes
only `get` and `list`.
