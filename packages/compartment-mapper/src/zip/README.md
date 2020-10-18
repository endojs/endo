This is a modernization and specialization of [JSZip][] (MIT License) that has
no dependencies on any built-in modules and is entirely implemented with
ECMAScript modules.  This makes the library suitable for embedding in an XS
binary, bundling for any platform with Rollup, and usable with `node -r esm`.

Modernization afforded the opportunity to focus on use of TypedArrays and UTF-8
without reservation, and to use TypeScript JSDoc comments to verify the flow of
information.  It also afforded an opportunity to make some security-conscious
decisions, like treating file name spoofing as an integrity error and
requiring a date to be expressly provided instead of reaching for the ambient
Date constructor, which will pointedly be absent in locked-down environments.

For expedience, the specialization dropped support for Zip64 and compression.

For expedience, the specialization dropped support for INFLATE compression.
The dependency would need to be converted to ECMAScript modules, which is not
much effort. Pursing that intent, one should factor out the shared CRC32
module.

JSZip supports an asynchronous mode, that despite the name, is not concurrent.
The mode is intended to keep the main thread lively while emitting progress
reports.  For expedience, this mode is omitted, but could be restored using the
same underlying utilities, and I expect async/await and async iterators would
make the feature easier to maintain.

Provided an async seekable reader, a lazy Zip reader could be built on the same
foundations, deferring decompression and validation until the file is opened.

For expedience, support for streaming compression and the necessary data
descriptors have been dropped.  They are not necessary for synchronous writing.
The data descriptors are also redundant with the central directory for reading,
so they've been omitted, though recovering them for additional integrity
checks would be useful.

For expedience, explicit directory records are ignored on read and omitted on
write.  These would also be straightforward to recover.

 [JSZip]: https://github.com/Stuk/jszip
