import { makeKernel } from '@endo/gems/src/kernel.js';
import { readFileSync } from 'fs';
import { E } from '@endo/captp';
import { makeEvalToolMaker } from './src/eval-tool.js';
import { makeChatBotMaker } from './src/make-chat-bot.js';
import { makeToolMakerToolMaker } from './src/tool-maker/tool-maker-tool.js';

const __dirname = new URL('.', import.meta.url).pathname;

const initFoom = async (vatSupervisor, workerFacet) => {
  // TODO: this will always make a chatBot instance, we dont actually want that
  // we do want it to define the class
  // however, we will only use the stored instance
  const makeEvalTool = makeEvalToolMaker(vatSupervisor);
  const makeChatBot = await makeChatBotMaker(workerFacet);

  let apiKey;
  if (vatSupervisor.store.has('openAiApiKey')) {
    apiKey = vatSupervisor.store.get('openAiApiKey');
  }

  const makeToolMakerTool = await makeToolMakerToolMaker(
    vatSupervisor,
    makeChatBot,
    apiKey,
  );
  let chatBot;
  if (!vatSupervisor.store.has('chatBot')) {
    chatBot = await E(makeChatBot)();
    vatSupervisor.store.init('chatBot', chatBot);
    await E(chatBot).addTool('eval', makeEvalTool());
    const toolMakerTool = makeToolMakerTool();
    await E(chatBot).addTool('toolMaker', toolMakerTool);
    vatSupervisor.store.init('toolMakerTool', toolMakerTool);
  } else {
    chatBot = vatSupervisor.store.get('chatBot');
  }
  // Always update the system prompt
  const systemPrompt = readFileSync(
    __dirname + 'src/primary-prompt.txt',
    'utf8',
  );
  await E(chatBot).setSystemPrompt(systemPrompt);
};

export const makeFoom = async kernelVatState => {
  const kernel = await makeKernel(kernelVatState);
  const { vatSupervisor, workerFacet } = kernel;

  await initFoom(vatSupervisor, workerFacet);

  return {
    // kernel exports
    store: kernel.store,
    shutdown: () => kernel.shutdown(),
    serializeState: () => kernel.serializeState(),
    // methods
    registerIncubation: async (name, code) => {
      return E(workerFacet).registerIncubation(name, code);
    },
  };
};
