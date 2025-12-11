#!/usr/bin/env node
/* eslint-disable no-undef */

import 'dotenv/config';
import { LlmProvider } from '../src/llm-provider.js';
import { Agent } from '../src/agent.js';

const main = async () => {
  // Get prompt from command line arguments
  const args = process.argv.slice(2);
  const argsLength = args.length;

  if (argsLength === 0) {
    console.error('Usage: ocapn-agent <prompt>');
    console.error('');
    console.error('Example:');
    console.error('  ocapn-agent "Calculate the sum of 1 through 10"');
    console.error('');
    console.error('Configuration:');
    console.error('  Set OPENAI_API_KEY in .env file');
    process.exit(1);
  }

  const prompt = args.join(' ');

  // Get API key from environment
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    console.error('Error: OPENAI_API_KEY not found in environment');
    console.error('Please create a .env file with your OpenAI API key:');
    console.error('');
    console.error('  OPENAI_API_KEY=your_api_key_here');
    console.error('');
    process.exit(1);
  }

  console.log('Initializing agent...');

  // Create LLM provider
  const llmProvider = new LlmProvider({
    apiKey,
    model: process.env.OPENAI_MODEL || 'gpt-5.1-codex-mini',
  });

  // Create agent
  const agent = new Agent({ llmProvider });

  console.log(`Prompt: ${prompt}`);
  console.log('Generating and executing code...\n');

  // Execute query
  const result = await agent.query(prompt);

  try {
    // Display results
    if (result.success) {
      console.log('✓ Success!');
      console.log('\nResult:', result.result);

      if (result.logs && result.logs.length) {
        console.log('\nLogs:');
        for (const log of result.logs) {
          console.log(`  ${log}`);
        }
      }

      if (result.code) {
        console.log('\nGenerated code:');
        console.log('---');
        console.log(result.code);
        console.log('---');
      }
    } else {
      console.error('✗ Failed');
      console.error('\nError:', result.error);

      if (result.errors && result.errors.length) {
        console.error('\nErrors:');
        for (const error of result.errors) {
          console.error(`  ${error}`);
        }
      }

      process.exit(1);
    }
  } catch (error) {
    console.error('Fatal error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
};

main();
