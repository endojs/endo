
# How do I enumerate JavaScript object properties? Let me count the ways.

JavaScript has a tremendous number of different constructs for enumerating the
properties of an object, with different semantics of what subset they choose to
enumerate:

| Operation                          | P | NE | STR | SYM | output    |
| ---------------------------------- | - | -- | --- | --- | --------- |
| `for (... in ...)`                 | P |    | STR |     | k*        |
| `Object.keys`                      |   |    | STR |     | [k*]      |
| `Object.values`                    |   |    | STR |     | [v*]      |
| `Object.entries`                   |   |    | STR |     | [[k,v]*]  |
| `{...obj}`                         |   |    | STR | SYM | {k:v*}    |
| `Object.assign`                    |   |    | STR | SYM | {k:v*}    |
| `Reflect.ownKeys`                  |   | NE | STR | SYM | [k*]      |
| `Object.getOwnPropertyNames`       |   | NE | STR |     | [k*]      |
| `Object.getOwnPropertySymbols`     |   | NE |     | SYM | [k*]      |
| `Object.getOwnPropertyDescriptors` |   | NE | STR | SYM | {k:d*}    |

Legend:

* **P**: Includes properties inherited from up the prototype chain. For
  example, `{__proto__: {a: 10}, b: 20}` has properties `"a"` and `"b"`.
* **NE**: Includes properties that are non-enumerable, like the length of an
  array or methods on classes.
* **STR**: Includes properties named by a string.
* **SYM**: Includes properties named by a symbol. For example,
  `{[Symbol.toStringTag]: 'inline'}` has a symbol property.
* **`k*`** indicates keys.
* **`[k*]`** indicates an array of keys.
* **`[v*]`** indicates an array of values.
* **`{k:v*}`** indicates an object mapping keys to values.
* **`{k:d*}`** indicates an object mapping keys to property descriptors.

For objects with accessor properties (getters), JavaScript has two modes of
copying, copy-by-value and copy-by-descriptor.

* Output that contains a `v` indicates that the operation copied the value.
  The operation will synchronously capture a snapshot of the current
  value by calling the getter.
  `Object.values`, `Object.entries`, `{...object}`, and `Objeect.assign`
  call getter functions and copy-by-value.
* When the output contains a `d`, the getter and setter are in the descriptor,
  as in `Object.getOwnPropertyDescriptors`.
  The operation does not call the getter and merely copies the descriptor.
