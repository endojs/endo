import test from '@endo/ses-ava/test.js';
import { LlmProvider } from '../src/llm-provider.js';
import { Agent } from '../src/agent.js';

/**
 * Extract JavaScript code from markdown code blocks.
 * This is the same logic as in llm-provider.js
 *
 * @param {string} text - Text potentially containing code blocks
 * @returns {string} - Extracted code or original text
 */
const extractCodeFromMarkdown = text => {
  // Match code blocks with optional language specifier
  const codeBlockRegex = /```(?:javascript|js)?\s*\n([\s\S]*?)\n```/;
  const match = text.match(codeBlockRegex);

  if (match) {
    return match[1].trim();
  }

  // If no code block found, return original text (might be plain code)
  return text.trim();
};

// Mock LlmProvider for testing
class MockLlmProvider {
  constructor({ responseCode = 'resultResolver.resolve(42);' } = {}) {
    this.responseCode = responseCode;
  }

  /**
   * @param {string} prompt
   * @returns {Promise<string>}
   */
  async generateCode(prompt) {
    // Extract code from markdown just like the real provider
    return extractCodeFromMarkdown(this.responseCode);
  }
}

test('LlmProvider constructor requires apiKey', t => {
  t.throws(
    // @ts-expect-error - Testing error case without arguments
    () => new LlmProvider(),
    { message: /API key is required/ },
    'Should throw when apiKey is missing',
  );
});

test('LlmProvider constructor accepts configuration', t => {
  const provider = new LlmProvider({
    apiKey: 'test-key',
    model: 'custom-model',
    maxRetries: 5,
  });

  t.is(provider.model, 'custom-model', 'Model should be set');
  t.truthy(provider.client, 'Client should be initialized');
});

test('LlmProvider uses default model', t => {
  const provider = new LlmProvider({ apiKey: 'test-key' });
  t.is(provider.model, 'gpt-5.1-codex-mini', 'Should use default model');
});

test('Agent constructor requires llmProvider', t => {
  t.throws(
    // @ts-expect-error - Testing error case without arguments
    () => new Agent(),
    { message: /llmProvider is required/ },
    'Should throw when llmProvider is missing',
  );
});

test('Agent constructor accepts tools', t => {
  const mockProvider = new MockLlmProvider();
  const tools = { myTool: () => 'test' };
  // @ts-expect-error - Using MockLlmProvider for testing
  const agent = new Agent({ llmProvider: mockProvider, tools });

  t.is(agent.tools, tools, 'Tools should be stored');
  // @ts-expect-error - Comparing MockLlmProvider instance
  t.is(agent.llmProvider, mockProvider, 'Provider should be stored');
});

test('Agent can execute simple code with resultResolver.resolve', async t => {
  const mockProvider = new MockLlmProvider({
    responseCode: 'resultResolver.resolve(42);',
  });
  // @ts-expect-error - Using MockLlmProvider for testing
  const agent = new Agent({ llmProvider: mockProvider });

  const result = await agent.query('Return 42');

  t.true(result.success, 'Query should succeed');
  t.is(result.result, 42, 'Result should be 42');
  t.assert(result.logs && result.logs.length, 'Should have logs');
  t.truthy(result.code, 'Should include generated code');
});

test('Agent can execute code with resultResolver.reject', async t => {
  const mockProvider = new MockLlmProvider({
    responseCode: 'resultResolver.reject("Something went wrong");',
  });
  // @ts-expect-error - Using MockLlmProvider for testing
  const agent = new Agent({ llmProvider: mockProvider });

  const result = await agent.query('Fail with error');

  t.false(result.success, 'Query should fail');
  t.truthy(result.error, 'Should have error message');
  t.assert(result.errors && result.errors.length, 'Should have errors array');
});

test('Agent can execute code with calculations', async t => {
  const mockProvider = new MockLlmProvider({
    responseCode: `
      const sum = 10 + 20 + 12;
      resultResolver.resolve(sum);
    `,
  });
  // @ts-expect-error - Using MockLlmProvider for testing
  const agent = new Agent({ llmProvider: mockProvider });

  const result = await agent.query('Calculate 10 + 20 + 12');

  t.true(result.success, 'Query should succeed');
  t.is(result.result, 42, 'Result should be 42');
});

test('Agent captures console.log output', async t => {
  const mockProvider = new MockLlmProvider({
    responseCode: `
      console.log("Hello", "World");
      console.log("Processing...");
      resultResolver.resolve("done");
    `,
  });
  // @ts-expect-error - Using MockLlmProvider for testing
  const agent = new Agent({ llmProvider: mockProvider });

  const result = await agent.query('Log and resolve');

  t.true(result.success, 'Query should succeed');
  t.is(result.result, 'done', 'Result should be "done"');
  t.true(
    result.logs.some(log => log.includes('Hello World')),
    'Should capture console.log',
  );
  t.true(
    result.logs.some(log => log.includes('Processing...')),
    'Should capture multiple logs',
  );
});

test('Agent captures console.error output', async t => {
  const mockProvider = new MockLlmProvider({
    responseCode: `
      console.error("Error message");
      resultResolver.resolve("ok");
    `,
  });
  // @ts-expect-error - Using MockLlmProvider for testing
  const agent = new Agent({ llmProvider: mockProvider });

  const result = await agent.query('Log error and resolve');

  t.true(result.success, 'Query should succeed');
  t.true(
    result.errors.some(err => err.includes('Error message')),
    'Should capture console.error',
  );
});

test('Agent handles evaluation errors', async t => {
  const mockProvider = new MockLlmProvider({
    responseCode: 'throw new Error("Evaluation failed");',
  });
  // @ts-expect-error - Using MockLlmProvider for testing
  const agent = new Agent({ llmProvider: mockProvider });

  const result = await agent.query('Throw an error');

  t.false(result.success, 'Query should fail');
  t.truthy(result.error, 'Should have error message');
  t.true(
    result.errors.some(err => err.includes('Evaluation failed')),
    'Should capture evaluation error',
  );
});

test('Agent handles syntax errors in generated code', async t => {
  const mockProvider = new MockLlmProvider({
    responseCode: 'this is invalid javascript syntax {{{',
  });
  // @ts-expect-error - Using MockLlmProvider for testing
  const agent = new Agent({ llmProvider: mockProvider });

  const result = await agent.query('Generate invalid code');

  t.false(result.success, 'Query should fail');
  t.truthy(result.error, 'Should have error message');
});

test('Agent exposes custom tools to compartment', async t => {
  const mockProvider = new MockLlmProvider({
    responseCode: `
      const value = customTool();
      resultResolver.resolve(value);
    `,
  });
  const tools = {
    customTool: () => 'tool result',
  };
  // @ts-expect-error - Using MockLlmProvider for testing
  const agent = new Agent({ llmProvider: mockProvider, tools });

  const result = await agent.query('Use custom tool');

  t.true(result.success, 'Query should succeed');
  t.is(result.result, 'tool result', 'Should use custom tool result');
});

test('Agent exposes multiple custom tools to compartment', async t => {
  const mockProvider = new MockLlmProvider({
    responseCode: `
      const a = add(10, 20);
      const b = multiply(a, 2);
      resultResolver.resolve(b);
    `,
  });
  const tools = {
    add: (x, y) => x + y,
    multiply: (x, y) => x * y,
  };
  // @ts-expect-error - Using MockLlmProvider for testing
  const agent = new Agent({ llmProvider: mockProvider, tools });

  const result = await agent.query('Use math tools');

  t.true(result.success, 'Query should succeed');
  t.is(result.result, 60, 'Should use multiple tools correctly');
});

test('Agent isolates code execution in compartment', async t => {
  const mockProvider = new MockLlmProvider({
    responseCode: `
      // Should not have access to process or other global objects
      const hasProcess = typeof process !== 'undefined';
      resultResolver.resolve({ hasProcess });
    `,
  });
  // @ts-expect-error - Using MockLlmProvider for testing
  const agent = new Agent({ llmProvider: mockProvider });

  const result = await agent.query('Check isolation');

  t.true(result.success, 'Query should succeed');
  t.false(
    result.result.hasProcess,
    'Should not have access to process in compartment',
  );
});

test('Agent handles async code with resultResolver', async t => {
  const mockProvider = new MockLlmProvider({
    responseCode: `
      // Simulate async operation
      setTimeout(() => {
        resultResolver.resolve("async result");
      }, 10);
    `,
  });
  const tools = {
    setTimeout: (fn, delay) => {
      // Provide setTimeout tool for async testing
      // eslint-disable-next-line no-undef
      return globalThis.setTimeout(fn, delay);
    },
  };
  // @ts-expect-error - Using MockLlmProvider for testing
  const agent = new Agent({ llmProvider: mockProvider, tools });

  const result = await agent.query('Execute async code');

  t.true(result.success, 'Query should succeed');
  t.is(result.result, 'async result', 'Should handle async resolution');
});

test('Agent handles errors in custom tools', async t => {
  const mockProvider = new MockLlmProvider({
    responseCode: `
      try {
        failingTool();
      } catch (error) {
        resultResolver.reject(error.message);
      }
    `,
  });
  const tools = {
    failingTool: () => {
      throw new Error('Tool failed');
    },
  };
  // @ts-expect-error - Using MockLlmProvider for testing
  const agent = new Agent({ llmProvider: mockProvider, tools });

  const result = await agent.query('Use failing tool');

  t.false(result.success, 'Query should fail');
  t.truthy(result.error, 'Should have error message');
});

test('Agent handles code wrapped in markdown code blocks', async t => {
  const mockProvider = new MockLlmProvider({
    responseCode: '```javascript\nresultResolver.resolve(42);\n```',
  });
  // @ts-expect-error - Using MockLlmProvider for testing
  const agent = new Agent({ llmProvider: mockProvider });

  const result = await agent.query('Return 42 in markdown');

  t.true(result.success, 'Query should succeed');
  t.is(result.result, 42, 'Result should be 42');
});

test('Agent handles code wrapped in markdown with js language', async t => {
  const mockProvider = new MockLlmProvider({
    responseCode: '```js\nconst x = 100;\nresultResolver.resolve(x);\n```',
  });
  // @ts-expect-error - Using MockLlmProvider for testing
  const agent = new Agent({ llmProvider: mockProvider });

  const result = await agent.query('Return value in js markdown');

  t.true(result.success, 'Query should succeed');
  t.is(result.result, 100, 'Result should be 100');
});

test('Agent handles code wrapped in plain markdown fences', async t => {
  const mockProvider = new MockLlmProvider({
    responseCode: '```\nresultResolver.resolve("no language");\n```',
  });
  // @ts-expect-error - Using MockLlmProvider for testing
  const agent = new Agent({ llmProvider: mockProvider });

  const result = await agent.query('Return value in plain markdown');

  t.true(result.success, 'Query should succeed');
  t.is(result.result, 'no language', 'Result should be extracted correctly');
});
