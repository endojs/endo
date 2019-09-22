/* global Evaluator */
/* eslint-disable no-self-compare, no-console */
const $ = selector => document.querySelector(selector);

const run = $('#run');
const reset = $('#reset');
const input = $('#input');
const output = $('#output');

const evaluator = new Evaluator();

run.addEventListener('click', () => {
  const sourceText = input.value;
  let result, outputText;
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

reset.addEventListener('click', () => {
  input.value = '';
  output.value = '';
});
