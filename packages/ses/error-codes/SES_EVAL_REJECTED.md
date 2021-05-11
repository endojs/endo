# Possible direct eval expression rejected (SES_EVAL_REJECTED)

The SES shim cannot implement or virtualize direct eval.

```js
const line = await console.readLine();
const value = eval(line); // Whoa!
```

JavaScript normally interprets a *direct eval expression* like `eval(line)` as
a syntactic *special form*, not a function call. This is gives the code read and
write access to the lexical scope of the code containing the direct eval
expression. Because the direct eval expression looks like a function call, the
scope of the code containing the direct eval expression is often mistakenly
called the *caller scope*, as it would in a genuine function call.

```js
'use strict';
let meaning;
eval('meaning = 42');
console.log(meaning); // 42
```

In sloppy mode, direct eval can also configure the scope it appears in with new
variables.

```js
eval('var meaning = 42');
console.log(meaning); // 42
```

Even more confusing, a direct eval expression only expresses a direct eval if
the binding for `eval` looked up by normal lexical lookup is the original
`eval` function, i.e., the original binding of the `eval` global variable. If
this occurrence of `eval` evaluates to anything else, then the direct eval
expression expresses an *indirect eval*. The semantics of an indirect eval is
exactly the function call that it looks like: it does a normal function call to
whatever it is that this `eval` evaluated to.

Under SES as proposed and as natively implemented, we would preserve exactly
these sematics. However, this is not feasible for the SES-shim. The SES-shim
necessarily replaces the `eval` global with its own safe emulation of the
original eval function, which is therefore not the same as the original eval
function. Therefore, any occurrences of the direct eval expression under the
SES-shim necessarily expresses an indirect eval.

Neither direct nor indirect eval raise any SES safety issue. Both semantics are
consistent with ocap rules. However, the divergence means that code written for
a SES machine, when run on the SES-shim, may mean something else and behave
differently. And likewise in the other direction. *By default* the SES-shim
therefore rejects *some* apparent direct eval expressions--the ones that
obviously look like direct eval expressions. Our rejection test has both false
negatives and false positives. Because there is no fundamental
safety issue at stake, the regexp will miss some direct eval expressions, such
as those with a comment between the `eval` and the `(`. OTOH, apparent direct
eval expressions written in the obvious way occurring in a comment or string
literal will cause rejection.

## Manually evading the direct eval expression rejection

Under the SES-shim code cannot express a direct eval. Since you can only
express indirect evals, you should rewrite SES-shim code like `eval(meaning)`
as `(1,eval)(meaning)` so that it always expresses an indirect eval, according
to JavaScript and SES as proposed and as natively implemented.

## Automatically suppressing the direct eval expression rejection

Because the rejection of some apparent direct eval expressions is not needed
for safety, this rejection test is optional and can be suppressed.

The compartment `evaluate` method has an optional options bag as its second
argument. The SES-shim recognizes an `__rejectSomeDirectEvalExpressions__`
option which defaults to `true`. Setting it to `false` suppresses this test and
rejection.

The `__rejectSomeDirectEvalExpressions__` option begins and ends with double
underbar as a reminder that it is present and meaningful only on the SES-shim.
It will not be present in either the SES proposal nor in native SES
implementations like Moddable's XS. Be careful with the
`__rejectSomeDirectEvalExpressions__` option as it will allow apparent direct
eval expressions, but the SES-shim will interpret these as indirect evals
whereas SES as proposed or natively implemented will interpret these as direct
evals.
