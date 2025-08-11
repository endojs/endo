function getPrompt({ userQuery, functions = [], addResponse = false }) {
  /**
   * Generates a conversation prompt based on the user's query and a list of functions.
   *
   * Parameters:
   * - userQuery (string): The user's query.
   * - functions (array): A list of functions to include in the prompt.
   *
   * Returns:
   * - string: The formatted conversation prompt.
   */
  const system =
    'You are an AI programming assistant, utilizing the Gorilla LLM model, developed by Gorilla LLM, and you only answer questions related to computer science. Use the provided functions to help you answer your question.';

  if (functions.length === 0) {
    return `${system}\n### Instruction: <<question>> ${userQuery}\n### Response: `;
  }

  const functionsString = JSON.stringify(functions);
  let result = `${system}\n### Instruction: <<function>>${functionsString}`;
  if (userQuery) {
    const queryString = `\n<<question>> ${userQuery}`;
    result += queryString;
  }
  if (addResponse) {
    result += '\n### Response: ';
  }
  return result;
}

const functions = [
  {
    name: 'get_current_weather',
    description: 'Get the current weather in a given location',
    parameters: {
      type: 'object',
      properties: {
        location: {
          type: 'string',
          description: 'The city and state, e.g. San Francisco, CA',
        },
        unit: { type: 'string', enum: ['celsius', 'fahrenheit'] },
      },
      required: ['location'],
    },
  },
  {
    name: 'eval',
    description: 'Evaluate javascript in a sandbox environment',
    parameters: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'The javascript code to evaluate',
        },
        unit: { type: 'string' },
      },
      required: ['code'],
    },
  },
];

const queryModelWithChat = async (query, functions) => {
  const systemPrompt = getPrompt({ functions });
  const resp = await fetch('http://127.0.0.1:1234/v1/chat/completions', {
    headers: {
      'content-type': 'application/json',
    },
    method: 'POST',
    body: JSON.stringify({
      // "model": "gorilla-openfunctions-v2",
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: query },
      ],
      temperature: 0.7,
      max_tokens: -1,
      stream: false,
    }),
  });
  const json = await resp.json();
  const response = json.choices[0].message.content;
  return response;
};

const queryModelWithPrompt = async (query, functions) => {
  const prompt = getPrompt({ userQuery: query, functions, addResponse: true });
  const resp = await fetch('http://127.0.0.1:1234/v1/completions', {
    headers: {
      'content-type': 'application/json',
    },
    method: 'POST',
    body: JSON.stringify({
      // "model": "gorilla-openfunctions-v2",
      prompt: prompt,
      temperature: 0.7,
      max_tokens: -1,
      stream: false,
    }),
  });
  const json = await resp.json();
  const response = json.choices[0].text;
  return response;
};

const queryModelWithToolCall = async (query, functions) => {
  const response = await queryModelWithPrompt(query, functions);
  // const response = await queryModelWithChat(query, functions);
  return response;
};

async function start() {
  const [query] = process.argv.slice(2);
  const response = await queryModelWithToolCall(query, functions);
  console.log('----------');
  console.log(response);
}

start();
