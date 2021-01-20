import test from 'ava';
import { makeEvaluateFactory } from '../src/make-evaluate-factory.js';

test('Intrinsics - values', t => {
  t.plan(2);

  t.is(
    makeEvaluateFactory().toString(),
    "function anonymous(\n) {\n\n    with (this) {\n      \n      return function() {\n        'use strict';\n        return eval(arguments[0]);\n      };\n    }\n  \n}",
  );

  t.is(
    makeEvaluateFactory(['foot']).toString(),
    "function anonymous(\n) {\n\n    with (this) {\n      const {foot} = this;\n      return function() {\n        'use strict';\n        return eval(arguments[0]);\n      };\n    }\n  \n}",
  );
});
