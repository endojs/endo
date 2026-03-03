/**
 * System Builder
 *
 * Combines identity, soul, memory, tools, and workspace context into a complete system prompt.
 */

// TODO subsume into this module ; move
import { buildMemoryContext } from './memory-context.js';

// TODO subsume into this module ; move
import { buildWorkspaceContext } from './workspace-context.js';

// TODO subsume into this module ; move
import { buildSecuritySuffix } from './security.js';

// TODO rework this to basically be a port of `./system_prompt.rs`
// - don't actually bother to read memory, soul, or identity file content here,
//   instead just refer to them so that the agent will eventually look at those
//   files if it needs to

/**
 * Builds complete system prompt for LLM integration
 *
 * @param {Object} options - Configuration options
 * @param {string} [options.identity] - User identity/persona
 * @param {string} [options.soul] - Internal truths and core directives
 * @param {string} [options.memory] - Path to MEMORY.md
 * @param {() => string} [options.buildToolList] - Tools section builder
 * @param {string} options.heartbeatPath - Path to HEARTBEAT.md
 * @param {boolean} [options.disableSuffix] - Disable security suffix
 * @param {boolean} [options.disablePolicy] - Disable policy section
 * @param {boolean} [options.strictPolicy] - Enable strict policy
 * @param {string} [options.securityNotes] - Custom security notes
 * @returns {Promise<string>} Complete system prompt
 */
export async function systemBuilder(options = {}) {
  const {
    identity = '',
    soul = '',
    memory = './MEMORY.md',
    heartbeatPath = './HEARTBEAT.md',
    buildToolList = () => '',
    disableSuffix = false,
    disablePolicy = false,
    strictPolicy = false,
    securityNotes = '',
  } = options;

  // Build identity section
  const identitySection = identity ? `\n## Identity\n\n${identity}\n` : '';

  // Build soul section
  const soulSection = soul ? `\n## Soul\n\n${soul}\n` : '';

  // Build tools section
  let toolsSection = '';
  try {
    toolsSection = buildToolList();
  } catch (err) {
    console.warn(`Failed to build tools list: ${err.message}`);
  }

  // Build memory context
  let memoryContext = '';
  try {
    const memoryResult = await buildMemoryContext({ memoryPath: memory });
    if (memoryResult) {
      memoryContext = memoryResult;
    }
  } catch (err) {
    console.warn(`Failed to load memory context: ${err.message}`);
  }

  // Build workspace context
  const workspaceContext = buildWorkspaceContext();

  // Build security suffix
  const securitySuffix = buildSecuritySuffix({
    disableSuffix,
    disablePolicy,
    strictPolicy,
    securityNotes,
  });

  // Combine all sections
  return [
    // TODO hardcoded constitution
    // TODO fixed system facts like hostname, time, etc
    identitySection,
    '',
    soulSection,
    '',
    `## System Instructions\n\nYou are an autonomous assistant with the following capabilities:\n\n`,
    '',
    toolsSection,
    '',
    memoryContext,
    '',
    workspaceContext,
    '',
    securitySuffix,
  ].join('\n');
}
