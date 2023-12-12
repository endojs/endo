/** @type {typeof jsDecodeBase64} */
export const decodeBase64: typeof jsDecodeBase64;
/**
 * Decodes a Base64 string into bytes, as specified in
 * https://tools.ietf.org/html/rfc4648#section-4
 *
 * XSnap is a JavaScript engine based on Moddable/XS.
 * The algorithm below is orders of magnitude too slow on this VM, but it
 * arranges a native binding on the global object.
 * We use that if it is available instead.
 *
 * @param {string} string Base64-encoded string
 * @param {string} [name] The name of the string as it will appear in error
 * messages.
 * @returns {Uint8Array} decoded bytes
 */
declare function jsDecodeBase64(string: string, name?: string | undefined): Uint8Array;
export {};
//# sourceMappingURL=decode.d.ts.map