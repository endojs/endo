import * as babelParser from '@babel/parser';

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
