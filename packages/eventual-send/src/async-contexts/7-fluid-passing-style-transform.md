Imagine that all user code is rewritten according to the following fps (fluid passing style) transform, by analogy to a global cps transform.
   * Rewrite every pre-fps variable name by prepending an underbar.
   * For each pre-fps function definition, rewrite it to a post-fps function definition with an additional first `F` parameter.
   * For each pre-fps function call, rewrite it to a post-fps function call with an additional first `F` argument.
   * Do not transform `7-fluid-passing-style.js` itself. Rather, accept it as written manually in the post-fps language.

```js
(x, y) => f(a, b);
```
to
```js
(F, _x, _y) => _f(F, _a, _b);
```
