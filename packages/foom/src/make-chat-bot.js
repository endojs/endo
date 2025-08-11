import { E } from '@endo/eventual-send';
import { readFileSync } from 'fs';

const __dirname = new URL('.', import.meta.url).pathname;

export const makeChatBotMaker = workerFacet => {
  const source = readFileSync(__dirname + 'chat-bot.js', 'utf8');

  // kickoff the async incubation process
  // TODO: errors are not handled here
  const makeChatBotRemoteFnP = E(workerFacet).incubate(`${source}`);
  // const makeChatBot = (...args) => E(makeChatBotRemoteFnP)(...args);
  // return makeChatBot;
  return makeChatBotRemoteFnP;
};
