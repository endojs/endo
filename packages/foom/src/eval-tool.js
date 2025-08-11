export const makeEvalToolMaker = vatSupervisor => {
  const makeEvalTool = vatSupervisor.defineJsClass(
    class EvalTool {
      async activate({ code }) {
        const result = await vatSupervisor.incubate(code);
        const stringResult = assert.quote(result);
        return `${stringResult}`;
      }
      getConfig() {
        return harden({
          description: 'Evaluate JavaScript code in a sandboxed environment',
          arguments: {
            code: {
              type: 'string',
              description: 'The JavaScript code to evaluate',
            },
          },
          requiredArguments: ['code'],
          additionalProperties: false,
        });
      }
    },
  );
  return makeEvalTool;
};
