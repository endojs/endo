// https://www.ecma-international.org/ecma-262/9.0/index.html#sec-html-like-comments
// explains that JavaScript parsers may or may not recognize html
// comment tokens "<" immediately followed by "!--" and "--"
// immediately followed by ">" in non-module source text, and treat
// them as a kind of line comment. Since otherwise both of these can
// appear in normal JavaScript source code as a sequence of operators,
// we have the terrifying possibility of the same source code parsing
// one way on one correct JavaScript implementation, and another way
// on another.
//
// This shim takes the conservative strategy of just rejecting source
// text that contains these strings anywhere. Note that this very
// source file is written strangely to avoid mentioning these
// character strings explicitly.

// We do not write the regexp in a straightforward way, so that an
// apparennt html comment does not appear in this file. Thus, we avoid
// rejection by the overly eager rejectDangerousSources.
const htmlCommentPattern = new RegExp(`(?:${'<'}!--|--${'>'})`);

function rejectHtmlComments(s) {
  const index = s.search(htmlCommentPattern);
  if (index !== -1) {
    const linenum = s.slice(0, index).split('\n').length; // more or less
    throw new SyntaxError(
      `possible html comment syntax rejected around line ${linenum}`
    );
  }
}

// The proposed dynamic import expression is the only syntax currently
// proposed, that can appear in non-module JavaScript code, that
// enables direct access to the outside world that cannot be
// surpressed or intercepted without parsing and rewriting. Instead,
// this shim conservatively rejects any source text that seems to
// contain such an expression. To do this safely without parsing, we
// must also reject some valid programs, i.e., those containing
// apparent import expressions in literal strings or comments.

// The current conservative rule looks for the identifier "import"
// followed by either an open paren or something that looks like the
// beginning of a comment. We assume that we do not need to worry
// about html comment syntax because that was already rejected by
// rejectHtmlComments.

// this \s *must* match all kinds of syntax-defined whitespace. If e.g.
// U+2028 (LINE SEPARATOR) or U+2029 (PARAGRAPH SEPARATOR) is treated as
// whitespace by the parser, but not matched by /\s/, then this would admit
// an attack like: import\u2028('power.js') . We're trying to distinguish
// something like that from something like importnotreally('power.js') which
// is perfectly safe.

const importPattern = /\bimport\s*(?:\(|\/[/*])/;

function rejectImportExpressions(s) {
  const index = s.search(importPattern);
  if (index !== -1) {
    const linenum = s.slice(0, index).split('\n').length; // more or less
    throw new SyntaxError(
      `possible import expression rejected around line ${linenum}`
    );
  }
}

// The shim cannot correctly emulate a direct eval as explained at
// https://github.com/Agoric/realms-shim/issues/12
// Without rejecting apparent direct eval syntax, we would
// accidentally evaluate these with an emulation of indirect eval. Tp
// prevent future compatibility problems, in shifting from use of the
// shim to genuine platform support for the proposal, we should
// instead statically reject code that seems to contain a direct eval
// expression.
//
// As with the dynamic import expression, to avoid a full parse, we do
// this approximately with a regexp, that will also reject strings
// that appear safely in comments or strings. Unlike dynamic import,
// if we miss some, this only creates future compat problems, not
// security problems. Thus, we are only trying to catch innocent
// occurrences, not malicious one. In particular, `(eval)(...)` is
// direct eval syntax that would not be caught by the following regexp.

const someDirectEvalPattern = /\beval\s*(?:\(|\/[/*])/;

function rejectSomeDirectEvalExpressions(s) {
  const index = s.search(someDirectEvalPattern);
  if (index !== -1) {
    const linenum = s.slice(0, index).split('\n').length; // more or less
    throw new SyntaxError(
      `possible direct eval expression rejected around line ${linenum}`
    );
  }
}

export function rejectDangerousSources(s) {
  rejectHtmlComments(s);
  rejectImportExpressions(s);
  rejectSomeDirectEvalExpressions(s);
}

// Export a rewriter transform.
export const rejectDangerousSourcesTransform = {
  rewrite(rs) {
    rejectDangerousSources(rs.src);
    return rs;
  }
};
