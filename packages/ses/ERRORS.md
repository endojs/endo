
## SESERR1: Possible eval expression reject

The SES shim cannot virtualize dynamic eval.

```js
const line = await console.readLine();
const value = eval(line); // Whoa!
```

JavaScript interprets a direct eval, as in `eval(line)` as an operator, not a
function call.
This is necessary to give the code read and write access to the lexical scope
of the caller, a *dynamic scope*.

```js
'use strict';
let meaning;
eval('meaning = 42');
console.log(meaning); // 42
```

In sloppy mode, direct eval can also configure the caller scope with new
variables.

```js
eval('var meaning = 42');
console.log(meaning); // 42
```

Because this kind of `eval` is syntax, the SES shim has no way to intercept and
sandbox these expressions.
If client code could perform a direct `eval`, they could escape the SES
sandbox.

The SES shim could perform a full lexical analysis of the source to forbid
direct `eval`, but that would entrain a very large and volatile dependency in
the runtime.
Instead, the SES shim forbids any substring of the source containing what could
be a direct eval.

The SES shim does support *indirect eval*.
When client code captures `eval` in an expression, they get a reference
to a global `eval` function.
The SES shim is able to intercept the `eval` function in lexical scope and
provide a sandboxed version instead.

```js
globalThis.meaning = 42;
const globalEval = eval;
globalEval('meaning'); // 42
```

So, to evade censorship of *direct eval*, you may be able to use an `eval`
expression, if you do not depend on the ability to reach dynamic scope.

```js
// Before
eval(code);
// After
(0, eval)(code);
```

## SESERR2: Possible import expression rejected

Calling `import` as function, like direct `eval`, is JavaScript syntax
and doesn't depend on `import` being in the lexical scope.
Since the SES shim cannot intercept access to `import` in lexical scope,
the SES shim forbids any text that appears to call `import`, even in a comment,
even as a method of another object.

Client code can be refactored to avoid `import` censorship, with many
techniques.

To call `import` in lexical scope, capture it in an expression.

```js
const globalImport = import;
globalImport(specifier);
```

```js
(0, import)(specifier);
```

At time of writing, the SES shim does not implement dynamic import in a
compartment, even in lexical scope, but compartments implement a similar
`import` method.

Import methods can be called using a computed property.

```js
compartment['import'](specifier);
```

Using parentheses could also work, but unnecessary parentheses are
unlikely to survive a round trip through a minifier, so be sure to
also use a comma expression.

```js
(0, compartment.import)(specifier);
```

## SESERR3: Possible HTML comment rejected

When web browsers first introduced `<script>` tags and JavaScript, earlier
versions of the browser would how the script instead of running it.
To facilitate the transition, JavaScript tolerated HTML comments in
its own grammar, such that a script could be embedded and would
be ignored in legacy browsers.

```js
<script><!--
alert("There wasn't a console.");
// --></script>
```

HTML comments are still valid JavaScript, and in combination with dynamic eval
or dynamic import, could be used to escape the SES language sandbox.

A SES machine with a full lexer or parser for the language could handle these
comments safely.
But, in order to avoid entraining a large dependency in the SES shim, the shim
instead forbids the HTML comment tokens anywhere in the text.

To manually evade this censorship, the substrings `<!--` and `-->` must be
avoided.

```js
// <!- SES forbids HTML comments, even in comments ->
const commentStart = "<!" + "--";
```
