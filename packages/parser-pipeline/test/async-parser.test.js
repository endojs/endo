import test from '@endo/ses-ava/prepare-endo.js';
import { createParsers } from '../src/parsers.js';

const textEncoder = new TextEncoder();

// Workers are unref()'d by the pool, so they won't prevent the process from
// exiting once all in-flight dispatches settle. No explicit teardown needed.
test.serial(
  'onModuleComplete is called with user visitorResults only',
  async t => {
    /** @type {{ visitorResults: unknown[]; language: string }[]} */
    const collectedData = [];

    const { async: asyncParsers } = createParsers({
      workerScript: new URL(
        './fixture/async-parser-worker.js',
        import.meta.url,
      ),
      onModuleComplete: ({ visitorResults, language }) => {
        collectedData.push({ visitorResults, language });
      },
    });

    const source = `export const x = 1;`;

    await asyncParsers.mjs.parse(
      textEncoder.encode(source),
      'test',
      'file:///test.js',
      'file:///',
      {},
    );

    t.is(collectedData.length, 1);
    // Should contain only the user-defined visitor result, not the module-source analysis.
    t.deepEqual(collectedData[0].visitorResults, ['user-result']);
    t.is(collectedData[0].language, 'mjs');
  },
);
