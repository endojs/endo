/**
 * Intentionally malformed ESM for testing {@link OnParseErrorFn}.
 *
 * Do not import this module directly.
 *
 * @module
 */

export default 1;

// A second `export default` in the same module is a recoverable parse error:
// Babel calls raiseRecoverable() for DuplicateDefaultExport, which means it
// adds the error to ast.errors without throwing, allowing the rest of the
// module to be parsed and the pipeline to continue.
export default 2;
