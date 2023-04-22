/// <reference types="ses">
import {
  TypeError,
  arrayPush,
  create,
  getOwnPropertyDescriptors,
} from './commons.js';
import {
  evadeHtmlCommentTest,
  evadeImportExpressionTest,
  rejectSomeDirectEvalExpressions,
} from './transforms.js';
import { makeSafeEvaluator } from './make-safe-evaluator.js';

export const provideCompartmentEvaluator = (compartmentFields, options) => {
  const { sloppyGlobalsMode = false, __moduleShimLexicals__ = undefined } =
    options;

  let safeEvaluate;

  if (__moduleShimLexicals__ === undefined && !sloppyGlobalsMode) {
    ({ safeEvaluate } = compartmentFields);
  } else {
    // The scope proxy or global lexicals are different from the
    // shared evaluator so we need to build a new one

    let { globalTransforms } = compartmentFields;
    const { globalObject } = compartmentFields;

    let moduleLexicals;
    if (__moduleShimLexicals__ !== undefined) {
      // When using `evaluate` for ESM modules, as should only occur from the
      // module-shim's module-instance.js, we do not reveal the SES-shim's
      // module-to-program translation, as this is not standardizable behavior.
      // However, the `localTransforms` will come from the `__shimTransforms__`
      // Compartment option in this case, which is a non-standardizable escape
      // hatch so programs designed specifically for the SES-shim
      // implementation may opt-in to use the same transforms for `evaluate`
      // and `import`, at the expense of being tightly coupled to SES-shim.
      globalTransforms = undefined;

      moduleLexicals = create(
        null,
        getOwnPropertyDescriptors(__moduleShimLexicals__),
      );
    }

    ({ safeEvaluate } = makeSafeEvaluator({
      globalObject,
      moduleLexicals,
      globalTransforms,
      sloppyGlobalsMode,
    }));
  }

  return { safeEvaluate };
};

export const compartmentEvaluate = (compartmentFields, source, options) => {
  // Perform this check first to avoid unnecessary sanitizing.
  // TODO Maybe relax string check and coerce instead:
  // https://github.com/tc39/proposal-dynamic-code-brand-checks
  if (typeof source !== 'string') {
    throw TypeError('first argument of evaluate() must be a string');
  }

  // Extract options, and shallow-clone transforms.
  const {
    transforms = [],
    __evadeHtmlCommentTest__ = false,
    __evadeImportExpressionTest__ = false,
    __rejectSomeDirectEvalExpressions__ = true, // Note default on
  } = options;
  const localTransforms = [...transforms];
  if (__evadeHtmlCommentTest__ === true) {
    arrayPush(localTransforms, evadeHtmlCommentTest);
  }
  if (__evadeImportExpressionTest__ === true) {
    arrayPush(localTransforms, evadeImportExpressionTest);
  }
  if (__rejectSomeDirectEvalExpressions__ === true) {
    arrayPush(localTransforms, rejectSomeDirectEvalExpressions);
  }

  const { safeEvaluate } = provideCompartmentEvaluator(
    compartmentFields,
    options,
  );

  return safeEvaluate(source, {
    localTransforms,
  });
};
