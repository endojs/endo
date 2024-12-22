# Smallcaps Cheatsheet

An example-based summary of the Smallcaps encoding on the OCapN [Abstract Syntax](https://github.com/ocapn/ocapn/blob/28af626441da888c4a520309222e18266dd2f1f2/draft-specifications/Model.md) (as of https://github.com/ocapn/ocapn/pull/125). (TODO revise link once that PR is merged.)

| pass-style name  | OCapn name    | JS example            | JSON encoding        |
| -----------------|---------------|-----------------------|----------------------|
| undefined        | Undefined     | `undefined`           | `"#undefined"`       |
| null             | Null          | `null`                | `null`               |
| boolean          | Boolean       | `true`<br>`false`     | `true`<br>`false`    |
| bigint           | Integer       | `7n`<br>`-7n`         | `"+7"`<br>`"-7"`     |
| number           | Float64       | `Infinity`<br>`-Infinity`<br>`NaN`<br>`-0`<br>`7.1` | `"#Infinity"`<br>`"#-Infinity"`<br>`"#NaN"`<br>`"#-0"` // unimplemented<br>`7.1` |
| string           | String        | `'#foo'`<br>`'foo'`   | `"!#foo"` // special strings<br>`"foo"` // other strings |
| byteArray        | ByteArray     | `buf.toImmutable()`   | // undecided & unimplemented |
| selector         | Selector      | `makeSelector('foo')` | `"%foo"` // converting from symbol |
| copyArray        | List          | `[a,b]`               | `[<a>,<b>]`          |
| copyRecord       | Struct        | `{x:a,y:b}`           | `{<x>:<a>,<y>:<b>}`  |
| tagged           | Tagged        | `makeTagged(t,p)`     | `{"#tag":<t>,"payload":<p>}` |
| remotable        | Target        | `Far('foo', {})`      | `"$0.foo"`           |
| promise          | Promise       | `Promise.resolve()`   | `"&1"`               |
| error            | Error         | `TypeError(msg)`      | `{"#error":<msg>,"name":"TypeError"}` |

* The `-0` encoding is defined as above, but not yet implemented in JS.
* In JS, selectors in transition from symbols to their own representation
* The number after `"$"` or `"&"` is an index into a separate slots array.
* Special strings begin with any of the `!"#$%&'()*+,-` characters.
* `<expr>` is nested encoding of `expr`.
* To be passable, arrays, records, and errors must also be hardened.
* Structs [can only have string-named properties](https://github.com/endojs/endo/blob/master/packages/pass-style/doc/copyRecord-guarantees.md).
* Errors can also carry an optional `errorId` string property.
* We expect to expand the optional error properties over time.
* The ByteArray encoding is not yet designed or implemented.

Every JSON encoding with no special strings anywhere decodes to itself.
