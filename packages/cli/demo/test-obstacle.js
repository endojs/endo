import { makeExo } from '@endo/exo';
import { M } from '@endo/patterns';

const makeFormatter = (version) => {
  return makeExo(
    'Formatter',
    M.interface('Formatter', {
      format: M.call().returns(M.string()),
    }),
    {
      format(text) {
        return `[${version}] ${text}`;
      },
    }
  );
};

export const make = (powers) => {
  // Keep formatter and posts in closure variables
  let currentFormatterVersion = 'v1';
  let posts = [];

  return makeExo(
    'Blog',
    M.interface('Blog', {
      post: M.call().returns(M.promise()),
      getPosts: M.call().returns(M.promise()),
      upgradeFormatter: M.call().returns(M.promise()),
    }),
    {
      async post(content) {
        try {
          const formatter = makeFormatter(currentFormatterVersion);
          const formatted = formatter.format(content);
          posts = [...posts, formatted];
        } catch (e) {
          // Silently ignore errors for now
        }
      },

      async getPosts() {
        // Return a fresh copy
        return harden([...posts]);
      },

      async upgradeFormatter() {
        currentFormatterVersion = currentFormatterVersion === 'v1' ? 'v2' : 'v3';
      },
    }
  );
};
