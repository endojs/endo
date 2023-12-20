/** @type {typeof jsEncodeBase64} */
export const encodeBase64: typeof jsEncodeBase64;
/**
 * Encodes bytes into a Base64 string, as specified in
 * https://tools.ietf.org/html/rfc4648#section-4
 *
 * XSnap is a JavaScript engine based on Moddable/XS.
 * The algorithm below is orders of magnitude too slow on this VM, but it
 * arranges a native binding on the global object.
 * We use that if it is available instead.
 *
 * @param {Uint8Array} data
 * @returns {string} base64 encoding
 */
declare function jsEncodeBase64(data: Uint8Array): string;
export {};
//# sourceMappingURL=encode.d.ts.map