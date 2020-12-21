# Possible HTML-like comment rejected (SES_HTML_COMMENT_REJECTED)

When web browsers first introduced `<script>` tags and JavaScript, earlier
versions of the browser would show the script instead of running it.
To facilitate the transition, JavaScript optionally tolerates so-called
["HTML-like comments"](https://tc39.es/ecma262/#sec-html-like-comments
) in its own grammar, where `<!--` and `-->` could be treated
in a manner similar to `//`, as line comments extending to the end of the
current line. Never mind that this treatment is incoherent compared to the
original motivation, where HTML itself treats these as the open and close
of multiline block comments.

A JavaScript module parsing must not recognize such an HTML-like comment.
Only a JavaScript script (program) parsing may optionally recognize it. The
script parsing of some platforms do and some do not. Code such as
```js
a <!-- b
```
might thus be valid under each interpretation but with two completely different
meanings. For tooling there is therefore no behavior that is both consistent
and correct without being specific to a particular JavaScript target engine.
If the tooling parses code one way and the target engine parses code another
way, [attackers have an inconsistency they can exploit](https://www.youtube.com/watch?v=pXN-D7le7Xk&list=PLzDw4TTug5O3vIAd4IR1Gp5t_46co_dv9&t=381).

The only safe choice is one that rejects code for which tooling may have parsed
it one way and the engine another. Thus, if the code appears to have an
HTML-like comment, the SES-shim rejects it.

## Manually evading the HTML-like comment rejection

To manually evade this censorship, avoid the substrings `<!--` and `-->`. In
code where these were intended to represent operators, you can preserve the
meaning by inserting spaces:

```js
a < ! --b
```

In literal strings, rewrite your source so it still evaluates to the same
string.

```js
// <!- SES forbids HTML comments, even in comments ->
const commentStart = "<!" + "--";
```

## Automatically evading the HTML-like comment rejection

The compartment `evaluate` method has an optional options bag as its second
argument. The SES-shim recognizes an `__evadeHtmlCommentTest__` option
which defaults to `false`. If set to `true` the code to be evaluated is first
transformed with a regexp-based rewrite to apparent HTML-like comments like
`a <!-- b` into `a < ! -- b` before subjecting it to the censoring of
apparent import expressions.

The `__evadeHtmlCommentTest__` option begins and ends with double underbar
as a reminder that it is present and meaningful only on the SES-shim. It will
not be present in either the SES proposal nor in native SES implementations like
Moddable's XS. Be careful with the `__evadeHtmlCommentTest__` option as it
can change the meaning of programs if the suspect text appears in a literal
string. If the suspect text appears in code, the rewrite will preserve the
operator meaning, but that might not be the meaning the author of that code
intended.
