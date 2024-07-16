
## Reference: Test Results

Pairs of module source vs functor source. The output was generated.

### test-export-default.js

#### Case 1

```js
 export default bb;
```

```js
 (({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,  }) => {   $h‍_imports(new Map([]), []);   const { default: $c‍_default } = { default: bb };$h‍_once.default($c‍_default);
})
```

#### Case 2

```js
 export default class { valueOf() { return 45; } }

```

```js
 (({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,  }) => {   $h‍_imports(new Map([]), []);   const { default: $c‍_default } = { default: class {valueOf() {return 45;}} };$h‍_once.default($c‍_default);
})
```

#### Case 3

```js
 //#! /usr/bin/env node
export default 123
```

```js
 (({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,  }) => {   $h‍_imports(new Map([]), []);   //#! /usr/bin/env node
const { default: $c‍_default } = { default: 123 };$h‍_once.default($c‍_default);
})
```

#### Case 4

```js
 export default arguments;
```

```js
 (({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,  }) => {   $h‍_imports(new Map([]), []);   const { default: $c‍_default } = { default: arguments };$h‍_once.default($c‍_default);
})
```

#### Case 5

```js
 export default this;
```

```js
 (({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,  }) => {   $h‍_imports(new Map([]), []);   const { default: $c‍_default } = { default: this };$h‍_once.default($c‍_default);
})
```

### test-export-name.js

#### Case 1

```js
 export let abc = 123;
export let def = 456;
export let def2 = def;
def ++;
export const ghi = 789;

```

```js
 (({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,  }) => {   $h‍_imports(new Map([]), []);   let abc = 123;$h‍_once.abc(abc);
let $c‍_def = 456;$h‍_live.def($c‍_def);
let def2 = def;$h‍_once.def2(def2);
def++;
const ghi = 789;$h‍_once.ghi(ghi);
})
```

#### Case 2

```js
 export const abc = 123;
export const { def, nest: [, ghi, ...nestrest], ...rest } = { def: 456, nest: [ 'skip', 789, 'a', 'b' ], other: 999, and: 998 };

```

```js
 (({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,  }) => {   $h‍_imports(new Map([]), []);   const abc = 123;$h‍_once.abc(abc);
const { def, nest: [, ghi, ...nestrest], ...rest } = { def: 456, nest: ['skip', 789, 'a', 'b'], other: 999, and: 998 };$h‍_once.def(def);$h‍_once.ghi(ghi);$h‍_once.nestrest(nestrest);$h‍_once.rest(rest);
})
```

#### Case 3
```js
 const abc2 = abc;
export const abc = 123;

```

```js
 (({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,  }) => {   $h‍_imports(new Map([]), []);   const abc2 = abc;
const abc = 123;$h‍_once.abc(abc);
})
```

#### Case 4
```js
 const abc2 = abc;
export let abc = 123;

```

```js
 (({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,  }) => {   $h‍_imports(new Map([]), []);   const abc2 = abc;
let abc = 123;$h‍_once.abc(abc);
})
```

#### Case 5
```js
 export const abc2 = abc;
export var abc = 123;
export const abc3 = abc;

```

```js
 (({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,  }) => {   $h‍_imports(new Map([]), []);$h‍_live.abc();   const abc2 = abc;$h‍_once.abc2(abc2);
var $c‍_abc = 123;abc = $c‍_abc;
const abc3 = abc;$h‍_once.abc3(abc3);
})
```

#### Case 6
```js
 export const fn2 = fn;
export function fn() {
  return 'foo';
}
export const fn3 = fn;

```

```js
 (({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,  }) => {   $h‍_imports(new Map([]), []);Object.defineProperty($c‍_fn, 'name', {value: "fn"});$h‍_live.fn($c‍_fn);   const fn2 = fn;$h‍_once.fn2(fn2);
function $c‍_fn() {
  return 'foo';
}
const fn3 = fn;$h‍_once.fn3(fn3);
})
```

#### Case 7
```js
 export let count = 0;
export class C {} if (C) { count += 1; }

```

```js
 (({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,  }) => {   $h‍_imports(new Map([]), []);   let $c‍_count = 0;$h‍_live.count($c‍_count);{
  class C {}$h‍_live.C(C);}if (C) {count += 1;}
})
```

#### Case 8
```js
 export default class C {}

```

```js
 (({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,  }) => {   $h‍_imports(new Map([]), []);   const { default: $c‍_default } = { default: class C {} };$h‍_once.default($c‍_default);
})
```

#### Case 9
```js
 export default class {}

```

```js
 (({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,  }) => {   $h‍_imports(new Map([]), []);   const { default: $c‍_default } = { default: class {} };$h‍_once.default($c‍_default);
})
```

#### Case 10
```js
 export default (class {});

```

```js
 (({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,  }) => {   $h‍_imports(new Map([]), []);   const { default: $c‍_default } = { default: class {} };$h‍_once.default($c‍_default);
})
```

#### Case 11
```js
 F(123);
export function F(arg) { return arg; }

```

```js
 (({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,  }) => {   $h‍_imports(new Map([]), []);Object.defineProperty($c‍_F, 'name', {value: "F"});$h‍_live.F($c‍_F);   F(123);
function $c‍_F(arg) {return arg;}
})
```

#### Case 12
```js
 export default async function F(arg) { return arg; }

```

```js
 (({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,  }) => {   $h‍_imports(new Map([]), []);   const { default: $c‍_default } = { default: async function F(arg) {return arg;} };$h‍_once.default($c‍_default);
})
```

#### Case 13
```js
 export default async function(arg) { return arg; };

```

```js
 (({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,  }) => {   $h‍_imports(new Map([]), []);   const { default: $c‍_default } = { default: async function (arg) {return arg;} };$h‍_once.default($c‍_default);;
})
```

### test-import.js

#### Case 1

```js
 import * as ns from 'module';
```

```js
 (({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,  }) => {   let ns;$h‍_imports(new Map([["module", new Map([["*", [$h‍_a => (ns = $h‍_a)]]])]]), []);   
})
```

#### Case 2

```js
 import { foo, bar } from 'module';
```

```js
 (({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,  }) => {   let foo,bar;$h‍_imports(new Map([["module", new Map([["foo", [$h‍_a => (foo = $h‍_a)]],["bar", [$h‍_a => (bar = $h‍_a)]]])]]), []);   
})
```
#### Case 3

```js
 import myName from 'module';
```

```js
 (({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,  }) => {   let myName;$h‍_imports(new Map([["module", new Map([["default", [$h‍_a => (myName = $h‍_a)]]])]]), []);   
})
```

#### Case 4

```js
 import myName, { otherName as other } from 'module';

```

```js
 (({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,  }) => {   let myName,other;$h‍_imports(new Map([["module", new Map([["default", [$h‍_a => (myName = $h‍_a)]],["otherName", [$h‍_a => (other = $h‍_a)]]])]]), []);   
})
```

#### Case 5

```js
 import 'module';

```

```js
 (({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,  }) => {   $h‍_imports(new Map([["module", new Map([])]]), []);   
})
```
