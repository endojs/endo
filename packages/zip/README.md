# Endo Zip

This is a modernization and specialization of [JSZip][] (MIT License) that has
no dependencies on any built-in modules and is entirely implemented with
ECMAScript modules.  This makes the library suitable for embedding in an XS
binary, bundling for any platform with Rollup, and usable with `node -r esm`.

Modernization afforded the opportunity to focus on use of TypedArrays and UTF-8
without reservation, and to use TypeScript JSDoc comments to verify the flow of
information.  It also afforded an opportunity to make some security-conscious
decisions, like treating file name spoofing as an integrity error and
requiring a date to be expressly provided instead of reaching for the ambient
original Date constructor, which will pointedly be absent in constructed
compartments in locked-down environments.

Zip format allows for an arbitrary-length comment and an arbitrary number of
Zip64 headers in the "end of central directory block".
Zip implementations must therefore scan backward from the end for the magic
numbers that introduce the "EOCDB".
However, a specially crafted Zip file may contain those magic numbers
before the end.

So, for security, this specialized library does not support Zip64 nor
the variable width archive comment.
With some difficulty, Zip64 might be recovered by scanning backward from the
end of the file until we find a coherent EOCDB with no trailing bytes.
Even careful support for the variable width comment at the end of the archive
would always allow for the possibility of a comment that is itself a valid Zip
file with a long prefix, since Zip files allow an arbitrary length prefix.

For expedience, the specialization dropped support for INFLATE compression.
The dependency would need to be converted to ECMAScript modules, which is not
much effort. Pursuing that intent, one should factor out the shared CRC32
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

For expedience, there is no API for enumerating the contents of the archive.
This would be straightforward to implement.

 [JSZip]: https://github.com/Stuk/jszip
