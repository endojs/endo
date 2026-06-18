import { teardown as testUtilTeardown } from 'preact/test-utils';

/**
 * Minimal port of preact's test harness helpers, trimmed to the two
 * functions the secure / compartment browser tests use.
 */

/**
 * Create a fresh scratch container attached to the document body.
 *
 * @param {string} [id]
 * @returns {HTMLDivElement}
 */
export function setupScratch(id) {
  const scratch = document.createElement('div');
  scratch.id = id || 'scratch';
  (document.body || document.documentElement).appendChild(scratch);
  return scratch;
}

/**
 * Remove the scratch container and flush preact's pending render queue.
 *
 * @param {HTMLElement} scratch
 */
export function teardown(scratch) {
  if (scratch && scratch.parentNode) {
    scratch.parentNode.removeChild(scratch);
  }
  testUtilTeardown();
}
