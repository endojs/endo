# House style: arrow and method syntax over the `function` keyword

We do not use the `function` keyword in this repository's package sources
except in the specific categories listed under [Legitimate exceptions](#legitimate-exceptions).
New code uses arrow functions or concise method syntax instead.

## Rationale

`function`-keyword functions carry four distinct hazards inside
hardened-JavaScript code:

1. They have both `[[Construct]]` and `[[Call]]` behaviors, so they can be
   invoked with `new` even when the author never intended a constructor.
2. They have an initial `prototype` property that points at an irrelevant
   prototype object.
3. Because of that extra object, `freeze` is not equivalent to `harden`;
   the prototype object remains mutable and leaves hazardous reachable state.
4. Function-keyword declarations additionally have hoisting hazards.
   A function declaration `f` is hoisted and fully initialized before the
   module body runs — it has no temporal dead zone — masking
   initialization-order bugs. For example, a `harden(f)` or `freeze(f)`
   immediately after the function-keyword declaration of `f` does not
   prevent other code from mutating `f` before it is frozen.
   - This hazard exists even among code within one module, though these
     are less urgent because the eslint `no-use-before-define` rule
     reliably flags these hazards.
   - For an `export function f` exported function-keyword function
     declaration `f` in an import cycle, the importer can observe the
     function as a value before the rest of the exporting module has run.
     This case cannot be reliably avoided by other means.

The arrow function `() => {}` form has none of these hazards: no
`[[Construct]]`, no `prototype`, no early initialization (a `const` binding
stays in its temporal dead zone until evaluated), and `freeze` is equivalent to
`harden`. An arrow function lexically binds `this`, meaning that it is
insensitive to the `this`-binding provided by its callers.
Concise-method syntax (`{ name() {} }`, `{ get name() {} }`,
`{ set name(v) {} }`) likewise has no `[[Construct]]` and no `prototype`,
while being sensitive to the `this`-binding provided by its callers.

This rule was codified following erights's review on
[endojs/endo-but-for-bots#468](https://github.com/endojs/endo-but-for-bots/pull/468#issuecomment-3439684004).
The conversion itself landed on
[endojs/endo-but-for-bots#474](https://github.com/endojs/endo-but-for-bots/pull/474).

## Conversion rules

- Use an arrow function (`(...) => {}`) when the function does not use `this`
  and is never called with `new`.
- Use concise method syntax (`{ name(...) {} }`, `{ get name() {} }`,
  `{ set name(v) {} }`) when the function uses `this` (or `super`) but is
  never called with `new`.
  For a prototype monkey-patch that needs the method's `name` to surface in
  stack traces and diagnostics, write the methods as concise methods on an
  object literal and assign them onto the prototype (see
  `packages/init/src/node-async-local-storage-patch.js`): concise methods retain
  `name` while having no `[[Construct]]` and no `prototype`, so a named
  function expression is not needed for this case.
- Use a concise generator method (`{ *name() {} }`) or concise async-generator
  method (`{ async *name() {} }`) for generators and async generators: concise
  method syntax can spell both, so the `function*`/`async function*` keyword is
  not required to write one.
- Leave the `function` keyword in place for the legitimate-exception categories
  listed below.

The net behavioral diff when converting is intended to be zero: every
conversion preserves arity, return value, and `this` binding.
Hoisting changes from converting declarations are intentional (that is part of
the goal) but must not break existing call sites.

## Legitimate exceptions

The following uses of the `function` keyword stay in place.

### Constructor emulation

When the function is invoked with `new` (or is intended to be invokable with
`new`) to emulate a built-in constructor or a class constructor that
legitimately needs `[[Construct]]` and a `prototype` property:

- `packages/immutable-arraybuffer/src/lib.js`: `function PseudoTypedArray`,
  emulates a built-in TypedArray constructor (uses `new.target`,
  `construct(...)`, and exposes `prototype`).
- `packages/eventual-send/src/handled-promise.js`:
  `function BaseHandledPromise`, which the author already documented as
  "*needs* to be a `function X` so that we can use it as a constructor"
  (uses `new.target`).
- `packages/ses/src/tame-function-constructors.js`:
  `const InertConstructor = function () { throw TypeError(...) }`.
  The inert-constructor pattern depends on the function having `[[Construct]]`
  and a writable `prototype` property so SES can rewire it to point at the
  original constructor's prototype.
- Similar inert-constructor patterns inside SES's `tame-date-constructor`,
  `tame-regexp-constructor`, `tame-error-constructor`,
  `tame-v8-error-constructor`, `tame-symbol-constructor`,
  `make-function-constructor`.
  Each one is replacing a built-in constructor; the replacement must itself be
  a constructor.

### Standalone generator and async-generator expressions

Concise method syntax can spell a generator (`{ *name() {} }`) or an async
generator (`{ async *name() {} }`), so the `function*`/`async function*` keyword
is **not** the only way to write one.
Prefer a concise generator method, consistent with the rest of this house style;
reserve the keyword form for the standalone cases below.

The hazard profile is the same for both spellings: a generator (in either form)
cannot be invoked with `new` (the spec marks them non-constructable), so the
`[[Construct]]` hazard does not apply, but it still carries a `prototype`
property pointing at the generator's prototype, so `freeze` is not equivalent to
`harden` and the author must harden the wrapping closure, not just freeze it.
Concise method syntax does not remove that `prototype`; it only drops the
`function` keyword, which is why the preference is about house-style consistency
rather than a change in hazard.

The `function*`/`async function*` keyword stays in place in two situations: an
anonymous generator used only to reach an intrinsic generator prototype, and a
standalone top-level generator *declaration* that is not naturally a member of an
object. In both situations the generator is not an object member, so the only
keyword-free spelling would be to wrap it in an object literal and immediately
extract the method (`{ *name() {} }.name`); for these cases that wrapper is pure
indirection with no readability gain, so the keyword stays.

Intrinsic-prototype sentinels:

- `packages/trampoline/src/trampoline.js`: `function* () {}` sentinel, used only
  to extract the intrinsic generator prototype via `getPrototypeOf`.
- `packages/ses/src/commons.js` and `get-anonymous-intrinsics.js`: the same
  intrinsic-extraction pattern (including the Hermes async-generator
  feature-detection sentinel in `commons.js`).

Standalone top-level generator declarations:

- `packages/compartment-mapper/src/`: `function* enumerate`
  (`compartment-map.js`), `function* chooseModuleDescriptor` (`import-hook.js`),
  `function* getParserGenerator` (`map-parser.js`), and the `function*`
  declarations in `infer-exports.js` (`interpretBrowserField`,
  `interpretExports`, `interpretImports`, and the exported
  `inferExportsEntries`). These are module-level helper declarations, not members
  of any object.
- `packages/ses/src/module-load.js`: `function* loadWithoutErrorAnnotation`, a
  module-level declaration.

Generators that *are* naturally object members have been converted to concise
generator methods in this repository, so the keyword form is reserved for the
standalone cases above. The conversions include `packages/captp/src/atomics.js`'s
`trapHost` (now a concise `async *trapHost()` method on a hardened object) and the
`async function*` subscription generators in `packages/daemon/src/` — the
`followNameChanges`, `followIdNameChanges`, `followLocatorNameChanges`, and
`followMessages` generators in `pet-sitter.js`, `pet-store.js`, `mail.js`,
`directory.js`, and `daemon.js`, plus the `generateNumbers` connection-number
counters in `daemon-node-powers.js`, `networks/tcp-netstring.js`, and
`web-server-node.js`. Each was a `const` bound to a named generator expression and
later assembled into a returned or `Far()`/`makeExo`-wrapped object; each is now
written as a concise generator method on an object literal, preserving the `const`
binding, the generator's name, and its JSDoc `@type` annotation while dropping the
`function*` keyword.

### Vendored or third-party-derived code

Code we received from upstream projects and only lightly modify keeps the
upstream style so future merges remain tractable:

- `packages/cjs-module-analyzer/index.js`: a port of `es-module-lexer` by
  Guy Bedford.
  The file uses around 38 inner `function` declarations as a single-pass lexer
  with mutual recursion; `no-use-before-define` is intentionally disabled.
  Converting these to arrows would force a manual reorder and risk a
  performance regression in a hot path.
- `packages/test262-runner/test262/`: the upstream tc39/test262 suite,
  vendored under the tc39 LICENSE.
  Out of scope by license.

### Sloppy-mode `this` detection

`packages/ses/src/assert-sloppy-mode.js`:
`function getThis() { return this; }`.
The whole point of this function is that, called as a bare `getThis()`, it
returns the calling-context `this` (which is `globalThis` in sloppy mode and
`undefined` in strict mode), so SES can detect the ambient strictness.
An **arrow** function is disqualified: it binds `this` lexically — insensitive
to the caller — so it would return the module-scope `this` (always `undefined`
under modules) and defeat the check.
A **concise method**, by contrast, is sensitive to the caller-provided `this`
in the same way a function-keyword function is, so it would in fact work here.
We keep the `function`-keyword declaration only because this is a
security-critical SES-initialization tripwire where the bare
`function getThis() { return this; }` is the canonical, well-understood spelling
of an ambient-`this` probe; wrapping it in an object literal solely to extract a
concise method (`{ getThis() {} }.getThis`) would add indirection to a security
boundary for a purely stylistic gain.

### Static-checker limitations: suppress, do not keep the runtime hazard

When a TypeScript or lint limitation appears to push toward retaining the
`function` keyword, prefer the less-hazardous runtime form (arrow or concise
method) and suppress the checker with `@ts-expect-error` or `@ts-ignore`, rather
than keeping the hazardous runtime form in order to satisfy the checker.
The runtime behavior is what counts; a static-checker weakness is the cheaper
thing to work around.

A motivating case was TypeScript assertion functions
(`@returns {asserts x is Y}`).
It is sometimes assumed that an assertion function must be a `function`
declaration and that converting it to an arrow drops the `asserts` narrowing
(the compiler's TS2775, "Assertions require every name in the call target to be
declared with an explicit type annotation").
That turns out not to be so: an arrow function with a JSDoc
`@returns {asserts ...}` annotation — plus, where an implementation-only
parameter must be hidden from the public signature, a JSDoc `@overload` block,
which attaches to a `const` arrow just as it does to a declaration — carries the
assertion narrowing with no suppression at all.
`packages/compartment-mapper/src/compartment-map.js`'s
`assertModuleConfiguration` is written this way (arrow plus `@overload`), so it
needs neither the `function` keyword nor an `@ts-expect-error`.
If a genuine checker limitation ever does block such a conversion, reach for
`@ts-expect-error`/`@ts-ignore` before reaching for the `function` keyword.

### Module-init-time forward references

If the function is referenced by name during module top-level evaluation
(not from inside another function body), converting the declaration to a
`const` arrow puts the reference into TDZ.
We do not reorder the file to work around this; we keep the `function`
declaration and add a note.
Concrete sites:

- `packages/captp/src/captp.js`: `convertValToSlot` and `convertSlotToVal`
  are passed as arguments to `makeMarshal(...)` during module init from
  hundreds of lines earlier than their declarations.
- `packages/ocapn/src/client/ocapn.js`: `function serializeAndSendMessage`
  is passed into `makeOcapnCommsKit({...rawSend: serializeAndSendMessage})`
  during module init before its declaration.
- `packages/eslint-plugin/lib/rules/assert-fail-as-throw.js`: top-level
  `safeRequire(...)` calls at file head precede `function safeRequire`'s
  declaration further down.
  The file is adopted from mysticatea/eslint-plugin-node with an explicit
  `/* eslint-disable no-use-before-define */` at the top to permit the
  hoisting; converting it would force a full reorder of code we want to keep
  diff-tractable against upstream.

### Vendored runtime template literals

The bundler in `packages/compartment-mapper/src/bundle-mjs.js` and
`packages/compartment-mapper/src/bundle-cjs.js` builds output JavaScript from
template-literal `runtime` strings.
The `function observeImports` and `function wrapCjsFunctor` inside those
strings are the bundler's output code, not module-side code, and are out of
scope.

## Applying this rule to new code

When writing a new function:

1. Does it need `[[Construct]]` (called with `new`) or a `prototype` property?
   Use a `class` or a `function`-keyword function, and document why.
2. Does it need to be sensitive to the `this`-binding provided by its callers?
   Use concise method syntax inside an object literal or class body.
3. Otherwise, use an arrow function.

When converting existing `function`-keyword code, verify that the conversion
falls outside all exception categories above, run `yarn test` for the affected
package, and confirm the behavioral diff is zero.
