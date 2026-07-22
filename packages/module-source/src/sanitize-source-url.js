/**
 * Sanitizes a caller-supplied `sourceUrl` before it is interpolated into a
 * `//# sourceURL=` comment appended to functor source.
 *
 * A `//# sourceURL=` comment runs to the end of its line, so the only way for
 * a hostile `sourceUrl` to escape it and turn the remainder of the string back
 * into executable code is to embed one of JavaScript's four line terminators
 * (`\n`, `\r`, U+2028, U+2029).
 *
 * The compartment-mapper pipeline never lets a caller control `sourceUrl`
 * directly — it is derived from a module's location — but `ModuleSource` and
 * `CjsModuleSource` may be constructed directly, so we cannot rely on the
 * caller to have sanitized it.
 *
 * Rather than enumerate the dangerous characters ourselves, we round-trip the
 * value through {@link URL} and return its serialized `href`. The WHATWG URL
 * serializer strips or percent-encodes every line terminator, so the result is
 * guaranteed to be a single-line, comment-safe string. Invalid input (e.g. a
 * bare relative path) throws during parsing and yields `undefined`, in which
 * case no comment is emitted.
 *
 * @module
 */

const { URL } = globalThis;

/**
 * Normalizes `sourceUrl` into a comment-safe string.
 *
 * @param {string} [sourceUrl] The caller-supplied source URL.
 * @returns {string | undefined} The serialized `href` of `sourceUrl` when it
 *   is a well-formed URL; otherwise `undefined`.
 */
export const sanitizeSourceUrl = sourceUrl => {
  if (typeof sourceUrl !== 'string' || typeof URL !== 'function') {
    return undefined;
  }
  try {
    return new URL(sourceUrl).href;
  } catch {
    return undefined;
  }
};
