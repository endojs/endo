#!/usr/bin/env node

/* global process */

import '@endo/init';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { E } from '@endo/captp';
import { makeFoom } from './index.js';

const stateFilePath = 'foom-state.json';

const getKernelVatState = () => {
  if (!existsSync(stateFilePath)) {
    return [];
  }
  const kernelVatStateBlob = readFileSync(stateFilePath, 'utf8');
  return JSON.parse(kernelVatStateBlob);
};

const writeKernelVatState = kernelVatState => {
  const kernelVatStateBlob = JSON.stringify(kernelVatState, null, 2);
  writeFileSync(stateFilePath, kernelVatStateBlob, 'utf8');
};

const runCommand = async (foomController, chatBot, command, args) => {
  if (command === 'setApiKey') {
    const [apiKey] = args;
    await E(chatBot).setApiKey(apiKey);
    const toolMakerTool = foomController.store.get('toolMakerTool');
    await E(toolMakerTool).setApiKey(apiKey);
    foomController.store.init('openAiApiKey', apiKey);
    return;
  }

  if (command === 'chat') {
    const [message] = args;
    console.log('chat:', message);
    const response = await E(chatBot).sendMessage(message);
    console.log(response);
    return;
  }

  if (command === 'history') {
    const history = await E(chatBot).getHistory();
    console.dir(history, { depth: null });
    return;
  }

  if (command === 'clear') {
    const history = await E(chatBot).clearHistory();
    console.log(history);
    return;
  }

  if (command === 'make') {
    const [name, description] = args;
    if (!name || !description) {
      throw new Error('Usage: make <name> <description>');
    }
    const rawResponse = await E(chatBot).sendMessage(`make ${description}`);
    const transformedResponse = rawResponse
      .replaceAll('```javascript\n', '')
      .replaceAll('```', '');
    console.log(transformedResponse);
    const code = `(()=>{\n${transformedResponse}\n})()`;
    const result = await foomController.registerIncubation(name, code);
    foomController.store.init(name, result);
    console.log('made:', name, result);
    return;
  }

  if (command === 'eval') {
    const [rawCode] = args;
    const { store } = foomController;
    const inv = new Proxy(
      {},
      {
        get: (_, prop) => {
          return store.get(prop);
        },
        set: (_, prop, value) => {
          if (store.has(prop)) {
            store.set(prop, value);
          } else {
            store.init(prop, value);
          }
          return true;
        },
        ownKeys: () => {
          return store.keys();
        },
      },
    );
    const code = `(async ()=>\n${rawCode}\n)()`;
    const compartment = new Compartment({ E, store, inv });
    const result = await compartment.evaluate(code);
    console.log(result);
    return;
  }

  console.error('Unknown command:', command);
};

const start = async (command, ...args) => {
  if (command === 'purge') {
    writeKernelVatState([]);
    process.exitCode = 0;
    process.exit();
  }

  const foom = await makeFoom(getKernelVatState());

  const chatBot = foom.store.get('chatBot');
  console.log('chatBot:', chatBot);

  try {
    await runCommand(foom, chatBot, command, args);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
    process.exit();
  }

  // shutdown the vat
  await foom.shutdown();

  // shutdown the kernel
  writeKernelVatState(foom.serializeState());
  process.exitCode = 0;
  process.exit();
};

const [, , ...args] = process.argv;
start(...args);
