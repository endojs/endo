# netstring

This is an implementation of asynchronous streams framed as [Netstrings][].
A netstring is a binary protocol for length-prefixed frames,
using decimal strings as variable width integers.
For example, the frame `5:hello,` corresponds to the message `hello`,
where `5` is the length of `hello` in bytes.

This implementation relies particularly on the pure JavaScript notion of a
stream, using async iterators of Uint8Arrays.
By convention, these may be ranges of a ring buffer, so a stream owns a byte
range it receives from `next` until the next time it calls `next`.


[Netstrings][] <br>
D. J. Bernstein, <djb@pobox.com> <br>
1997-02-01

[Netstrings]: https://cr.yp.to/proto/netstrings.txt
