// @ts-check

/**
 * @file Custom grouped help formatter for Commander v5.
 *
 * Groups commands by topic section in the help screen
 * without requiring nested sub-commands.
 */

/**
 * @typedef {object} CommandGroup
 * @property {string} title
 * @property {string[]} commands - command names belonging to this group
 */

/**
 * Format a single command entry with its alias and description,
 * padded to align with other entries.
 *
 * Includes only the first line of description.
 *
 * @param {import('commander').Command} cmd
 * @param {number} padWidth
 * @returns {string}
 */
const formatCommandEntry = (cmd, padWidth) => {
  const alias = cmd.alias();
  const label = alias ? `${cmd.name()}|${alias}` : cmd.name();
  const desc = (cmd.description() || '').split('\n')[0];
  return `  ${label.padEnd(padWidth)}  ${desc}`;
};

/**
 * Install a grouped help formatter on the given Commander program.
 *
 * Overrides `helpInformation()` so that `--help` and the implicit
 * help command render commands organised by topic section.
 *
 * @param {import('commander').Command} program
 * @param {CommandGroup[]} commandGroups
 */
const installGroupedHelp = (program, ...commandGroups) => {
  /** @type {() => string} */
  const original = program.helpInformation.bind(program);

  program.helpInformation = () => {
    // Determine the padding width across ALL commands.
    let maxWidth = 0;
    for (const cmd of program.commands) {
      const alias = cmd.alias();
      const label = alias ? `${cmd.name()}|${alias}` : cmd.name();
      if (label.length > maxWidth) {
        maxWidth = label.length;
      }
    }

    // Get the original help to extract the Usage and Options blocks.
    const orig = original();

    // Extract everything before "Commands:" and after the commands list.
    const commandsIdx = orig.indexOf('Commands:');
    if (commandsIdx === -1) {
      // No commands section found; fall back to original, no grouping.
      return orig;
    }
    const preamble = orig.slice(0, commandsIdx);

    /** @type {string[]} */
    const sections = [preamble.trimEnd()];

    // Track seen commands as we group them, so that we can later catch any ungrouped commands
    const seen = new Set();

    // Build a lookup map of commands by name for use in each section.
    /** @type {Map<string, import('commander').Command>} */
    const cmdMap = new Map();
    for (const cmd of program.commands) {
      cmdMap.set(cmd.name(), cmd);
    }

    // Now collect each given section
    for (const group of commandGroups) {
      /** @type {string[]} */
      const lines = [`${group.title} Commands:`];
      for (const name of group.commands) {
        const cmd = cmdMap.get(name);
        if (cmd) {
          lines.push(formatCommandEntry(cmd, maxWidth));
          seen.add(name);
        }
      }
      if (lines.length > 1) {
        sections.push(lines.join('\n'));
      }
    }

    // Collect any commands that weren't assigned to a group
    // (e.g. the built-in "help" command).
    /** @type {string[]} */
    const ungrouped = [`Other Commands:`];
    for (const cmd of program.commands) {
      if (!seen.has(cmd.name())) {
        ungrouped.push(formatCommandEntry(cmd, maxWidth));
      }
    }
    if (ungrouped.length > 1) {
      sections.push(ungrouped.join('\n'));
    }

    // Final trailing terminator
    sections.push('');

    return sections.join('\n\n');
  };
};

export default harden(installGroupedHelp);
