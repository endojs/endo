// `@babel/parser` is native ESM as of Babel 8, so `parse` is a plain named
// export on every runtime. Earlier versions were CJS, and the shape the
// importing runtime produced varied enough that this module had to sniff for
// the callable parser across `parse`, `default.parse` and `default`.
export { parse as babelParse } from '@babel/parser';
