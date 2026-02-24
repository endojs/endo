// @ts-check

import { makeExo } from '@endo/exo';

import { FaeToolInterface } from '../src/fae-tool-interface.js';

/**
 * Example tool caplet: greeting generator.
 * Run via `endo run --UNCONFINED tools/greet.js` to produce a FaeTool exo.
 */
export const make = _powers => {
  /** @type {import('../src/tool-makers.js').ToolSchema} */
  const toolSchema = harden({
    type: 'function',
    function: {
      name: 'greet',
      description:
        'Generate a greeting message for a given name, optionally in a specified language.',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'The name of the person to greet.',
          },
          language: {
            type: 'string',
            description:
              'Language for the greeting (english, spanish, french, german, japanese). Defaults to english.',
          },
        },
        required: ['name'],
      },
    },
  });

  const greetings = harden({
    english: 'Hello',
    spanish: 'Hola',
    french: 'Bonjour',
    german: 'Hallo',
    japanese: 'Konnichiwa',
  });

  return makeExo('GreetTool', FaeToolInterface, {
    schema() {
      return toolSchema;
    },
    async execute(args) {
      const { name, language = 'english' } =
        /** @type {{ name: string, language?: string }} */ (args);
      if (!name) {
        throw new Error('name is required');
      }
      const greeting =
        greetings[/** @type {keyof typeof greetings} */ (language)] ||
        greetings.english;
      return `${greeting}, ${name}!`;
    },
    help() {
      return 'Generate a greeting message for a given name.';
    },
  });
};
harden(make);
