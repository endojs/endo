# SmallCaps Encoding (background)

There is exactly one place SmallCaps surfaces in your tool calls:
**message numbers**, which are BigInts and so cannot be expressed in
plain JSON.
Use the `"+N"` form for these (the leading `+` is the SmallCaps marker
that the harness reads as "BigInt"):

```
dismiss("+5")
reply("+3", ["text"], [], [])
```

The individual tool summaries call this out for every argument that
expects a message number.
No other argument is decoded as SmallCaps; every other field passes
through bytes-for-bytes to the tool, so a string the model writes
(including one whose first character happens to be `!`, `#`, `$`, `%`,
`&`, `+`, or `-`) reaches the tool as the exact bytes the model wrote.

For curiosity, the full SmallCaps grammar (BigInt `"+N"`/`"-N"`,
`"#undefined"`, `"#Infinity"`, `"#-Infinity"`, `"#NaN"`, and the `!`
escape for strings that would otherwise collide with those forms) is
documented in `@endo/marshal`.
The harness does not apply that grammar to your tool arguments; only
the `messageNumber` fields documented in each tool summary go through
BigInt coercion.
