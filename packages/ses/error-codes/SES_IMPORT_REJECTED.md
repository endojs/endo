# Possible import expression rejected (SES_IMPORT_REJECTED)

A dynamic import expression, like `import(expr)` looks like a function call to
a function named `import`. However, `import` is a keyword rather than a
variable name so there is no such function and no lexical binding.
Since the SES-shim cannot intercept access to `import` in lexical scope,
the SES-shim forbids any text that appears to call `import`, even in a comment
or literal string, even as a method of another object.

This is a limitation only of the SES-shim. The SES-shim's security must not rely
on a JavaScript parser or tokenizer being precise. Instead, we reject import
expressions conservatively using a regular expression which therefore causes
some false rejections. Any direct implementation of SES as proposed, such as
Moddable's XS machine, does not suffer from this limitation.

## Manually evading the import expression rejection

Compartments implement a similar `import` method you could use instead.

```js
compartment.import(specifier);
```

However, beware the difference in semantics. The dynamic import expression is
reletaive to the "referrer" module, i.e., the module containing the import
expression. The compartment `import` method is not.

## Automatically evading the import expression rejection

The compartment `evaluate` method has an optional options bag as its second
argument. The SES-shim recognizes an `__evadeImportExpressionTest__` option
which defaults to `false`. If set to `true` the code to be evaluated is first
transformed with a regexp-based rewrite to apparent import expressions like
`import(expr)` into `__import__(expr)` before subjecting it to the censoring of
apparent import expressions.

The `__evadeImportExpressionTest__` option begins and ends with double underbar
as a reminder that it is present and meaningful only on the SES-shim. It will
not be present in either the SES proposal nor in native SES implementations like
Moddable's XS. Be careful with the `__evadeImportExpressionTest__` option as it
can change the meaning of programs.
