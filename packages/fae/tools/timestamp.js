// @ts-check

import { makeExo } from '@endo/exo';

import { FaeToolInterface } from '../src/fae-tool-interface.js';

/**
 * Example tool caplet: current timestamp.
 * Demonstrates Node.js access from an unsandboxed tool caplet.
 * Run via `endo run --UNCONFINED tools/timestamp.js` to produce a FaeTool exo.
 */
export const make = _powers => {
  /** @type {import('../src/tool-makers.js').ToolSchema} */
  const toolSchema = harden({
    type: 'function',
    function: {
      name: 'timestamp',
      description:
        'Get the current date and time. Optionally specify a timezone.',
      parameters: {
        type: 'object',
        properties: {
          timezone: {
            type: 'string',
            description:
              'IANA timezone (e.g. "America/New_York", "UTC"). Defaults to the system timezone.',
          },
        },
        required: [],
      },
    },
  });

  return makeExo('TimestampTool', FaeToolInterface, {
    schema() {
      return toolSchema;
    },
    async execute(args) {
      const { timezone } = /** @type {{ timezone?: string }} */ (args);
      const now = new Date();
      if (timezone) {
        try {
          return now.toLocaleString('en-US', { timeZone: timezone });
        } catch {
          return `Invalid timezone "${timezone}". Current UTC: ${now.toISOString()}`;
        }
      }
      return now.toISOString();
    },
    help() {
      return 'Get the current date and time.';
    },
  });
};
harden(make);
