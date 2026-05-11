export const endoTools = [
 {
    name: 'execute',
    description: 'Execute code in the Endo environment',
    parameters: {
      type: 'object',
      properties: {
        source: {
          type: 'string',
          description: 'The source code to execute',
        },
      },
      required: ['source'],
      additionalProperties: false,
    },
 },
];
