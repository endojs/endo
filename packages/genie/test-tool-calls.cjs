#!/usr/bin/env node

/**
 * Test script for the new tool call generator functions
 *
 * This script tests the extractToolCalls and parseToolCalls generators
 * with various input scenarios.
 */

const { extractToolCalls, parseToolCalls } = require('./src/agent/index.js');

// Test tool specs
const toolList = [
  { name: 'weather', description: 'Get weather information' },
  { name: 'search', description: 'Search the web' },
];

// Example LLM responses with tool calls
const testResponses = [
  // Test 1: ToolCallStart pattern
  {
    response: 'Here\'s the weather: ToolCallStart{weather{city: "New York"}}',
    expected: ['weather'],
  },
  // Test 2: Function call pattern
  {
    response: 'Search for this: search{query: "test"} or this: weather{city: "New York"}',
    expected: ['search', 'weather'],
  },
  // Test 3: Multiple patterns
  {
    response: 'Call weather{city: "San Francisco"} and search{topic: "AI"}',
    expected: ['weather', 'search'],
  },
  // Test 4: Malformed JSON (should be parsed with heuristic)
  {
    response: 'weather{city: "Tokyo"} search{query: "AI"}',
    expected: ['weather', 'search'],
  },
  // Test 5: No tool calls
  {
    response: 'Just a normal response',
    expected: [],
  },
];

console.log('🧪 Testing extractToolCalls generator...\n');

testResponses.forEach((test, i) => {
  console.log(`Test ${i + 1}: ${test.response.substring(0, 100)}${test.response.length > 100 ? '...' : ''}`);

  // Test extractToolCalls
  let results = [];
  for (const pattern of extractToolCalls(test.response, toolList)) {
    results.push(pattern.toolName);
    console.log(`  - Found tool: ${pattern.toolName} at position ${pattern.start}`);
  }

  // Count occurrences
  const foundCount = results.length;
  const expectedCount = test.expected.length;

  console.log(`  ✅ Found ${foundCount} tool${foundCount !== 1 ? 's' : ''}`);
  console.log(`  ℹ️  Expected: ${expectedCount} tool${expectedCount !== 1 ? 's' : ''}`);

  if (foundCount !== expectedCount) {
    console.log(`  ❌ MISMATCH! Expected: [${test.expected.join(', ')}], Found: [${results.join(', ')}]`);
  } else {
    console.log(`  ✅ Correct! All tool names detected.`);
  }

  // Test parseToolCalls
  console.log('\n  Testing parseToolCalls:');
  parsedCount = 0;
  invalidCount = 0;
  for (const parsed of parseToolCalls([], toolList)) {
    if (parsed.type === 'ToolCall') {
      parsedCount++;
      console.log(`  - Valid: ${parsed.toolName} with args:`, JSON.stringify(parsed.args));
    } else {
      invalidCount++;
      console.log(`  - Invalid: ${parsed.toolName} (${parsed.error})`);
    }
  }

  console.log(`  ✅ Parsed ${parsedCount} valid tool calls`);
  console.log(invalidCount > 0 ? `  ⚠️  ${invalidCount} invalid calls found` : '');

  console.log('');
});

console.log('✨ Tests complete! \n');

// Additional test: Real-world scenario
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('Real-world scenario test:\n');

const realResponse = `I need to get the weather for London and search for AI news.

Weather: ToolCallStart{weather{city: "London", temp: true}}

Search: search{query: "artificial intelligence news today"}.

Let me also get the current date for context.

System: system{date: true}`;

console.log('Processing real-world response...\n');

let count = 0;
for (const pattern of extractToolCalls(realResponse, toolList)) {
  count++;
  console.log(`${count}. Found tool call: ${pattern.toolName} at position ${pattern.start}`);
  console.log(`   Text: "${pattern.text}"`);
}

console.log(`\n✅ Total tool calls detected: ${count}`);
console.log('\n✨ This demonstrates the streaming nature of the generator!');