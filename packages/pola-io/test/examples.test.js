import test from 'ava';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import * as snip from './fixtures/example-snippets.js';
import { main as cmdMain } from './fixtures/cmd-runner-example.js';

const require = createRequire(import.meta.url);
const readmePath = require.resolve('../README.md');
const readmeContent = await readFile(readmePath, 'utf8');

/**
 * Extract code blocks from README.md
 * @param {string} text
 * @param {string[]} targets
 */
function extractExamples(text, targets) {
  // First extract all fenced code blocks and get their content
  // NOTE: can't handle ` in README text
  const fencedBlocks = (text.match(/```js[^`]*```/g) || []).map(block =>
    block
      .replace(/^```js[^\n]*\n/, '')
      .replace(/```$/, '')
      .trim(),
  );
  const examples = {};

  for (const content of fencedBlocks) {
    // Check if first line contains any of our search terms
    const [firstLine] = content.split('\n', 2);
    for (const searchTerm of targets) {
      if (firstLine.includes(searchTerm)) {
        examples[searchTerm] = content;
        break;
      }
    }
  }

  return examples;
}

const checkExampleMatch = test.macro({
  async exec(t, exampleKey, fixtureExample, shouldRemoveBackticks = false) {
    const readmeExamples = extractExamples(readmeContent, [
      'makeCmdRunner',
      'makeFileRW',
    ]);

    if (!readmeExamples[exampleKey]) {
      t.fail(`Could not extract ${exampleKey} example from README`);
      return;
    }

    let readmeExample = readmeExamples[exampleKey];
    if (shouldRemoveBackticks) {
      readmeExample = readmeExample.replace(/`/g, '');
    }
    t.is(
      readmeExample,
      fixtureExample,
      `${exampleKey} example in README should match fixture file`,
    );
  },
  title(providedTitle, exampleKey) {
    return `${providedTitle} ${exampleKey} example matches fixture file`.trim();
  },
});

test(checkExampleMatch, 'makeCmdRunner', snip.cmdRunnerExample, true);
test(checkExampleMatch, 'makeFileRW', snip.readonlyFileExample, false);

test('cmd example', async t => {
  /** @type {any} */ // TODO
  const execFile = (file, args, _opts) => {
    t.is(file, 'npx');
    t.deepEqual(args, ['agoric', 'run', 'builder.js']);
    return { stdout: 'building...' };
  };

  const actual = await cmdMain({ execFile });
  t.deepEqual(actual, ['building...']);
});
