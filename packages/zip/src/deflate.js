/**
 * Compresses bytes with algorithms supported on the web,
 * tentatively just DEFLATE-RAW.
 * @param {Uint8Array} uncompressedBytes
 * @param {'deflate-raw'} compressionMethodName
 */
const compress = async (uncompressedBytes, compressionMethodName) => {
  const uncompressedBlob = new Blob([uncompressedBytes], {
    type: 'application/octet-stream',
  });
  const compressionStream = new CompressionStream(compressionMethodName);
  const compressedStream = uncompressedBlob
    .stream()
    .pipeThrough(compressionStream);
  const compressedResponse = new Response(compressedStream);
  const compressedBlob = await compressedResponse.blob();
  const compressedArrayBuffer = await compressedBlob.arrayBuffer();
  const bytes = new Uint8Array(compressedArrayBuffer);
  return bytes;
};

/**
 * Compresses bytes with the DEFLATE-RAW algorithm.
 * @param {Uint8Array} uncompressedBytes
 */
const deflate = uncompressedBytes => compress(uncompressedBytes, 'deflate-raw');

export default deflate;
