'use strict';

const USE_JESSIE_BEFORE_FIRST_STATEMENT_REGEXP = /^\s*\/\/\s*@jessie-check\s*$/m;
const USE_JESSIE_FIRST_STATEMENT_REGEXP = /^('use\s+jessie'|"use\s+jessie"|import\s+('@jessie.js\/transform-this-module'|"jessie.js\/transform-this-module"))/;

// This is all one line so that we don't mess up
// eslint's error locations.
//
// TODO: Generate this from a data structure.
const jessieRulesOneLine = `\
/* eslint\
 curly: ['error', 'all']\
,eqeqeq: ['error', 'always']\
,no-bitwise: ['error']\
,no-fallthrough: ['error', { commentPattern: 'fallthrough is not allowed in Jessie' }]\
,no-restricted-globals: ['error', 'RegExp', 'Date']\
,no-restricted-syntax: ['error', \
{\
  selector: "BinaryExpression[operator='in']",\
  message: "'in' is not allowed in Jessie",\
},\
{\
  selector: "UpdateExpression[operator='++'][prefix=false]",\
  message: "postfix '++' is not allowed in Jessie",\
},\
{\
  selector: "UpdateExpression[operator='--'][prefix=false]",\
  message: "postfix '--' is not allowed in Jessie",\
},\
{\
  selector: "BinaryExpression[operator='instanceof']",\
  message: "'instanceof' is not allowed in Jessie",\
},\
{\
  selector: 'NewExpression',\
  message: "'new' is not allowed in Jessie",\
},\
{\
  selector: 'FunctionDeclaration[generator=true]',\
  message: 'generators are not allowed in Jessie',\
},\
{\
  selector: 'FunctionDeclaration[async=true]',\
  message: 'async functions are not allowed in Jessie',\
},\
{\
  selector: 'FunctionExpression[async=true]',\
  message: 'async functions are not allowed in Jessie',\
},\
{\
  selector: 'ArrowFunctionExpression[async=true]',\
  message: 'async functions are not allowed in Jessie',\
},\
{\
  selector: 'DoWhileStatement',\
  message: 'do/while statements are not allowed in Jessie',\
},\
{\
  selector: 'ThisExpression',\
  message: "'this' not allowed in Jessie",\
},\
{\
  selector: "UnaryExpression[operator='delete']",\
  message: "'delete' not allowed in Jessie",\
},\
{\
  selector: 'ForInStatement',\
  message: 'for/in statements are not allowed in Jessie; use for/of Object.keys(val).',\
},\
{\
  selector: 'MemberExpression[computed=true][property.type!="Literal"][property.type!="UnaryExpression"]',\
  message: "computed property names are not allowed in Jessie (except with leading '+')",\
},\
{\
  selector: 'MemberExpression[computed=true][property.type="UnaryExpression"][property.operator!="+"]',\
  message: 'computed property names are not allowed in Jessie (except with leading '+')',\
},\
{\
  selector: 'Super',\
  message: "'super' is not allowed in Jessie",\
},\
{\
  selector: 'MetaProperty',\
  message: "'MetaProperty' is not allowed in Jessie",\
},\
{\
  selector: 'ClassExpression',\
  message: "'ClassExpression' is not allowed in Jessie",\
},\
{\
  selector: "CallExpression[callee.name='eval']",\
  message: "'eval' is not allowed in Jessie",\
},\
{\
  selector: 'Literal[regex]',\
  message: 'regexp literal syntax is not allowed in Jessie',\
}\
]\
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
  if (text.substr(0, pos).match(USE_JESSIE_BEFORE_FIRST_STATEMENT_REGEXP)) {
    return true;
  }
  if (pos >= 0) {
    if (USE_JESSIE_FIRST_STATEMENT_REGEXP.test(text.substr(pos))) {
      return true;
    }
  }
  return false;
}

const prependedText = text => {
  if (!isJessie(text)) {
    return '';
  }
  let prepend = jessieRulesOneLine;
  if (text.startsWith('#!')) {
    prepend += '// ';
  }
  return prepend;
}

const filenameToPrepend = new Map();
module.exports = {
  preprocess(text, filename) {
    const prepend = prependedText(text);
    if (prepend) {
      filenameToPrepend.set(filename, prepend);
      return [
        `${prepend}${text}`
      ];
    }
    filenameToPrepend.delete(filename);
    return [text];
  },
  postprocess(messages, filename) {
    if (!filenameToPrepend.has(filename)) {
      return [].concat(...messages);
    }
    const prepend = filenameToPrepend.get(filename);
    const rewritten = messages.flatMap(errors => errors.map(err => {
      if ('fix' in err) {
        // Remove the prepension we inserted.
        const range = err.fix.range.map(offset => Math.max(offset - prepend.length, 0));
        return { ...err, fix: { ...err.fix, range }};
      }
      return err;
    }));
    // console.error('have rewritten', require('util').inspect(rewritten, undefined, Infinity))
    return rewritten;
  },
  supportsAutofix: true,
};
