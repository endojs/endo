import test from 'tape';
import { createEvaluateFactory } from '../../src/evaluateFactory';

test('Intrinsics - values', t => {
  t.plan(2);

  const realmRec = { intrinsics: { Function } };
  t.equals(
    createEvaluateFactory(realmRec).toString(),
    "function anonymous(\n) {\n\n    with (this) {\n      \n      return function() {\n        'use strict';\n        return eval(arguments[0]);\n      };\n    }\n  \n}",
  );

  t.equals(
    createEvaluateFactory(realmRec, ['foot']).toString(),
    "function anonymous(\n) {\n\n    with (this) {\n      const {foot} = this;\n      return function() {\n        'use strict';\n        return eval(arguments[0]);\n      };\n    }\n  \n}",
  );
});
