import test from 'ava';
import { makeEvaluateFactory } from '../src/make-evaluate-factory.js';

test('Intrinsics - values', t => {
  t.plan(4);

  t.is(
    makeEvaluateFactory()
      .toString()
      .replace(/\s/g, ' ')
      .replace(/ +/g, ' '),
    "function anonymous( ) { with (this.scopeTerminator) { with (this.globalObject) { with (this.globalLexicals) { with (this.evalScope) { return function() { 'use strict'; return eval(arguments[0]); }; } } } } }",
  );

  t.is(
    makeEvaluateFactory(['foot'])
      .toString()
      .replace(/\s/g, ' ')
      .replace(/ +/g, ' '),
    "function anonymous( ) { with (this.scopeTerminator) { with (this.globalObject) { with (this.globalLexicals) { with (this.evalScope) { const {foot} = this.globalObject; return function() { 'use strict'; return eval(arguments[0]); }; } } } } }",
  );

  t.is(
    makeEvaluateFactory([], ['bart'])
      .toString()
      .replace(/\s/g, ' ')
      .replace(/ +/g, ' '),
    "function anonymous( ) { with (this.scopeTerminator) { with (this.globalObject) { with (this.globalLexicals) { with (this.evalScope) { const {bart} = this.globalLexicals; return function() { 'use strict'; return eval(arguments[0]); }; } } } } }",
  );

  t.is(
    makeEvaluateFactory(['foot'], ['bart'])
      .toString()
      .replace(/\s/g, ' ')
      .replace(/ +/g, ' '),
    "function anonymous( ) { with (this.scopeTerminator) { with (this.globalObject) { with (this.globalLexicals) { with (this.evalScope) { const {foot} = this.globalObject; const {bart} = this.globalLexicals; return function() { 'use strict'; return eval(arguments[0]); }; } } } } }",
  );
});
