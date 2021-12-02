# Agoric Far Object helpers

The `@agoric/far` package provides a convenient way to use the Agoric
[distributed objects system](https://agoric.com/documentation/js-programming/far.html) without  relying on the underlying messaging
implementation.

It exists to reduce the boilerplate in Hardened JavaScript vats that are running
in Agoric's SwingSet kernel,
[`@agoric/swingset-vat`](https://github.com/Agoric/agoric-sdk/tree/master/packages/SwingSet),
or arbitrary JS programs using Hardened JavaScript and communicating via
[`@agoric/captp`](https://github.com/Agoric/agoric-sdk/tree/master/packages/captp).

You can import any of the following from `@agoric/far`:

```js
import { E, Far, getInterfaceOf, passStyleOf } from '@agoric/far';
```
