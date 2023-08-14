import { E } from '@endo/far';
import { makeRefIterator } from '@endo/daemon';
import { provideEndoClient } from './client.js';

export const followCommand = async ({
  cancel,
  cancelled,
  sockPath,
  follow,
  partyNames,
}) => {
  const { getBootstrap } = await provideEndoClient('cli', sockPath, cancelled);
  try {
    const bootstrap = getBootstrap();
    let party = E(bootstrap).host();
    for (const partyName of partyNames) {
      party = E(party).provide(partyName);
    }
    const messages = follow
      ? makeRefIterator(E(party).followMessages())
      : await E(party).listMessages();
    for await (const message of messages) {
      const { number, who, when } = message;
      if (message.type === 'request') {
        const { what } = message;
        console.log(
          `${number}. ${JSON.stringify(who)} requested ${JSON.stringify(
            what,
          )} at ${JSON.stringify(when)}`,
        );
      } else {
        console.log(
          `${number}. ${JSON.stringify(
            who,
          )} sent an unrecognizable message at ${JSON.stringify(
            when,
          )}. Consider upgrading.`,
        );
      }
    }
  } catch (error) {
    console.error(error);
    cancel(error);
  }
};
