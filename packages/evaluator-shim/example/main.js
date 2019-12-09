/* globals document */
Promise.all([
  import('../../repair-legacy-accessors/src/main.js'),
  import('../../tame-function-constructors/src/main.js'),
  // eslint-disable-next-line import/no-useless-path-segments
  import('../../evaluator-shim/src/main.js'),
]).then(
  ([
    { default: repairLegacyAccessors },
    { default: repairFunctionConstructors },
    { default: Evaluator },
  ]) => {
    repairLegacyAccessors();
    repairFunctionConstructors();

    const $ = selector => document.querySelector(selector);

    const run = $('#run');
    const reset = $('#reset');
    const input = $('#input');
    const output = $('#output');

    const evaluator = new Evaluator();

    run.addEventListener('click', () => {
      const sourceText = input.value;
      let result;
      let outputText;
      try {
        result = evaluator.evaluateScript(sourceText);
        switch (typeof result) {
          case 'function':
            outputText = result.toString();
            break;
          case 'object':
            outputText = JSON.stringify(result);
            break;
          default:
            outputText = `${result}`;
        }
      } catch (e) {
        outputText = `${e}`;
      }

      console.log(result);
      output.value = outputText;
    });

    reset.addEventListener('click', () => {
      input.value = '';
      output.value = '';
    });
  },
);
