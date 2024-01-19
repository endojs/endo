# Smallcaps Cheatsheet

An example-based summary of the Smallcaps encoding

| Passable value  | OCapn name    | JS example          | JSON encoding        |
| ----------------|---------------|---------------------|----------------------|
| bigint          | Integer       | `7n`<br>`-7n`       | `"+7"`<br>`"-7"`     |
| manifest constant | Undefined<br><br>Float64<br><br><br> | `undefined`<br>`Infinity`<br>`-Infinity`<br>`NaN`<br>`-0` | `"#undefined"`<br>`"#Infinity"`<br>`"#-Infinity"`<br>`"#NaN"`<br>`"#-0"` // unimplemented |
| passable symbol | Symbol        | `Symbol.for('foo')`<br>`Symbol.asyncIterator` | `"%foo"`<br>`"%@@asyncIterator"` |
| remotable       | Remotable     | `Far('foo', {})`    | `"$0.foo"`           |
| promise         | Promise       | `Promise.resolve()` | `"&1"`               |
| special string  | String        | `'#foo'`            | `"!#foo"`            |
| other string    | String        | `'foo'`             | `"foo"`              |
| other JSON scalar | Null<br>Boolean<br><br>Float64 | `null`<br>`true`<br>`false`<br>`7.1` | `null`<br>`true`<br>`false`<br>`7.1` |
| copyArray       | List          | `[a,b]`             | `[<a>,<b>]`          |
| copyRecord      | Struct        | `{x:a,y:b}`         | `{<x>:<a>,<y>:<b>}`  |
| error           | Error         | `TypeError(msg)`    | `{"#error":<msg>,"name":"TypeError"}` |
| tagged          | Tagged        | `makeTagged(t,p)`   | `{"#tag":<t>,"payload":<p>}` |
| ?               | ByteArray     | ?                   | ? |

* The `-0` encoding is defined as above, but not yet implemented in JS.
* In JS, only registered and well-known symbols are passable.
* The number after `"$"` or `"&"` is an index into a separate slots array.
* Special strings begin with any of the `!"#$%&'()*+,-` characters.
* `<expr>` is nested encoding of `expr`.
* To be passable, arrays, records, and errors must also be hardened.
* Structs [can only have string-named properties](https://github.com/endojs/endo/blob/master/packages/pass-style/doc/copyRecord-guarantees.md).
* Errors can also carry an optional `errorId` string property.
* We expect to expand the optional error properties over time.
* The ByteString encoding is not yet designed or implemented.

Every JSON encoding with no special strings anywhere decodes to itself.
