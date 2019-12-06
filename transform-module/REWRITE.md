For each top level variable declaration, we make an entry
from a variable name to the variable declaration path.  That allows
us to look up the path.scope.bindings[name] to see if constant === true.

If anything from the declaration was exported, we change the declaration
to `const`.  After, the rest of the rewrite introduces either:

```js
$h_once.name(name); // only if was const or let but constant === true
$h_live.name($c_name); // only if exported let
let name = $c_name; // only if non-exported let
```

## export { vname }

```js
const cv = 123; // const, guaranteed not modified
let [mv, lv, uv] = [456, 789]; // modified, not modified, unexported
mv += 1;
export { cv as cv1, mv as mv1, lv as lv1 };
```

```js
const cv = 123; $h_once.cv(cv); // const, guaranteed not modified
const [$c_mv, lv, $c_uv] = [456, 789]; \
  $h_live.mv($c_mv); $h_once.lv(lv); let uv = $c_uv; // modified, not modified, unexported
mv += 1;
```

## export const

```js
export const { abc: abc2, nest: [def2] } = obj;
```

```js
// temporal dead zone for const decls until...
const { abc: abc2, nest: [def2] } = obj; \
  $h_once.abc2(abc2); $h_once.def2(def2); // ... here.
```

## export let

```js
export let { abc: abc2, nest: [def2] } = obj;
```

```js
// temporal dead zone for let decls until...
const { abc: $c_abc2, nest: [$c_def2] } = obj; \
  $h_live.abc2($c_abc2); $h_live.def2($c_def2); // ... here.
```

## export var

```js
export var { abc: abc2, nest: [def2] } = obj;
```

```js
$h_live.abc2(); $h_live.def2(); // hoisted decls (no tdz)
...
// Use the proxy traps created by our hoisted decls.
const { abc: $c_abc2, nest: [$c_def2] } = obj; \
  abc2 = $c_abc2; def2 = $c_def2;
```

## export function

```js
export function fn() {
  ...
};
```

```js
// Rename function and hoist proxy assignment.
Object.defineProperty($c_fn, 'name', { value: 'fn' }); \
$h_live.fn($c_fn); \
...
function $c_fn() {
  ...
}
```

## export default

In order to properly assign the 'default' name to exported anonymous functions and classes, we rewrite:

```js
export default XXX;
```

to:

```js
const {default: $c_default} = {default: (XXX)}; $h_once.default($c_default);
```
