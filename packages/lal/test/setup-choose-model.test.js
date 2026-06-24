import test from '@endo/ses-ava/prepare-endo.js';

import { chooseModel } from '../model-detect.js';

test('chooseModel keeps the default when it is installed', t => {
  t.is(
    chooseModel(['llama3:latest', 'qwen3', 'qwen3.6:latest'], 'qwen3'),
    'qwen3',
  );
});

test('chooseModel selects a same-family model when the default is absent', t => {
  // The bug this guards: Ollama advertises `qwen3.6:latest` but not the bare
  // `qwen3` default, so the agent must select the installed family member
  // rather than 404 on `qwen3`.
  t.is(chooseModel(['qwen3.6:latest'], 'qwen3'), 'qwen3.6:latest');
});

test('chooseModel prefers the family match over an unrelated first model', t => {
  t.is(
    chooseModel(['llama3:latest', 'qwen3.6:latest'], 'qwen3'),
    'qwen3.6:latest',
  );
});

test('chooseModel falls back to the first advertised model with no family match', t => {
  t.is(
    chooseModel(['llama3:latest', 'mistral:latest'], 'qwen3'),
    'llama3:latest',
  );
});

test('chooseModel returns undefined when the catalog is empty', t => {
  t.is(chooseModel([], 'qwen3'), undefined);
});
