/**
 * @returns {import('./types.js').DeferredTasks<any>}
 */
export const makeDeferredTasks = () => {
  /** @type {import('./types.js').DeferredTask<any>[]} */
  const tasks = [];

  return {
    execute: async param => {
      await Promise.all(tasks.map(task => task(param)));
    },
    push: task => {
      tasks.push(task);
    },
  };
};
