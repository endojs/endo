/**
 * Entry point for this package.  Provides public API and types.
 *
 * @module
 */

/**
 * @import {TransformedResult, TransformedResultWithSourceMap} from './generate.js'
 * @import {SourceMapOption} from './generate.js'
 */

import { transformAst } from './transform-ast.js';
import { parseAst } from './parse-ast.js';
import { generate } from './generate.js';
import { evadeRegexp } from './transform-comment.js';

/**
 * Efficiently classify source text as might-need-transformation versus
 * definitely-does-not, avoiding Babel work whenever no transformable comment
 * substring is present.
 *
 * @param {string} source
 * @param {boolean} elideComments
 * @returns {boolean}
 */
const shouldRunTransform = (source, elideComments) => {
  if (elideComments) {
    return true;
  }
  return source.search(evadeRegexp) !== -1;
};

/**
 * Create a lightweight identity source map when we skip parsing.
 *
 * @param {string} source
 * @param {string|undefined} sourceUrl
 * @param {string|object|undefined} sourceMap
 */
const makeFastPathMap = (source, sourceUrl, sourceMap) => {
  if (sourceMap && typeof sourceMap === 'object') {
    return sourceMap;
  }
  if (typeof sourceMap === 'string') {
    try {
      return JSON.parse(sourceMap);
    } catch {
      // Fall through to an identity map if provided source map is malformed.
    }
  }
  if (!sourceUrl) {
    return undefined;
  }
  return {
    version: 3,
    names: [],
    sources: [sourceUrl],
    sourcesContent: [source],
    mappings: '',
  };
};

/**
 * Options for {@link evadeCensorSync}
 *
 * @typedef EvadeCensorOptions
 * @property {SourceMapOption | undefined} [sourceMap] - Original source map in JSON string or object form
 * @property {string | undefined} [sourceUrl] - URL or filepath of the original source in `code`
 * @property {boolean | undefined} [elideComments] - Empties the comments but preserves interior newlines.
 * @property {import('./parse-ast.js').SourceType | undefined} [sourceType] - Module source type
 * @property {boolean | undefined} [onlyComments] - if true, will limit transformation to
comment contents, preserving code positions within each line
 * @property {(path: import('@babel/traverse').NodePath) => void} [customVisitor] - A visitor function to be called on each node, in addition to the standard transforms. Receives the same path argument as a normal Babel visitor.
 * @property {boolean | undefined} [useLocationUnmap] - deprecated, vestigial
 * @property {(name: string, args?: Record<string, unknown>) => (args?: Record<string, unknown>) => void} [profileStartSpan] - Optional profiling span hook
 * @public
 */

/**
 * Apply SES censorship evasion transforms on the given code `source`
 *
 * If the `sourceUrl` option is provided, the `map` property of the fulfillment
 * value will be a source map object; otherwise it will be `undefined`.
 *
 * @overload
 * @param {string} source - Source code to transform
 * @param {EvadeCensorOptions & {sourceUrl: string}} options - Options for the transform
 * @returns {TransformedResultWithSourceMap} Object containing new code and optionally source map object (ready for stringification)
 * @public
 */

/**
 * Apply SES censorship evasion transforms on the given code `source`
 *
 * If the `sourceUrl` option is provided, the `map` property of the fulfillment
 * value will be a source map object; otherwise it will be `undefined`.
 *
 * @overload
 * @param {string} source - Source code to transform
 * @param {EvadeCensorOptions} [options] - Options for the transform
 * @returns {TransformedResult} Object containing new code and optionally source map object (ready for stringification)
 * @public
 */
/**
 * Apply SES censorship evasion transforms on the given code `source`
 *
 * If the `sourceUrl` option is provided, the `map` property of the fulfillment
 * value will be a source map object; otherwise it will be `undefined`.
 *
 * @param {string} source - Source code to transform
 * @param {EvadeCensorOptions} [options] - Options for the transform
 * @public
 */
export function evadeCensorSync(source, options) {
  const {
    sourceMap,
    sourceUrl,
    sourceType,
    elideComments = false,
    onlyComments = false,
    customVisitor,
    profileStartSpan,
  } = options || {};

  const endFastPathScan = profileStartSpan?.('evasiveTransform.fastPath.scan', {
    sourceType,
    inputChars: source.length,
    elideComments,
  });
  const fastPathHit = !shouldRunTransform(source, elideComments);
  endFastPathScan?.({ fastPathHit });
  if (fastPathHit) {
    const endFastPathHit = profileStartSpan?.('evasiveTransform.fastPath.hit');
    const map = makeFastPathMap(source, sourceUrl, sourceMap);
    endFastPathHit?.({ hasMap: map !== undefined });
    return {
      code: source,
      map,
    };
  }
  const endFastPathMiss = profileStartSpan?.('evasiveTransform.fastPath.miss');
  endFastPathMiss?.();

  // Parse the rolled-up chunk with Babel.
  // We are prepared for different module systems.
  const endParse = profileStartSpan?.('evasiveTransform.babel.parse', {
    sourceType,
  });
  const ast = parseAst(source, {
    sourceType,
  });
  endParse?.();

  const endTraverse = profileStartSpan?.('evasiveTransform.babel.traverse', {
    elideComments,
  });
  transformAst(ast, { elideComments, onlyComments, customVisitor });
  endTraverse?.();

  const endGenerate = profileStartSpan?.('evasiveTransform.babel.generate');
  if (sourceUrl) {
    const generated = generate(ast, {
      source,
      sourceUrl,
      ...(sourceMap !== undefined && { sourceMap }),
    });
    endGenerate?.();
    return generated;
  }
  const generated = generate(ast, { source });
  endGenerate?.();
  return generated;
}

/**
 * Apply SES censorship evasion transforms on the given code `source`
 *
 * If the `sourceUrl` option is provided, the `map` property of the fulfillment
 * value will be a source map object; otherwise it will be `undefined`.
 *
 * @overload
 * @param {string} source - Source code to transform
 * @param {EvadeCensorOptions & {sourceUrl: string}} options - Options for the transform
 * @returns {Promise<TransformedResultWithSourceMap>} Object containing new code and source map object (ready for stringification)
 * @public
 */

/**
 * Apply SES censorship evasion transforms on the given code `source`
 *
 * If the `sourceUrl` option is provided, the `map` property of the fulfillment
 * value will be a source map object; otherwise it will be `undefined`.
 *
 * @overload
 * @param {string} source - Source code to transform
 * @param {EvadeCensorOptions} [options] - Options for the transform
 * @returns {Promise<TransformedResult>} Object containing new code
 * @public
 */

/**
 * Apply SES censorship evasion transforms on the given code `source`
 *
 * If the `sourceUrl` option is provided, the `map` property of the fulfillment
 * value will be a source map object; otherwise it will be `undefined`.
 *
 * @param {string} source - Source code to transform
 * @param {EvadeCensorOptions} [options] - Options for the transform
 * @public
 */
export async function evadeCensor(source, options) {
  return evadeCensorSync(source, options);
}
