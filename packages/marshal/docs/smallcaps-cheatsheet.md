# Smallcaps Cheatsheet

An example-based summary of the Smallcaps encoding of the OCapN [Abstract Syntax](https://github.com/ocapn/ocapn/blob/main/draft-specifications/Model.md).

| pass-style name  | OCapn name    | JS example            | JSON encoding        |
| -----------------|---------------|-----------------------|----------------------|
| undefined        | Undefined     | `undefined`           | `"#undefined"`       |
| null             | Null          | `null`                | `null`               |
| boolean          | Boolean       | `true`<br>`false`     | `true`<br>`false`    |
| bigint           | Integer       | `7n`<br>`-7n`         | `"+7"`<br>`"-7"`     |
| number           | Float64       | `Infinity`<br>`-Infinity`<br>`NaN`<br>`-0`<br>`7.1` | `"#Infinity"`<br>`"#-Infinity"`<br>`"#NaN"`<br>`"#-0"` // unimplemented<br>`7.1` |
| string           | String        | `'#foo'`<br>`'foo'`   | `"!#foo"` // special strings<br>`"foo"` // other strings |
| byteArray        | ByteArray     | `buf.toImmutable()`   | // undecided & unimplemented |
| passable symbols | Symbol        | `passableSymbolForName('foo')` | `"%foo"` // in transition |
| copyArray        | List          | `[a,b]`               | `[<a>,<b>]`          |
| copyRecord       | Struct        | `{foo:a,'#foo':b}`    | `{"!#foo":<b>,"foo":<a>}` // keys sorted  |
| tagged           | Tagged        | `makeTagged(t,p)`     | `{"#tag":<t>,"payload":<p>}` |
| remotable        | Target        | `Far('foo', {})`      | `"$0.foo"`           |
| promise          | Promise       | `Promise.resolve()`   | `"&1"`               |
| error            | Error         | `TypeError(msg)`      | `{"#error":<msg>,"name":"TypeError"}` |

* The `-0` encoding is defined as above, but not yet implemented in JS.
* In JS, passable symbols are in transition from JavaScript symbols to their own representation
* The number after `"$"` or `"&"` (for remotable/Target or promise/Promise) is an index into a separate slots array.
* ***Special strings*** begin with any of the `!"#$%&'()*+,-` characters.
* `<expr>` is nested encoding of `expr`.
* To be passable, arrays, records, and errors must also be hardened.
* Structs [can only have string-named properties](https://github.com/endojs/endo/blob/master/packages/pass-style/doc/copyRecord-guarantees.md).
* Errors can also carry an optional `errorId` string property.
* We expect to expand the optional error properties over time.
* The ByteArray encoding is not yet designed or implemented.

## Readability Invariants

For every JSON encoding with no special strings, the JSON and smallcaps decodings are the same.

For every value with no special strings that round trips through JSON, the JSON and smallcaps encodings are the same.

In other words, for these simple values, ***you can ignore the differences between smallcaps and JSON***.
