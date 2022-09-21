import test from 'ava';
import { makeEvaluateFactory } from '../src/make-evaluate-factory.js';

test('Intrinsics - values', t => {
  t.plan(2);

  t.is(
    makeEvaluateFactory().toString().replace(/\s/g, ' ').replace(/ +/g, ' '),
    "function anonymous( ) { with (this.scopeProxy) { with (this.evalScope) { return function() { 'use strict'; return eval(arguments[0]); }; } } }",
  );

  t.is(
    makeEvaluateFactory(['foot']).toString().replace(/\s/g, ' ').replace(/ +/g, ' '),
    "function anonymous( ) { with (this.scopeProxy) { with (this.evalScope) { const {foot} = this.scopeProxy; return function() { 'use strict'; return eval(arguments[0]); }; } } }",
  );
});
