/**
 * @returns {import('./types.js').AsyncHooks<any>}
 */
export const makeAsyncHooks = () => {
  /** @type {import('./types.js').AsyncHook<any>[]} */
  const hooks = [];

  return {
    add: hook => {
      hooks.push(hook);
    },
    execute: async identifiers => {
      await Promise.all(hooks.map(hook => hook(identifiers)));
    },
  };
};
