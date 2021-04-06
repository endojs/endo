/* global process */
import fs from 'fs';
import { rollup as rollup0 } from 'rollup';
import path from 'path';
import resolve0 from '@rollup/plugin-node-resolve';
import commonjs0 from '@rollup/plugin-commonjs';
import * as babelParser from '@agoric/babel-parser';
import babelGenerate from '@babel/generator';
import babelTraverse from '@babel/traverse';
import { makeTransform } from '@agoric/transform-eventual-send';
import { makeArchive } from '@agoric/compartment-mapper';
import { encodeBase64 } from '@endo/base64';

import { SourceMapConsumer } from 'source-map';

import './types';

const DEFAULT_MODULE_FORMAT = 'nestedEvaluate';
const DEFAULT_FILE_PREFIX = '/bundled-source/...';
const SUPPORTED_FORMATS = ['getExport', 'nestedEvaluate', 'endoZipBase64'];

const IMPORT_RE = new RegExp('\\b(import)(\\s*(?:\\(|/[/*]))', 'sg');
const HTML_COMMENT_START_RE = new RegExp(`${'<'}!--`, 'g');
const HTML_COMMENT_END_RE = new RegExp(`--${'>'}`, 'g');

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const read = async location => fs.promises.readFile(new URL(location).pathname);

export function tildotPlugin() {
  const transformer = makeTransform(babelParser, babelGenerate);
  return {
    transform(code, _id) {
      return {
        code: transformer(code),
        map: null,
      };
    },
  };
}

function rewriteComment(node, unmapLoc) {
  node.type = 'CommentBlock';
  // Within comments...
  node.value = node.value
    // ...strip extraneous comment whitespace
    .replace(/^\s+/gm, ' ')
    // ...replace HTML comments with a defanged version to pass SES restrictions.
    .replace(HTML_COMMENT_START_RE, '<!X-')
    .replace(HTML_COMMENT_END_RE, '-X>')
    // ...replace import expressions with a defanged version to pass SES restrictions.
    .replace(IMPORT_RE, 'X$1$2')
    // ...replace end-of-comment markers
    .replace(/\*\//g, '*X/');
  if (unmapLoc) {
    unmapLoc(node.loc);
  }
  // console.log(JSON.stringify(node, undefined, 2));
}

async function makeLocationUnmapper({ sourceMap, ast }) {
  // We rearrange the rolled-up chunk according to its sourcemap to move
  // its source lines back to the right place.
  // eslint-disable-next-line no-await-in-loop
  const consumer = await new SourceMapConsumer(sourceMap);
  try {
    const unmapped = new WeakSet();
    let lastPos = { ...ast.loc.start };
    return loc => {
      if (!loc || unmapped.has(loc)) {
        return;
      }
      // Make sure things start at least at the right place.
      loc.end = { ...loc.start };
      for (const pos of ['start', 'end']) {
        if (loc[pos]) {
          const newPos = consumer.originalPositionFor(loc[pos]);
          if (newPos.source !== null) {
            lastPos = {
              line: newPos.line,
              column: newPos.column,
            };
          }
          loc[pos] = lastPos;
        }
      }
      unmapped.add(loc);
    };
  } finally {
    consumer.destroy();
  }
}

function transformAst(ast, unmapLoc) {
  babelTraverse(ast, {
    enter(p) {
      const {
        loc,
        comments,
        leadingComments,
        innerComments,
        trailingComments,
      } = p.node;
      (comments || []).forEach(node => rewriteComment(node, unmapLoc));
      // Rewrite all comments.
      (leadingComments || []).forEach(node => rewriteComment(node, unmapLoc));
      if (p.node.type.startsWith('Comment')) {
        rewriteComment(p.node, unmapLoc);
      }
      (innerComments || []).forEach(node => rewriteComment(node, unmapLoc));
      // If not a comment, and we are unmapping the source maps,
      // then do it for this location.
      if (unmapLoc) {
        unmapLoc(loc);
      }
      (trailingComments || []).forEach(node => rewriteComment(node, unmapLoc));
    },
  });
}

async function transformSource(
  code,
  { sourceMap, useLocationUnmap, sourceType } = {},
) {
  // Parse the rolled-up chunk with Babel.
  // We are prepared for different module systems.
  const ast = (babelParser.parse || babelParser)(code, {
    plugins: ['bigInt'],
    sourceType,
  });

  let unmapLoc;
  if (useLocationUnmap) {
    unmapLoc = await makeLocationUnmapper({
      sourceMap,
      ast,
    });
  }

  transformAst(ast, unmapLoc);

  // Now generate the sources with the new positions.
  return babelGenerate(ast, { retainLines: true });
}

/** @type {BundleSource} */
export default async function bundleSource(
  startFilename,
  moduleFormat = DEFAULT_MODULE_FORMAT,
  powers = undefined,
) {
  if (!SUPPORTED_FORMATS.includes(moduleFormat)) {
    throw Error(`moduleFormat ${moduleFormat} is not implemented`);
  }
  if (moduleFormat === 'endoZipBase64') {
    // TODO endoZipBase64 format does not yet support the tildot transform, as
    // Compartment Mapper does not yet reveal a pre-archive transform facility.
    // Such a facility might be better served by a transform specified in
    // individual package.jsons and driven by the compartment mapper.
    const base = new URL(`file://${process.cwd()}`).toString();
    const entry = new URL(startFilename, base).toString();
    const bytes = await makeArchive(read, entry, {
      moduleTransforms: {
        async mjs(sourceBytes) {
          const source = textDecoder.decode(sourceBytes);
          const { code: object } = await transformSource(source, {
            sourceType: 'module',
          });
          const objectBytes = textEncoder.encode(object);
          return { bytes: objectBytes, parser: 'mjs' };
        },
      },
    });
    const endoZipBase64 = encodeBase64(bytes);
    return { endoZipBase64, moduleFormat };
  }

  const {
    commonjsPlugin = commonjs0,
    rollup = rollup0,
    resolvePlugin = resolve0,
    pathResolve = path.resolve,
    externals = [],
  } = powers || {};
  const resolvedPath = pathResolve(startFilename);
  const bundle = await rollup({
    input: resolvedPath,
    treeshake: false,
    preserveModules: moduleFormat === 'nestedEvaluate',
    external: [...externals],
    plugins: [
      resolvePlugin({ preferBuiltins: true }),
      tildotPlugin(),
      commonjsPlugin(),
    ],
  });
  const { output } = await bundle.generate({
    exports: 'named',
    format: 'cjs',
    sourcemap: true,
  });
  // console.log(output);

  // Create a source bundle.
  const sourceBundle = {};
  let entrypoint;
  await Promise.all(
    output.map(async chunk => {
      if (chunk.isAsset) {
        throw Error(`unprepared for assets: ${chunk.fileName}`);
      }
      const { code, fileName, isEntry } = chunk;
      if (isEntry) {
        entrypoint = fileName;
      }

      const useLocationUnmap =
        moduleFormat === 'nestedEvaluate' && !fileName.startsWith('_virtual/');

      const { code: transformedCode } = await transformSource(code, {
        sourceMap: chunk.map,
        useLocationUnmap,
      });
      sourceBundle[fileName] = transformedCode;

      // console.log(`==== sourceBundle[${fileName}]\n${sourceBundle[fileName]}\n====`);
    }),
  );

  if (!entrypoint) {
    throw Error('No entrypoint found in output bundle');
  }

  // 'sourceBundle' is now an object that contains multiple programs, which references
  // require() and sets module.exports . This is close, but we need a single
  // stringifiable function, so we must wrap it in an outer function that
  // returns the entrypoint exports.
  //
  // build-kernel.js will prefix this with 'export default' so it becomes an
  // ES6 module. The Vat controller will wrap it with parenthesis so it can
  // be evaluated and invoked to get at the exports.

  // const sourceMap = `//# sourceMappingURL=${output[0].map.toUrl()}\n`;

  // console.log(sourceMap);
  let sourceMap;
  let source;
  if (moduleFormat === 'getExport') {
    sourceMap = `//# sourceURL=${resolvedPath}\n`;

    if (Object.keys(sourceBundle).length !== 1) {
      throw Error('unprepared for more than one chunk');
    }

    source = `\
function getExport() { 'use strict'; \
let exports = {}; \
const module = { exports }; \
\
${sourceBundle[entrypoint]}

return module.exports;
}
${sourceMap}`;
  } else if (moduleFormat === 'nestedEvaluate') {
    sourceMap = `//# sourceURL=${DEFAULT_FILE_PREFIX}-preamble.js\n`;

    // This function's source code is inlined in the output bundle.
    // It creates an evaluable string for a given module filename.
    const filePrefix = DEFAULT_FILE_PREFIX;
    function createEvalString(filename) {
      const code = sourceBundle[filename];
      if (!code) {
        return undefined;
      }
      return `\
(function getExport(require, exports) { \
  'use strict'; \
  const module = { exports }; \
  \
  ${code}
  return module.exports;
})
//# sourceURL=${filePrefix}/${filename}
`;
    }

    // This function's source code is inlined in the output bundle.
    // It figures out the exports from a given module filename.
    const nsBundle = {};
    const nestedEvaluate = _src => {
      throw Error('need to override nestedEvaluate');
    };
    function computeExports(filename, exportPowers, exports) {
      const { require: systemRequire, _log } = exportPowers;
      // This captures the endowed require.
      const match = filename.match(/^(.*)\/[^/]+$/);
      const thisdir = match ? match[1] : '.';
      const contextRequire = mod => {
        // Do path algebra to find the actual source.
        const els = mod.split('/');
        let prefix;
        if (els[0][0] === '@') {
          // Scoped name.
          prefix = els.splice(0, 2).join('/');
        } else if (els[0][0] === '.') {
          // Relative.
          els.unshift(...thisdir.split('/'));
        } else {
          // Bare or absolute.
          prefix = els.splice(0, 1);
        }

        const suffix = [];
        for (const el of els) {
          if (el === '.' || el === '') {
            // Do nothing.
          } else if (el === '..') {
            // Traverse upwards.
            suffix.pop();
          } else {
            suffix.push(el);
          }
        }

        // log(mod, prefix, suffix);
        if (prefix !== undefined) {
          suffix.unshift(prefix);
        }
        let modPath = suffix.join('/');
        if (modPath.startsWith('./')) {
          modPath = modPath.slice(2);
        }
        // log('requiring', modPath);
        if (!(modPath in nsBundle)) {
          // log('evaluating', modPath);
          // Break cycles, but be tolerant of modules
          // that completely override their exports object.
          nsBundle[modPath] = {};
          nsBundle[modPath] = computeExports(
            modPath,
            exportPowers,
            nsBundle[modPath],
          );
        }

        // log('returning', nsBundle[modPath]);
        return nsBundle[modPath];
      };

      const code = createEvalString(filename);
      if (!code) {
        // log('missing code for', filename, sourceBundle);
        if (systemRequire) {
          return systemRequire(filename);
        }
        throw Error(
          `require(${JSON.stringify(
            filename,
          )}) failed; no toplevel require endowment`,
        );
      }

      // log('evaluating', code);
      return nestedEvaluate(code)(contextRequire, exports);
    }

    source = `\
function getExportWithNestedEvaluate(filePrefix) {
  'use strict';
  // Serialised sources.
  if (filePrefix === undefined) {
    filePrefix = ${JSON.stringify(DEFAULT_FILE_PREFIX)};
  }
  const moduleFormat = ${JSON.stringify(moduleFormat)};
  const entrypoint = ${JSON.stringify(entrypoint)};
  const sourceBundle = ${JSON.stringify(sourceBundle, undefined, 2)};
  const nsBundle = {};

  ${createEvalString}

  ${computeExports}

  // Evaluate the entrypoint recursively, seeding the exports.
  const systemRequire = typeof require === 'undefined' ? undefined : require;
  return computeExports(entrypoint, { require: systemRequire }, {});
}
${sourceMap}`;
  }

  // console.log(sourceMap);
  return { source, sourceMap, moduleFormat };
}
