# Invariants Among Orders


|              | `kindOf(p)`  | `compareRank(p,p)` | `compareKeys(k,k)` |
|--------------|--------------|--------------------|--------------------|
| Atoms        |              |                    |                    |
|              | `null`       | js                 | js                 |
|              | `undefined`  | js                 | js                 |
|              | `boolean`    | js                 | js                 |
|              | `number`     | num rank< `NaN`    | num incomp `NaN`   |
|              | `bigint`     | js                 | js                 |
|              | `symbol`     | by name            | by name            |
|              | `string`     | lex (CESU-8?)      | lex (CESU-8?)      |
|              | `byteString` | lex                | lex                |
| Collections   |              |                    |                    |
|              | `copyArray`  | lex                | lex                |
|              | `copyRecord` | lex keys, value    | Pareto             |
|              | `copySet`    | lex Tagged         | subset             |
|              | `copyBag`    | lex Tagged         | subbag             |
|              | `copyMap`    | lex Tagged         | Pareto             |
| Matchers     | `match:*`    | lex Tagged         | N/A                |
| Guards (TBD) | `guard:*`    | lex Tagged         | N/A                |
| Just Tagged  | undefined    | lex Tagged         | N/A                |
| Capability   |              |                    |                    |
|              | `remotable`  | same rank          | same or incomp     |
|              | `promise`    | same rank          | N/A                |
| Other        |              |                    |                    |
|              | `error`      | same rank          | N/A                |




Invariant                          | notes
-----------------------------------|------
keyLT -> rankLT                    | optimize key pattern into rankCover
rankLT -> fullLT, fullEQ -> rankEQ | fullOrder more precise than rankOrder
(fullEQ && isKey) <-> keyEQ        | fullOrder is full wrt keyEQ, merge-ops


RankOrder | FullOrder | KeyOrder     | examples
----------|-----------|--------------|---------
`rankLT`  | `fullLT`  | `keyLT`      | `2` vs `3`, `set{2}` vs `set{2,3}`
`rankLT`  | `fullLT`  | incomparable | `2` vs `NaN`, `set{2}` vs `set{3}`
`rankEQ`  | `fullLT`  | incomparable | `far1` vs `far2`, `[far1]` vs `[far2]`
`rankEQ`  | `fullEQ`  | `keyEQ`      | `2` vs `2`, `NaN` vs `NaN`, `-0` vs `0`
