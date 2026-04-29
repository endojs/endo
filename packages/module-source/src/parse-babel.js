import * as babelParser from '@babel/parser';

// @babel/parser import shape differs across ESM/CJS interop paths. We resolve
// parse defensively because CI (Node 20 on macOS) has surfaced a runtime where
// `default` exists but `default.parse` is not the callable parser.
const resolveBabelParse = () => {
  if (typeof babelParser.parse === 'function') {
    return babelParser.parse;
  }
  if (babelParser.default) {
    if (typeof babelParser.default.parse === 'function') {
      return babelParser.default.parse;
    }
    if (typeof babelParser.default === 'function') {
      return babelParser.default;
    }
  }
  if (typeof babelParser === 'function') {
    return babelParser;
  }
  return undefined;
};

export const babelParse = resolveBabelParse();

if (typeof babelParse !== 'function') {
  throw Error('Unable to resolve @babel/parser parse function');
}
