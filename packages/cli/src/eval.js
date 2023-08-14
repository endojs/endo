import { E } from '@endo/far';
import { provideEndoClient } from './client.js';

export const evalCommand = async ({
  cancel,
  cancelled,
  sockPath,
  source,
  names,
  resultName,
  workerName,
  partyNames,
}) => {
  const { getBootstrap } = await provideEndoClient('cli', sockPath, cancelled);
  try {
    const bootstrap = getBootstrap();
    let party = E(bootstrap).host();
    for (const partyName of partyNames) {
      party = E(party).provide(partyName);
    }

    const pairs = names.map(name => {
      /** @type {Array<string>} */
      const pair = name.split(':');
      if (pair.length === 1) {
        return [name, name];
      }
      if (pair.length > 2) {
        throw new Error(
          `Specify either a name endowmentName:pet-name, got: ${JSON.stringify(
            name,
          )}`,
        );
      }
      return pair;
    });
    const codeNames = pairs.map(pair => pair[0]);
    const endowmentNames = pairs.map(pair => pair[1]);

    const result = await E(party).evaluate(
      workerName,
      source,
      codeNames,
      endowmentNames,
      resultName,
    );
    console.log(result);
  } catch (error) {
    console.error(error);
    cancel(error);
  }
};
