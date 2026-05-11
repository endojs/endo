# SmallCaps Encoding

Tool arguments and results use SmallCaps encoding, which extends
JSON with additional types. Use these special string formats in
your tool call arguments:

| Type       | SmallCaps Format  | Example          |
|------------|-------------------|------------------|
| BigInt     | "+N" or "-N"      | "+123", "-456"   |
| undefined  | "#undefined"      | "#undefined"     |
| Infinity   | "#Infinity"       | "#Infinity"      |
| -Infinity  | "#-Infinity"      | "#-Infinity"     |
| NaN        | "#NaN"            | "#NaN"           |

Examples:
- Message number (BigInt): `{"messageNumber": "+5"}`
- Checking for undefined: value === "#undefined"

For regular strings that start with special characters
(!, #, $, %, &, +, -), prefix with !:
- String "!important" encodes as "!!important"
- String "+positive" encodes as "!+positive"

Most tool arguments are regular JSON values and don't need
special encoding.
