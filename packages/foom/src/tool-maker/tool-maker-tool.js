import { E } from '@endo/eventual-send';
import { readFileSync } from 'fs';
import { toolReviewerResponseFormat } from './review-tool-format.js';

const __dirname = new URL('.', import.meta.url).pathname;

export const makeToolMakerToolMaker = async (
  vatSupervisor,
  makeChatBot,
  apiKey,
) => {
  if (!vatSupervisor.store.has('toolMakerBot')) {
    vatSupervisor.store.init('toolMakerBot', await E(makeChatBot)());
  }

  const makeToolReviewerBot = async () => {
    const toolReviewerBot = await E(makeChatBot)({
      model: 'gpt-4o-2024-08-06',
    });
    const toolReviewerPrompt = readFileSync(
      __dirname + 'review-tool-prompt.txt',
      'utf8',
    );
    await E(toolReviewerBot).setSystemPrompt(toolReviewerPrompt);
    await E(toolReviewerBot).setResponseFormat(toolReviewerResponseFormat);
    await E(toolReviewerBot).setApiKey(apiKey);
    return toolReviewerBot;
  };

  const toolMakerBot = vatSupervisor.store.get('toolMakerBot');
  // Always update the system prompt, so we can edit on disk
  const toolMakerPrompt = readFileSync(
    __dirname + 'make-tool-prompt.txt',
    'utf8',
  );
  await E(toolMakerBot).setSystemPrompt(toolMakerPrompt);

  const makeEvalTool = vatSupervisor.defineJsClass(
    class ToolMakerTool {
      setApiKey(key) {
        return E(toolMakerBot).setApiKey(key);
      }
      async activate({ request, name: toolName }) {
        const toolReviewerBot = await makeToolReviewerBot();
        let newToolSource = await E(toolMakerBot).sendMessage(request);
        // start a review cycle
        let attempts = 0;
        while (true) {
          console.log({ newToolSource, attempts });
          const reviewerResponseRaw =
            await E(toolReviewerBot).sendMessage(newToolSource);
          const reviewerResponse = JSON.parse(reviewerResponseRaw);
          console.log({ reviewerResponse });
          if (reviewerResponse.approved) {
            break;
          }
          attempts += 1;
          if (attempts > 5) {
            throw new Error(
              `Tool maker failed to appease the reviewer in ${attempts} attempts.`,
            );
          }
          newToolSource = await E(toolMakerBot).sendMessage(
            reviewerResponse.feedback,
          );
        }
        const makeTool = await vatSupervisor.registerIncubation(
          `tool-${toolName}`,
          newToolSource,
        );
        console.log({ makeTool });
        const tool = await E(makeTool)();
        console.log({ tool });
        const chatBot = vatSupervisor.store.get('chatBot');
        await E(chatBot).addTool(toolName, tool);
        const stringResult = assert.quote(tool);
        return `Added a new tool "${toolName}" ${stringResult}.`;
      }
      getConfig() {
        return harden({
          description:
            'Creates a new durable JavaScript tool to help solve problems',
          arguments: {
            request: {
              type: 'string',
              description:
                'A detailed description of the requirements of tool to be created',
            },
            name: {
              type: 'string',
              description:
                "A name for the new tool that doesn't conflict with existing tools",
            },
          },
          requiredArguments: ['request', 'name'],
          additionalProperties: false,
        });
      }
    },
  );
  return makeEvalTool;
};
