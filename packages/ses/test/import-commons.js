import { StaticModuleRecord } from '@endo/static-module-record';

// q, to quote strings in error messages.
const q = JSON.stringify;

// makeStaticRetriever mocks the behavior of a real retriever, like HTTP fetch
// or a file system fetch function, using an in memory map of sources to file
// text.
export const makeStaticRetriever = sources => {
  return async moduleLocation => {
    const string = sources[moduleLocation];
    if (string === undefined) {
      throw ReferenceError(
        `Cannot retrieve module at location ${q(moduleLocation)}.`,
      );
    }
    return string;
  };
};

// makeImporter combines a locator and retriever to make an importHook suitable
// for a Compartment.
export const makeImporter = (locate, retrieve) => async moduleSpecifier => {
  const moduleLocation = locate(moduleSpecifier);
  const string = await retrieve(moduleLocation);
  return new StaticModuleRecord(string, moduleLocation);
};
