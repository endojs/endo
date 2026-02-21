/**
 * Decompresses bytes with any algorithm supported on the web, tentatively just
 * DEFLATE-RAW.
 * @param {Uint8Array} compressedBytes
 * @param {'deflate-raw'} compressionMethodName
 */
const decompress = async (compressedBytes, compressionMethodName) => {
  const compressedBlob = new Blob([compressedBytes], {
    type: 'application/octet-stream',
  });
  const decompressionStream = new DecompressionStream(compressionMethodName);
  const decompressedStream = compressedBlob
    .stream()
    .pipeThrough(decompressionStream);
  const decompressedResponse = new Response(decompressedStream);
  const decompressedBlob = await decompressedResponse.blob();
  const decompressedArrayBuffer = await decompressedBlob.arrayBuffer();
  const bytes = new Uint8Array(decompressedArrayBuffer);
  return bytes;
};

/**
 * @param {Uint8Array} compressedBytes
 */
const inflate = compressedBytes => decompress(compressedBytes, 'deflate-raw');

export default inflate;
