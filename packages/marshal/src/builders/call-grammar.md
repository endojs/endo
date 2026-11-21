Based on "Grammar of Valid Sequences of Data-E Building Calls" at
http://www.erights.org/data/serial/jhu-paper/data-e-manual.html

```
start ::= buildRoot(() => expr)

expr ::= atom | container | reference | error

atom ::=
    buildUndefined()
  | buildNull()
  | buildBoolean(boolean)
  | buildInteger(bigint)
  | buildFloat64(number)
  | buildString(string)
  | buildByteArray(ByteArray)
  | buildSymbol(Symbol)

container ::=
    buildStruct(string[], ()* => expr)
  | buildList(number, ()* => expr)
  | buildTagged(string, () => expr)

reference ::=
    buildTarget(Remotable)
  | buildPromise(Promise)

error ::=
    buildError(Error)
```
