import * as babelParser from '@babel/parser';

// @babel/parser import shape differs across ESM/CJS interop paths. We resolve
// parse defensively because CI (Node 20 on macOS) has surfaced a runtime where
// `default` exists but `default.parse` is not the callable parser.
export const babelParse =
  (typeof babelParser.parse === 'function' && babelParser.parse) ||
  (babelParser.default &&
    ((typeof babelParser.default.parse === 'function' &&
      babelParser.default.parse) ||
      (typeof babelParser.default === 'function' && babelParser.default))) ||
  (typeof babelParser === 'function' ? babelParser : undefined);

if (typeof babelParse !== 'function') {
  throw Error('Unable to resolve @babel/parser parse function');
}
