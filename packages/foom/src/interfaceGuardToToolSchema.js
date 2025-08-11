import '@endo/init';
import { M } from '@endo/patterns';

function interfaceGuardToToolSchema(interfaceGuard) {
  const methods = interfaceGuard.payload.methodGuards;
  const functions = [];

  for (const methodName in methods) {
    const methodGuard = methods[methodName];
    const methodSchema = methodGuardToSchema(methodName, methodGuard);
    functions.push({
      type: 'function',
      function: methodSchema,
    });
  }

  return functions;
}

function methodGuardToSchema(methodName, methodGuard) {
  const payload = methodGuard.payload;
  const argGuards = payload.argGuards || [];
  const optionalArgGuards = payload.optionalArgGuards || [];
  const restArgGuard = payload.restArgGuard;
  const returnGuard = payload.returnGuard;

  const parametersSchema = {
    type: 'object',
    properties: {},
    required: [],
  };

  // Process required arguments
  for (let i = 0; i < argGuards.length; i++) {
    const argGuard = argGuards[i];
    const argSchema = patternToJSONSchema(argGuard);
    parametersSchema.properties[`arg${i}`] = argSchema;
    parametersSchema.required.push(`arg${i}`);
  }

  // Process optional arguments
  for (let i = 0; i < optionalArgGuards.length; i++) {
    const argGuard = optionalArgGuards[i];
    const argSchema = patternToJSONSchema(argGuard);
    parametersSchema.properties[`arg${argGuards.length + i}`] = argSchema;
    // Optional arguments are not added to the required array
  }

  // Process rest arguments
  if (restArgGuard) {
    const restArgSchema = patternToJSONSchema(restArgGuard);
    parametersSchema.properties[`args`] = {
      type: 'array',
      items: restArgSchema,
    };
    // Rest arguments are not added to the required array
  }

  const methodSchema = {
    name: methodName,
    description: '', // Add descriptions if available
    parameters: parametersSchema,
    strict: true,
    // OpenAI's function schema does not include return types directly
  };

  return methodSchema;
}

function patternToJSONSchema(pattern) {
  if (!pattern || typeof pattern !== 'object') {
    throw new Error('Invalid pattern');
  }

  if ('tag' in pattern) {
    const tag = pattern.tag;
    switch (tag) {
      case 'match:number':
        return { type: 'number', description: '' };
      case 'match:string':
        return { type: 'string', description: '' };
      case 'match:boolean':
        return { type: 'boolean', description: '' };
      case 'match:any':
        return {}; // Matches any type
      // Add more cases as needed for other patterns
      default:
        throw new Error(`Unknown pattern tag: ${tag}`);
    }
  } else {
    throw new Error('Invalid pattern structure');
  }
}

// Example usage:
const interfaceGuard = M.interface('Counter', {
  increment: M.call().returns(M.number()),
  getCount: M.call().returns(M.number()),
});

console.log('Interface Guard:', interfaceGuard);
const toolSchema = interfaceGuardToToolSchema(interfaceGuard);
console.dir(toolSchema, { depth: null });

// current result:
[
  {
    type: 'function',
    function: {
      name: 'increment',
      description: '',
      parameters: { type: 'object', properties: {}, required: [] },
      strict: true,
    },
  },
  {
    type: 'function',
    function: {
      name: 'getCount',
      description: '',
      parameters: { type: 'object', properties: {}, required: [] },
      strict: true,
    },
  },
];
// goal:
const goal = [
  {
    type: 'function',
    function: {
      name: 'increment',
      description: '',
      parameters: {
        type: 'object',
        properties: {
          arg0: {
            type: 'number',
            description: '',
          },
        },
        required: [],
      },
      strict: true,
    },
  },
];
