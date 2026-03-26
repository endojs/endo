# Exo types

Exos have runtime guards and also static type annotations. Both are optional, leading to this matrix of behaviors:

| Impl   | Unguarded | Guarded |
| -- | -- | -- |
| **plain** | inferred from JS | guard wins |
| **typed** | impl wins | compatibility check[^1][^2] |

[^1]: We pick the impl type because it has the param names and the guard doesn't.
[^2]: Use `GuardedMethods<typeof exo>` to opt into the guard's type contract (e.g. `.optional()` params). Parameter names are not preserved (TS limitation).

