/* globals document */
Promise.all([
  import('../../repair-legacy-accessors/src/main.js'),
  import('../../tame-function-constructors/src/main.js'),
  // eslint-disable-next-line import/no-useless-path-segments
  import('../../compartment-shim/src/main.js'),
]).then(
  ([
    { default: repairLegacyAccessors },
    { default: repairFunctionConstructors },
    { default: Compartment },
  ]) => {
    repairLegacyAccessors();
    repairFunctionConstructors();

    const $ = selector => document.querySelector(selector);

    const run = $('#run');
    const clear = $('#clear');
    const input = $('#input');
    const output = $('#output');

    const cmp = new Compartment();

    run.addEventListener('click', () => {
      const sourceText = input.value;
      let result;
      let outputText;
      try {
        result = cmp.evaluate(sourceText);
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

    clear.addEventListener('click', () => {
      input.value = '';
      output.value = '';
    });
  },
);
