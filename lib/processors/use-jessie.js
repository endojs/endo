'use strict';

// This is all one line so that we don't mess up
// eslint's error locations.
//
// TODO: Generate this from a data structure.
const jessieRulesOneLine = `\
/* eslint\
 curly: ['error', 'all']\
,eqeqeq: ['error', 'always']\
,no-bitwise: ['error']\
,no-fallthrough: ['error', { commentPattern: 'fallthrough is not allowed' }]\
,no-plusplus: ['error']\
,no-restricted-globals: ['error', 'RegExp', 'Date']\
,no-restricted-syntax: ['error', \
{\
  selector: "BinaryExpression[operator='in']",\
  message: "'in' is not allowed.",\
},\
{\
  selector: "BinaryExpression[operator='instanceof']",\
  message: "'instanceof' is not allowed.",\
},\
{\
  selector: 'NewExpression',\
  message: "'new' is not allowed.",\
},\
{\
  selector: 'FunctionDeclaration[generator=true]',\
  message: 'generators are not allowed.',\
},\
{\
  selector: 'FunctionDeclaration[async=true]',\
  message: 'async functions are not allowed.',\
},\
{\
  selector: 'FunctionExpression[async=true]',\
  message: 'async functions are not allowed.',\
},\
{\
  selector: 'ArrowFunctionExpression[async=true]',\
  message: 'async functions are not allowed.',\
},\
{\
  selector: 'DoWhileStatement',\
  message: 'do/while statements are not allowed.',\
},\
{\
  selector: 'ThisExpression',\
  message: "'this' not allowed.",\
},\
{\
  selector: "UnaryExpression[operator='delete']",\
  message: "'delete' not allowed.",\
},\
{\
  selector: 'ForInStatement',\
  message: 'for/in statements are not allowed; use for/of Object.keys(val).',\
},\
{\
  selector: 'MemberExpression[computed=true]',\
  message: 'computed property names are not allowed.',\
},\
{\
  selector: 'Super',\
  message: "'super' is not allowed.",\
},\
{\
  selector: 'MetaProperty',\
  message: "'MetaProperty' is not allowed.",\
},\
{\
  selector: 'ClassExpression',\
  message: "'ClassExpression' is not allowed.",\
},\
{\
  selector: "CallExpression[callee.name='eval']",\
  message: "'eval' is not allowed.",\
},\
{\
  selector: 'Literal[regex]',\
  message: 'regexp literal syntax is not allowed.',\
}\
]\
,no-ternary: ['error']\
,no-var: ['error']\
,guard-for-in: 'off'\
,semi: ['error', 'always']\
 */ \
`;

function indexOfFirstStatement(text) {
  let i = 0;
  let slashStarComment = false;

  while (i < text.length) {
    let s = text.substr(i);
    if (slashStarComment) {
      const endComment = s.match(/^.*?\*\//s);
      if (endComment) {
        slashStarComment = false;
        i += endComment[0].length;
      } else {
        return -1;
      }
    } else {
      const ws = s.match(/^\s+/);
      if (ws) {
        i += ws[0].length;
        s = text.substr(i);
      }

      const multilineComment = s.match(/^\/\*/);
      if (multilineComment) {
        slashStarComment = true;
        i += multilineComment[0].length;
      } else {
        const lineComment = s.match(/^\/\/.*/);
        if (lineComment) {
          i += lineComment[0].length;
        } else {
          // No comments, no whitespace.
          return i;
        }
      }
    }
  }
  return -1;
}

function isJessie(text) {
  const pos = indexOfFirstStatement(text);
  if (pos >= 0) {
    for (const jessieToken of ['"use jessie";', "'use jessie';"]) {
      if (text.substr(pos, jessieToken.length) === jessieToken) {
        return true;
      }
    }
  }
  return false;
}

const filenameIsJessie = new Set();
module.exports = {
  preprocess(text, filename) {
    if (isJessie(text)) {
      filenameIsJessie.add(filename);
      return [
        `${jessieRulesOneLine}${text}`
      ];
    }
    filenameIsJessie.delete(filename);
    return [text];
  },
  postprocess(messages, filename) {
    if (!filenameIsJessie.has(filename)) {
      return [].concat(...messages);
    }
    const rewritten = messages.flatMap(errors => errors.map(err => {
      if ('fix' in err) {
        // Remove the bytes we inserted.
        const range = err.fix.range.map(offset => offset > jessieRulesOneLine.length ? offset - jessieRulesOneLine.length : offset);
        return { ...err, fix: { ...err.fix, range }};
      }
      return err;
    }));
    // console.error('have rewritten', require('util').inspect(rewritten, undefined, Infinity))
    return rewritten;
  },
  supportsAutofix: true,
};
