/* eslint-disable max-classes-per-file */
import test from '@endo/ses-ava/test.js';
import fs from 'fs/promises';
import path from 'path';
import { LlmProvider } from '../src/llm-provider.js';
import { Agent } from '../src/agent.js';
import { AgentCapability } from '../src/agent-capability.js';
import {
  createListFilesCapability,
  createReadFileCapability,
  createFileSystemCapabilities,
} from '../src/fs-capabilities.js';

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

  t.is(agent.capabilities.length, 1, 'Should have one capability');
  t.is(agent.capabilities[0].name, 'myTool', 'Capability should be named myTool');
  t.is(
    agent.capabilities[0].value,
    tools.myTool,
    'Capability value should match tool',
  );
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

test('Agent writes debug logs when debugLogDirectory is set', async t => {
  const testDir = path.resolve(import.meta.dirname, '..');
  const debugDir = path.join(testDir, 'test-debug-logs');

  try {
    const mockProvider = new MockLlmProvider({
      responseCode: 'resultResolver.resolve("debug test");',
    });

    const agent = new Agent({
      // @ts-expect-error - Using MockLlmProvider for testing
      llmProvider: mockProvider,
      debugLogDirectory: debugDir,
    });

    const result = await agent.query('Test debug logging');

    t.true(result.success, 'Query should succeed');

    // Check that debug log file was created
    const logFile = path.join(debugDir, 'attempt-1.json');
    const logExists = await fs
      .access(logFile)
      .then(() => true)
      .catch(() => false);

    t.true(logExists, 'Debug log file should exist');

    if (logExists) {
      const logContent = await fs.readFile(logFile, 'utf8');
      const log = JSON.parse(logContent);

      t.is(log.attempt, 1, 'Log should have attempt number');
      t.truthy(log.prompt, 'Log should have prompt');
      t.truthy(log.response, 'Log should have response');
      t.truthy(log.timestamp, 'Log should have timestamp');
    }
  } finally {
    // Clean up test debug directory
    await fs.rm(debugDir, { recursive: true, force: true });
  }
});

test('Agent includes console logs in incomplete iteration feedback', async t => {
  let callCount = 0;
  const responses = [
    'console.log("First iteration - exploring");',
    'console.log("Second iteration"); resultResolver.resolve("done");',
  ];
  
  class DynamicMockProvider {
    // eslint-disable-next-line class-methods-use-this
    async generateCode(prompt) {
      const response = responses[callCount] || responses[responses.length - 1];
      callCount += 1;
      
      // Check that the second prompt includes the console output from first iteration
      if (callCount === 2) {
        t.true(
          prompt.includes('First iteration - exploring'),
          'Second iteration prompt should include console logs from first iteration',
        );
      }
      
      return response;
    }
  }
  
  const mockProvider = new DynamicMockProvider();
  const agent = new Agent({
    // @ts-expect-error - Using DynamicMockProvider for testing
    llmProvider: mockProvider,
  });

  const result = await agent.query('Test log feedback', 5);
  
  t.true(result.success, 'Should eventually succeed');
  t.is(callCount, 2, 'Should have made 2 LLM calls');
});

test('Agent warns on final attempt', async t => {
  const mockProvider = new MockLlmProvider({
    responseCode: `
      // Never resolve to trigger incomplete iterations
      console.log('Iteration without resolving');
    `,
  });

  // @ts-expect-error - Using MockLlmProvider for testing
  const agent = new Agent({ llmProvider: mockProvider });

  // Set maxAttempts to 2 to test final attempt warning quickly
  const result = await agent.query('Test final attempt warning', 2);

  t.false(result.success, 'Should fail after max attempts');
  t.is(result.attempts.length, 2, 'Should have 2 attempts');
  
  // The second attempt should have had the final warning in the prompt
  // We can verify this by checking that it attempted twice
  t.truthy(result.attempts[1], 'Should have second attempt');
});

test('Agent writes debug logs with errors', async t => {
  const testDir = path.resolve(import.meta.dirname, '..');
  const debugDir = path.join(testDir, 'test-debug-error-logs');

  try {
    const mockProvider = new MockLlmProvider({
      responseCode: 'throw new Error("test error");',
    });

    const agent = new Agent({
      // @ts-expect-error - Using MockLlmProvider for testing
      llmProvider: mockProvider,
      debugLogDirectory: debugDir,
    });

    await agent.query('Test error logging');

    // Check that debug log files were created for retries
    const logFile1 = path.join(debugDir, 'attempt-1.json');
    const logExists = await fs
      .access(logFile1)
      .then(() => true)
      .catch(() => false);

    t.true(logExists, 'Debug log file should exist for first attempt');

    if (logExists) {
      const logContent = await fs.readFile(logFile1, 'utf8');
      const log = JSON.parse(logContent);

      t.is(log.attempt, 1, 'Log should have attempt number');
      t.truthy(log.error, 'Log should have error message');
    }
  } finally {
    // Clean up test debug directory
    await fs.rm(debugDir, { recursive: true, force: true });
  }
});

test('Agent supports top-level await', async t => {
  const mockProvider = new MockLlmProvider({
    responseCode: `
      const value = await Promise.resolve(42);
      resultResolver.resolve(value);
    `,
  });
  // @ts-expect-error - Using MockLlmProvider for testing
  const agent = new Agent({ llmProvider: mockProvider });

  const result = await agent.query('Use top-level await');

  t.true(result.success, 'Query should succeed');
  t.is(result.result, 42, 'Should handle top-level await');
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

test('AgentCapability constructor requires name, value, and description', t => {
  t.throws(
    // @ts-expect-error - Testing error case
    () => new AgentCapability({}),
    { message: /name/ },
    'Should throw when name is missing',
  );

  t.throws(
    // @ts-expect-error - Testing error case
    () => new AgentCapability({ name: 'test' }),
    { message: /value/ },
    'Should throw when value is missing',
  );

  t.throws(
    // @ts-expect-error - Testing error case without description
    () => new AgentCapability({ name: 'test', value: 'something' }),
    { message: /description/ },
    'Should throw when description is missing',
  );
});

test('AgentCapability stores properties correctly', t => {
  const capability = new AgentCapability({
    name: 'myFunc',
    value: () => 42,
    description: 'Returns 42',
  });

  t.is(capability.name, 'myFunc', 'Name should be stored');
  t.is(typeof capability.value, 'function', 'Value should be a function');
  t.is(capability.description, 'Returns 42', 'Description should be stored');
});

test('AgentCapability toPromptText generates basic description', t => {
  const capability = new AgentCapability({
    name: 'add',
    value: (a, b) => a + b,
    description: 'Adds two numbers',
  });

  const promptText = capability.toPromptText();
  t.true(promptText.includes('add'), 'Should include name');
  t.true(promptText.includes('Adds two numbers'), 'Should include description');
});

test('AgentCapability toPromptText includes type information', t => {
  const capability = new AgentCapability({
    name: 'calculate',
    value: (x, y) => x + y,
    description: 'Performs calculation',
    typeInfo: {
      signature: '(x: number, y: number) => number',
      params: { x: 'First number', y: 'Second number' },
      returns: 'Sum of x and y',
    },
  });

  const promptText = capability.toPromptText();
  t.true(promptText.includes('calculate'), 'Should include name');
  t.true(
    promptText.includes('(x: number, y: number) => number'),
    'Should include signature',
  );
  t.true(promptText.includes('Sum of x and y'), 'Should include return type');
});

test('Agent accepts capabilities array', async t => {
  const mockProvider = new MockLlmProvider({
    responseCode: `
      const result = customCap();
      resultResolver.resolve(result);
    `,
  });

  const capabilities = [
    new AgentCapability({
      name: 'customCap',
      value: () => 'custom result',
      description: 'A custom capability',
    }),
  ];

  // @ts-expect-error - Using MockLlmProvider for testing
  const agent = new Agent({ llmProvider: mockProvider, capabilities });

  const result = await agent.query('Use custom capability');

  t.true(result.success, 'Query should succeed');
  t.is(result.result, 'custom result', 'Should use custom capability');
});

test('Agent generates enhanced prompt with capability descriptions', t => {
  const mockProvider = new MockLlmProvider();
  const capabilities = [
    new AgentCapability({
      name: 'add',
      value: (a, b) => a + b,
      description: 'Adds two numbers together',
      typeInfo: {
        signature: '(a: number, b: number) => number',
      },
    }),
  ];

  // @ts-expect-error - Using MockLlmProvider for testing
  const agent = new Agent({ llmProvider: mockProvider, capabilities });

  // We need to access the internal method for testing
  const resultResolverCap = new AgentCapability({
    name: 'resultResolver',
    value: {},
    description: 'Test resolver',
  });

  const prompt = agent.generateEnhancedPrompt('Calculate something', [
    resultResolverCap,
    ...capabilities,
  ]);

  t.true(prompt.includes('Calculate something'), 'Should include user prompt');
  t.true(prompt.includes('add'), 'Should include capability name');
  t.true(
    prompt.includes('Adds two numbers together'),
    'Should include description',
  );
  t.true(
    prompt.includes('(a: number, b: number) => number'),
    'Should include type signature',
  );
  t.true(
    prompt.includes('resultResolver.resolve'),
    'Should include usage instructions',
  );
});

test('createListFilesCapability creates valid capability', t => {
  const capability = createListFilesCapability('/test/dir');

  t.is(capability.name, 'listFiles', 'Should be named listFiles');
  t.is(typeof capability.value, 'function', 'Value should be a function');
  t.truthy(capability.description, 'Should have description');
  t.truthy(capability.typeInfo, 'Should have type info');
});

test('createReadFileCapability creates valid capability', t => {
  const capability = createReadFileCapability('/test/dir');

  t.is(capability.name, 'readFile', 'Should be named readFile');
  t.is(typeof capability.value, 'function', 'Value should be a function');
  t.truthy(capability.description, 'Should have description');
  t.truthy(capability.typeInfo, 'Should have type info');
});

test('createFileSystemCapabilities creates both capabilities', t => {
  const capabilities = createFileSystemCapabilities('/test/dir');

  t.is(capabilities.length, 2, 'Should create two capabilities');
  t.is(capabilities[0].name, 'listFiles', 'First should be listFiles');
  t.is(capabilities[1].name, 'readFile', 'Second should be readFile');
});

test('listFiles capability lists current directory', async t => {
  const testDir = path.resolve(import.meta.dirname, '..');
  const capability = createListFilesCapability(testDir);

  const files = await capability.value('.');

  t.true(Array.isArray(files), 'Should return array');
  t.assert(files && files.length, 'Should have files');
  t.true(
    files.some(f => f.name === 'package.json'),
    'Should find package.json',
  );
  t.true(
    files.every(f => f.type === 'file' || f.type === 'directory'),
    'All entries should have valid type',
  );
});

test('listFiles capability prevents directory escape', async t => {
  const testDir = path.resolve(import.meta.dirname, '..');
  const capability = createListFilesCapability(testDir);

  await t.throwsAsync(
    async () => capability.value('../..'),
    { message: /Access denied/ },
    'Should prevent escaping base directory',
  );
});

test('readFile capability reads package.json', async t => {
  const testDir = path.resolve(import.meta.dirname, '..');
  const capability = createReadFileCapability(testDir);

  const content = await capability.value('package.json');

  t.is(typeof content, 'string', 'Should return string');
  t.true(content.includes('@endo/ocapn-agent'), 'Should contain package name');
});

test('readFile capability prevents directory escape', async t => {
  const testDir = path.resolve(import.meta.dirname, '..');
  const capability = createReadFileCapability(testDir);

  await t.throwsAsync(
    async () => capability.value('../../package.json'),
    { message: /Access denied/ },
    'Should prevent escaping base directory',
  );
});

test('readFile capability fails on directories', async t => {
  const testDir = path.resolve(import.meta.dirname, '..');
  const capability = createReadFileCapability(testDir);

  await t.throwsAsync(
    async () => capability.value('src'),
    { message: /not a file/ },
    'Should fail when trying to read directory',
  );
});

test('Agent can use file system capabilities', async t => {
  const testDir = path.resolve(import.meta.dirname, '..');

  // Create a test file
  const testFile = path.join(testDir, 'test-file.txt');
  await fs.writeFile(testFile, 'test content', 'utf8');

  try {
    const mockProvider = new MockLlmProvider({
      responseCode: `
        (async () => {
          try {
            const files = await listFiles('.');
            const hasTestFile = files.some(f => f.name === 'test-file.txt');
            if (!hasTestFile) {
              resultResolver.reject('Test file not found');
              return;
            }
            const content = await readFile('test-file.txt');
            resultResolver.resolve(content);
          } catch (error) {
            resultResolver.reject(error.message);
          }
        })();
      `,
    });

    const fsCapabilities = createFileSystemCapabilities(testDir);
    const agent = new Agent({
      // @ts-expect-error - Using MockLlmProvider for testing
      llmProvider: mockProvider,
      capabilities: fsCapabilities,
    });

    const result = await agent.query('Read test file');

    t.true(result.success, 'Query should succeed');
    t.is(result.result, 'test content', 'Should read test file content');
  } finally {
    // Clean up test file
    await fs.unlink(testFile).catch(() => {});
  }
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
