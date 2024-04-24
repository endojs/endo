// @ts-check

/** @import { DeferredTasks, DeferredTask } from './types.js' */

/**
 * @template {Record<string, string | string[]>} T
 * @returns {DeferredTasks<T>}
 */
export const makeDeferredTasks = () => {
  /** @type {DeferredTask<T>[]} */
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
