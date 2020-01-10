/* globals document, Evaluator */
import('../dist/ses.esm.js').then(({ lockdown }) => {
  lockdown();

  const $ = selector => document.querySelector(selector);

  const run = $('#run');
  const clear = $('#clear');
  const input = $('#input');
  const output = $('#output');

  const evaluator = new Evaluator();

  run.addEventListener('click', () => {
    const sourceText = input.value;
    let result;
    let outputText;
    try {
      result = evaluator.evaluate(sourceText);
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
});
