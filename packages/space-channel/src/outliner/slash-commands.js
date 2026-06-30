// @ts-check

import harden from '@endo/harden';

// Shared slash-command table for the outliner. Plain, serializable data —
// consumed both by the CONFINED `SlashMenu` (which renders the filtered list)
// and by the host controller (which applies the chosen command's `replyType`
// to a draft). Mirrors `SLASH_COMMANDS` (outliner-component.js:47) and the
// `REPLY_TYPE_BADGES` lookup the menu rows show, so the confined menu can carry
// badge data without the structure layer needing the badge table.

/**
 * One slash command. `command` is the typed token after `/`, `replyType` the
 * draft reply type it sets, and `label`/`description`/`badgeClassName` drive the
 * confined menu row.
 *
 * @typedef {object} SlashCommand
 * @property {string} command - Token typed after `/` (lowercase).
 * @property {string} label - Badge label shown on the menu row.
 * @property {string} replyType - Draft reply type this command applies.
 * @property {string} description - One-line description shown on the menu row.
 * @property {string} badgeClassName - CSS variant class for the row badge.
 */

/**
 * The outliner slash commands. Mirrors `SLASH_COMMANDS`
 * (outliner-component.js:51) plus the `REPLY_TYPE_BADGES` class for each.
 *
 * @type {ReadonlyArray<SlashCommand>}
 */
export const SLASH_COMMANDS = harden([
  {
    command: 'pro',
    label: 'Pro',
    replyType: 'pro',
    description: 'Supporting argument',
    badgeClassName: 'outliner-badge-pro',
  },
  {
    command: 'con',
    label: 'Con',
    replyType: 'con',
    description: 'Opposing argument',
    badgeClassName: 'outliner-badge-con',
  },
  {
    command: 'evidence',
    label: 'Evidence',
    replyType: 'evidence',
    description: 'Supporting evidence',
    badgeClassName: 'outliner-badge-evidence',
  },
]);

/**
 * Filter the slash commands by the typed query (case-insensitive prefix match).
 * Mirrors the `SLASH_COMMANDS.filter(...)` in `showSlashMenu`
 * (outliner-component.js:1600) and `handleSlashMenuKeydown` (:1670).
 *
 * @param {string} query - Text after the `/` (without the slash).
 * @returns {SlashCommand[]}
 */
export const filterSlashCommands = query => {
  const q = (query || '').toLowerCase();
  return SLASH_COMMANDS.filter(cmd => cmd.command.startsWith(q));
};
harden(filterSlashCommands);
