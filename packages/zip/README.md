# Endo ZIP

This is a lightweight JavaScript implementation of ZIP.
The implementation operates on whole ZIP archives in memory and operates
exclusively on `Uint8Array` file contents.

The library does not entrain a specific DEFLATE compressor or decompressor, but it
will use one if you provide it, and will otherwise just archive or extract
uncompressed files.

## Usage

### Writing ZIP archives

Create a ZIP archive by instantiating `ZipWriter`, adding files with `setNow()`,
and generating the final archive with `snapshot()`:

```javascript
import { ZipWriter } from '@endo/zip';

const textEncoder = new TextEncoder();
const writer = new ZipWriter();

// Add a file to the archive
writer.setNow('hello.txt', textEncoder.encode('Hello, World!\n'), {
  mode: 0o644,
  date: new Date(),
});

// Generate the ZIP archive as a Uint8Array
const zipBytes = writer.snapshot();
```

#### Options for `setNow()` and `set()`

- `mode` (number, default: `0o644`): Unix file permissions
- `date` (Date, optional): File modification date
- `comment` (string, default: `''`): File comment

#### Compression support

By default, files are stored uncompressed.
To enable DEFLATE compression, provide compression functions when creating the
writer.
ZIP comes with a `zip/deflate` utility that relies on web platform
`CompressionStream`.

```javascript
import ZipWriter from 'zip/writer';
import deflate from 'zip/deflate';

const writer = new ZipWriter({ deflate });
await writer.set('data.txt', textEncoder.encode('Large data...'), {
  date: new Date(),
});
```

For synchronous compression, if available:

```javascript
const writer = new ZipWriter({ deflateNow });
writer.setNow('data.txt', textEncoder.encode('Data...'));
```

### Reading ZIP archives

Read files from a ZIP archive using `ZipReader`:

```javascript
import { ZipReader } from '@endo/zip';

const textDecoder = new TextDecoder();

// Create a reader from ZIP bytes
const reader = new ZipReader(zipBytes);

// Read a file (synchronous for uncompressed files)
const fileBytes = reader.getNow('hello.txt');
const text = textDecoder.decode(fileBytes);

// Get file metadata
const stat = reader.stat('hello.txt');
console.log(stat.mode, stat.date, stat.comment);
```

#### Reading compressed archives

To read ZIP files with DEFLATE compression, provide an inflate function:

```javascript
// Using the Compression Streams API
const inflate = async (bytes) => {
  const blob = new Blob([bytes]);
  const stream = blob.stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const decompressed = await new Response(stream).arrayBuffer();
  return new Uint8Array(decompressed);
};

const reader = new ZipReader(zipBytes, { inflate });

// Decompress asynchronously
const fileBytes = await reader.get('compressed-file.txt');
```

For synchronous decompression:

```javascript
const reader = new ZipReader(zipBytes, { inflateNow: syncDecompressFunction });
const fileBytes = reader.getNow('compressed-file.txt');
```

### Helper functions

The package also exports constructor-free adapters.
These make the archive more like a file system by adding gratuitous
asynchrony.

```javascript
import { writeZip, readZip } from '@endo/zip';

// Writing
const { write, snapshot } = writeZip({ deflate });
await write('file.txt', textEncoder.encode('content'));
const zipBytes = await snapshot();

// Reading
const { read } = await readZip(zipBytes, 'archive.zip', { inflate });
const fileBytes = await read('file.txt');
```

## Implementation Notes

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

ZIP format allows for an arbitrary-length comment and an arbitrary number of
Zip64 headers in the "end of central directory block".
ZIP implementations must therefore scan backward from the end for the magic
numbers that introduce the "EOCDB".
However, a specially crafted ZIP file may contain those magic numbers
before the end.

So, for security, this specialized library does not support Zip64 nor
the variable width archive comment.
With some difficulty, Zip64 might be recovered by scanning backward from the
end of the file until we find a coherent EOCDB with no trailing bytes.
Even careful support for the variable width comment at the end of the archive
would always allow for the possibility of a comment that is itself a valid ZIP
file with a long prefix, since ZIP files allow an arbitrary length prefix.

DEFLATE compression support requires providing your own compression/decompression
functions. Modern environments can use the [Compression Streams API][] with
`'deflate-raw'` format. The dependency would need to be converted to ECMAScript
modules, which is not much effort.

JSZip supports an asynchronous mode, that despite the name, is not concurrent.
The mode is intended to keep the main thread lively while emitting progress
reports.  For expedience, this mode is omitted, but could be restored using the
same underlying utilities, and I expect async/await and async iterators would
make the feature easier to maintain.

Provided an async seekable reader, a lazy ZIP reader could be built on the same
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
 [Compression Streams API]: https://developer.mozilla.org/en-US/docs/Web/API/Compression_Streams_API
