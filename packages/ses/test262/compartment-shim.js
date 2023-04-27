/* global globalThis */

import test262Runner from '@endo/test262-runner';
import '../index.js';

export default function patchFunctionConstructors() {
  /* eslint-disable no-proto */

  function F() {}

  const FC = Object.getOwnPropertyDescriptor(F.__proto__, 'constructor');

  Object.defineProperty(F.__proto__, 'constructor', {
    ...FC,
    value: function Function() {
      throw TypeError();
    },
  });

  function restore() {
    Object.defineProperty(F.__proto__, 'constructor', FC);
  }

  return restore;

  /* eslint-enable no-proto */
}

test262Runner({
  testDirs: [
    '/test/built-ins/eval',
    '/test/built-ins/Function',
    '/test/built-ins/global',
    '/test/language/eval-code',
  ],
  excludePaths: [
    '_FIXTURE.js', // test262 convention, does not contain tests.
    'built-ins/eval/name.js',
    'built-ins/eval/no-construct.js',
    'built-ins/eval/private-identifiers-not-empty.js',
    'built-ins/Function/15.3.2.1-11-1.js',
    'built-ins/Function/15.3.2.1-11-2-s.js',
    'built-ins/Function/15.3.2.1-11-3.js',
    'built-ins/Function/15.3.2.1-11-4-s.js',
    'built-ins/Function/15.3.2.1-11-5.js',
    'built-ins/Function/15.3.2.1-11-6-s.js',
    'built-ins/Function/15.3.2.1-11-7-s.js',
    'built-ins/Function/15.3.2.1-11-8-s.js',
    'built-ins/Function/15.3.2.1-11-9-s.js',
    'built-ins/Function/15.3.5.4_2-11gs.js',
    'built-ins/Function/15.3.5.4_2-13gs.js',
    'built-ins/Function/15.3.5.4_2-7gs.js',
    'built-ins/Function/15.3.5.4_2-9gs.js',
    'built-ins/Function/length/S15.3.5.1_A1_T3.js',
    'built-ins/Function/length/S15.3.5.1_A2_T3.js',
    'built-ins/Function/length/S15.3.5.1_A3_T3.js',
    'built-ins/Function/length/S15.3.5.1_A4_T3.js',
    'built-ins/Function/prototype/apply/S15.3.4.3_A3_T1.js',
    'built-ins/Function/prototype/apply/S15.3.4.3_A3_T2.js',
    'built-ins/Function/prototype/apply/S15.3.4.3_A3_T3.js',
    'built-ins/Function/prototype/apply/S15.3.4.3_A3_T4.js',
    'built-ins/Function/prototype/apply/S15.3.4.3_A3_T5.js',
    'built-ins/Function/prototype/apply/S15.3.4.3_A3_T7.js',
    'built-ins/Function/prototype/apply/S15.3.4.3_A3_T9.js',
    'built-ins/Function/prototype/apply/S15.3.4.3_A5_T1.js',
    'built-ins/Function/prototype/apply/S15.3.4.3_A5_T2.js',
    'built-ins/Function/prototype/apply/S15.3.4.3_A7_T1.js',
    'built-ins/Function/prototype/apply/S15.3.4.3_A7_T2.js',
    'built-ins/Function/prototype/apply/S15.3.4.3_A7_T5.js',
    'built-ins/Function/prototype/apply/S15.3.4.3_A7_T7.js',
    'built-ins/Function/prototype/apply/S15.3.4.3_A7_T8.js',
    'built-ins/Function/prototype/bind/15.3.4.5-6-11.js',
    'built-ins/Function/prototype/bind/15.3.4.5-6-12.js',
    'built-ins/Function/prototype/bind/15.3.4.5-6-2.js',
    'built-ins/Function/prototype/bind/15.3.4.5-6-3.js',
    'built-ins/Function/prototype/bind/15.3.4.5-6-7.js',
    'built-ins/Function/prototype/call/S15.3.4.4_A3_T1.js',
    'built-ins/Function/prototype/call/S15.3.4.4_A3_T2.js',
    'built-ins/Function/prototype/call/S15.3.4.4_A3_T3.js',
    'built-ins/Function/prototype/call/S15.3.4.4_A3_T4.js',
    'built-ins/Function/prototype/call/S15.3.4.4_A3_T5.js',
    'built-ins/Function/prototype/call/S15.3.4.4_A3_T7.js',
    'built-ins/Function/prototype/call/S15.3.4.4_A3_T9.js',
    'built-ins/Function/prototype/call/S15.3.4.4_A5_T1.js',
    'built-ins/Function/prototype/call/S15.3.4.4_A5_T2.js',
    'built-ins/Function/prototype/call/S15.3.4.4_A6_T1.js',
    'built-ins/Function/prototype/call/S15.3.4.4_A6_T2.js',
    'built-ins/Function/prototype/call/S15.3.4.4_A6_T5.js',
    'built-ins/Function/prototype/call/S15.3.4.4_A6_T7.js',
    'built-ins/Function/prototype/call/S15.3.4.4_A6_T8.js',
    'built-ins/Function/prototype/constructor/S15.3.4.1_A1_T1.js',
    'built-ins/Function/prototype/toString/AsyncFunction.js',
    'built-ins/Function/prototype/toString/AsyncGenerator.js',
    'built-ins/Function/prototype/toString/GeneratorFunction.js',
    'built-ins/Function/prototype/toString/private-method-class-expression.js',
    'built-ins/Function/prototype/toString/private-method-class-statement.js',
    'built-ins/Function/prototype/toString/private-static-method-class-expression.js',
    'built-ins/Function/prototype/toString/private-static-method-class-statement.js',
    'built-ins/Function/S15.3.2.1_A3_T1.js',
    'built-ins/Function/S15.3.2.1_A3_T3.js',
    'built-ins/Function/S15.3.2.1_A3_T6.js',
    'built-ins/Function/S15.3.2.1_A3_T8.js',
    'built-ins/Function/S15.3.5_A2_T1.js',
    'built-ins/Function/S15.3.5_A2_T2.js',
    'built-ins/Function/S15.3_A3_T1.js',
    'built-ins/Function/S15.3_A3_T2.js',
    'built-ins/Function/S15.3_A3_T3.js',
    'built-ins/Function/S15.3_A3_T4.js',
    'built-ins/Function/S15.3_A3_T5.js',
    'built-ins/Function/S15.3_A3_T6.js',
    'language/eval-code/direct/',
    'language/eval-code/indirect/always-non-strict.js',
    'language/eval-code/indirect/cptn-nrml-expr-obj.js',
    'language/eval-code/indirect/cptn-nrml-expr-prim.js',
    'language/eval-code/indirect/global-env-rec-catch.js',
    'language/eval-code/indirect/global-env-rec-eval.js',
    'language/eval-code/indirect/global-env-rec-fun.js',
    'language/eval-code/indirect/global-env-rec.js',
    'language/eval-code/indirect/lex-env-heritage.js',
    'language/eval-code/indirect/new.target.js',
    'language/eval-code/indirect/non-definable-global-function.js',
    'language/eval-code/indirect/non-definable-global-generator.js',
    'language/eval-code/indirect/non-definable-global-var.js',
    'language/eval-code/indirect/var-env-func-init-global-new.js',
    'language/eval-code/indirect/var-env-func-init-global-update-configurable.js',
    'language/eval-code/indirect/var-env-func-init-global-update-non-configurable.js',
    'language/eval-code/indirect/var-env-func-init-multi.js',
    'language/eval-code/indirect/var-env-func-non-strict.js',
    'language/eval-code/indirect/var-env-global-lex-non-strict.js',
    'language/eval-code/indirect/var-env-var-init-global-exstng.js',
    'language/eval-code/indirect/var-env-var-init-global-new.js',
    'language/eval-code/indirect/var-env-var-non-strict.js',

    typeof globalThis === 'undefined'
      ? 'built-ins/global/global-object.js'
      : null,
    typeof globalThis === 'undefined'
      ? 'built-ins/global/property-descriptor.js'
      : null,
  ],
  excludeDescriptions: [],
  excludeFeatures: [
    'cross-realm', // TODO: Evaluator does not create realms.
  ],
  excludeFlags: [
    'noStrict', // TODO: Evaluator does not support sloppy mode.
  ],
  excludeErrors: [],
  sourceTextCorrections: [
    // Simple fixes to enable unblock tests that rely on specifc side-effects.
    ['(f.constructor !== Function)', '(!(f instanceof Function))'],
    ['\neval(evalStr);\n', '\nFunction("$ERROR", evalStr)($ERROR)\n'],
    ['\nvar globalVariable = {};\n', '\nthis.globalVariable = {};\n'],

    // Removed to prevent polluting the intrinsics.
    // ["\nverifyConfigurable(Function.prototype, 'name');\n", ''],
  ],
  async test(testInfo, harness, { applyCorrections }) {
    // The test itself.
    const restore = patchFunctionConstructors();
    const c = new Compartment();
    const contents = applyCorrections(testInfo.contents);
    c.evaluate(`${harness}\n${contents}`);
    restore();
  },
});
