// @ts-check

/**
 * Field types for command parameters.
 * @typedef {'petNamePath' | 'petNamePaths' | 'messageNumber' | 'message' | 'text' | 'edgeName' | 'locator' | 'source' | 'endowments'} FieldType
 */

/**
 * @typedef {object} CommandField
 * @property {string} name - Field name/key
 * @property {string} label - Display label
 * @property {FieldType} type - Field type for rendering
 * @property {boolean} [required] - Whether field is required
 * @property {string} [placeholder] - Placeholder text
 * @property {string} [defaultValue] - Default value
 */

/**
 * @typedef {object} CommandDefinition
 * @property {string} name - Command name (used for slash command)
 * @property {string} label - Display label
 * @property {string} description - Short description for menu
 * @property {string} category - Category for grouping
 * @property {'inline' | 'modal' | 'immediate'} mode - How command is executed
 * @property {CommandField[]} fields - Command parameters
 * @property {string} [submitLabel] - Custom submit button label
 * @property {string[]} [aliases] - Shorthand aliases for the command
 */

/**
 * Command definitions for the chat command bar.
 * @type {Record<string, CommandDefinition>}
 */
export const COMMANDS = {
  // ============ MESSAGING ============
  request: {
    name: 'request',
    label: 'Request',
    description: 'Request something from a recipient',
    category: 'messaging',
    mode: 'inline',
    fields: [
      {
        name: 'recipient',
        label: 'From',
        type: 'petNamePath',
        required: true,
        placeholder: '@recipient',
      },
      {
        name: 'description',
        label: 'Description',
        type: 'text',
        required: true,
        placeholder: 'What you need...',
      },
      {
        name: 'resultName',
        label: 'Save as',
        type: 'petNamePath',
        required: false,
        placeholder: 'result-name',
      },
    ],
    submitLabel: 'Request',
  },
  dismiss: {
    name: 'dismiss',
    label: 'Dismiss',
    description: 'Dismiss a message',
    category: 'messaging',
    mode: 'inline',
    fields: [
      {
        name: 'messageNumber',
        label: 'Message #',
        type: 'messageNumber',
        required: true,
        placeholder: '#',
      },
    ],
    submitLabel: 'Dismiss',
  },
  'dismiss-all': {
    name: 'dismiss-all',
    label: 'Dismiss All',
    description: 'Dismiss all messages',
    category: 'messaging',
    mode: 'immediate',
    fields: [],
  },
  adopt: {
    name: 'adopt',
    label: 'Adopt',
    description: 'Adopt a value from a message',
    category: 'messaging',
    mode: 'inline',
    fields: [
      {
        name: 'messageNumber',
        label: 'Message #',
        type: 'messageNumber',
        required: true,
        placeholder: '#',
      },
      {
        name: 'edgeName',
        label: 'Edge',
        type: 'edgeName',
        required: true,
        placeholder: 'edge-name',
      },
      {
        name: 'petName',
        label: 'Save as',
        type: 'petNamePath',
        required: false,
        placeholder: 'pet-name',
      },
    ],
    submitLabel: 'Adopt',
  },
  resolve: {
    name: 'resolve',
    label: 'Resolve',
    description: 'Resolve a request with a value',
    category: 'messaging',
    mode: 'inline',
    fields: [
      {
        name: 'messageNumber',
        label: 'Message #',
        type: 'messageNumber',
        required: true,
        placeholder: '#',
      },
      {
        name: 'petName',
        label: 'Value',
        type: 'petNamePath',
        required: true,
        placeholder: 'value-name',
      },
    ],
    submitLabel: 'Resolve',
  },
  reject: {
    name: 'reject',
    label: 'Reject',
    description: 'Reject a request',
    category: 'messaging',
    mode: 'inline',
    fields: [
      {
        name: 'messageNumber',
        label: 'Message #',
        type: 'messageNumber',
        required: true,
        placeholder: '#',
      },
      {
        name: 'reason',
        label: 'Reason',
        type: 'text',
        required: false,
        placeholder: 'Rejection reason',
      },
    ],
    submitLabel: 'Reject',
  },
  reply: {
    name: 'reply',
    label: 'Reply',
    description: 'Reply to a message',
    category: 'messaging',
    mode: 'inline',
    fields: [
      {
        name: 'messageNumber',
        label: 'Message #',
        type: 'messageNumber',
        required: true,
        placeholder: '#',
      },
      {
        name: 'message',
        label: 'Message',
        type: 'message',
        required: true,
        placeholder: 'Type a reply...',
      },
    ],
    submitLabel: 'Reply',
  },
  grant: {
    name: 'grant',
    label: 'Grant',
    description: 'Grant an eval-proposal',
    category: 'messaging',
    mode: 'inline',
    fields: [
      {
        name: 'messageNumber',
        label: 'Message #',
        type: 'messageNumber',
        required: true,
        placeholder: '#',
      },
    ],
    submitLabel: 'Grant',
    aliases: ['allow'],
  },

  'approve-eval': {
    name: 'approve-eval',
    label: 'Approve Eval',
    description: 'Approve a sandboxed evaluation request',
    category: 'messaging',
    mode: 'inline',
    fields: [
      {
        name: 'messageNumber',
        label: 'Message #',
        type: 'messageNumber',
        required: true,
        placeholder: '#',
      },
      {
        name: 'workerName',
        label: 'Worker',
        type: 'petNamePath',
        required: false,
        placeholder: 'worker-name',
      },
    ],
    submitLabel: 'Approve',
  },

  // ============ EXECUTION ============
  js: {
    name: 'js',
    label: 'Evaluate JavaScript',
    description: 'Evaluate JavaScript code',
    category: 'execution',
    mode: 'inline', // Inline by default, Cmd+Enter expands to modal
    fields: [
      { name: 'source', label: 'Code', type: 'source', required: true },
      {
        name: 'endowments',
        label: 'Endowments',
        type: 'endowments',
        required: false,
      },
    ],
    submitLabel: 'Evaluate',
    aliases: ['eval'],
  },

  // ============ NAMING/STORAGE ============
  list: {
    name: 'list',
    label: 'List',
    description: 'List names in inventory',
    category: 'storage',
    mode: 'inline',
    fields: [
      {
        name: 'path',
        label: 'Path',
        type: 'petNamePath',
        required: false,
        placeholder: 'directory.path',
      },
    ],
    submitLabel: 'List',
    aliases: ['ls'],
  },
  show: {
    name: 'show',
    label: 'Show',
    description: 'Show a value',
    category: 'storage',
    mode: 'inline',
    fields: [
      {
        name: 'petName',
        label: 'Name',
        type: 'petNamePath',
        required: true,
        placeholder: 'pet-name',
      },
    ],
    submitLabel: 'Show',
  },
  remove: {
    name: 'remove',
    label: 'Remove',
    description: 'Remove names from inventory',
    category: 'storage',
    mode: 'inline',
    fields: [
      {
        name: 'petNames',
        label: 'Names',
        type: 'petNamePaths',
        required: true,
        placeholder: 'name1 name2 path.to.name',
      },
    ],
    submitLabel: 'Remove',
    aliases: ['rm'],
  },
  move: {
    name: 'move',
    label: 'Move',
    description: 'Rename or move a value',
    category: 'storage',
    mode: 'inline',
    fields: [
      {
        name: 'fromName',
        label: 'From',
        type: 'petNamePath',
        required: true,
        placeholder: 'old-name',
      },
      {
        name: 'toName',
        label: 'To',
        type: 'petNamePath',
        required: true,
        placeholder: 'new-name',
      },
    ],
    submitLabel: 'Move',
    aliases: ['mv'],
  },
  copy: {
    name: 'copy',
    label: 'Copy',
    description: 'Copy a value to another name',
    category: 'storage',
    mode: 'inline',
    fields: [
      {
        name: 'fromName',
        label: 'From',
        type: 'petNamePath',
        required: true,
        placeholder: 'source-name',
      },
      {
        name: 'toName',
        label: 'To',
        type: 'petNamePath',
        required: true,
        placeholder: 'dest-name',
      },
    ],
    submitLabel: 'Copy',
    aliases: ['cp'],
  },
  mkdir: {
    name: 'mkdir',
    label: 'Make Directory',
    description: 'Create a new directory',
    category: 'storage',
    mode: 'inline',
    fields: [
      {
        name: 'petName',
        label: 'Name',
        type: 'petNamePath',
        required: true,
        placeholder: 'dir-name',
      },
    ],
    submitLabel: 'Create',
  },

  // ============ CONNECTIONS ============
  invite: {
    name: 'invite',
    label: 'Invite',
    description: 'Create an invitation for a guest',
    category: 'connections',
    mode: 'inline',
    fields: [
      {
        name: 'guestName',
        label: 'Guest name',
        type: 'petNamePath',
        required: true,
        placeholder: 'guest-name',
      },
    ],
    submitLabel: 'Invite',
  },
  accept: {
    name: 'accept',
    label: 'Accept',
    description: 'Accept an invitation',
    category: 'connections',
    mode: 'inline',
    fields: [
      {
        name: 'locator',
        label: 'Invitation',
        type: 'locator',
        required: true,
        placeholder: 'endo://...',
      },
      {
        name: 'guestName',
        label: 'Save as',
        type: 'petNamePath',
        required: true,
        placeholder: 'host-name',
      },
    ],
    submitLabel: 'Accept',
  },
  network: {
    name: 'network',
    label: 'Enable Network',
    description: 'Enable TCP network for peer connections',
    category: 'connections',
    mode: 'inline',
    fields: [
      {
        name: 'modulePath',
        label: 'Module',
        type: 'text',
        required: false,
        placeholder: 'tcp-netstring.js path (auto-detected)',
        // @ts-ignore Vite injects this at build time
        defaultValue: import.meta.env?.TCP_NETSTRING_PATH || '',
      },
      {
        name: 'hostPort',
        label: 'Listen address',
        type: 'text',
        required: false,
        defaultValue: 'localhost:0',
        placeholder: 'localhost:0',
      },
    ],
    submitLabel: 'Enable',
  },
  'network-libp2p': {
    name: 'network-libp2p',
    label: 'Enable libp2p Network',
    description: 'Enable libp2p peer-to-peer network (no open ports needed)',
    category: 'connections',
    mode: 'inline',
    fields: [
      {
        name: 'modulePath',
        label: 'Module',
        type: 'text',
        required: false,
        placeholder: 'file:// URL to libp2p.js',
        // @ts-ignore Vite injects this at build time
        defaultValue: import.meta.env?.LIBP2P_PATH || '',
      },
    ],
    submitLabel: 'Enable',
  },

  // ============ WORKERS ============
  spawn: {
    name: 'spawn',
    label: 'Spawn Worker',
    description: 'Create a new worker',
    category: 'workers',
    mode: 'inline',
    fields: [
      {
        name: 'workerName',
        label: 'Worker name',
        type: 'petNamePath',
        required: true,
        placeholder: 'worker-name',
      },
    ],
    submitLabel: 'Spawn',
  },

  // ============ HOSTS/GUESTS ============
  mkhost: {
    name: 'mkhost',
    label: 'Make Host',
    description: 'Create a new host',
    category: 'agents',
    mode: 'inline',
    fields: [
      {
        name: 'handleName',
        label: 'Handle',
        type: 'petNamePath',
        required: true,
        placeholder: 'SELF',
      },
      {
        name: 'agentName',
        label: 'Powers',
        type: 'petNamePath',
        required: true,
        placeholder: 'host-name',
      },
    ],
    submitLabel: 'Create',
    aliases: ['host'],
  },
  mkguest: {
    name: 'mkguest',
    label: 'Make Guest',
    description: 'Create a new guest',
    category: 'agents',
    mode: 'inline',
    fields: [
      {
        name: 'handleName',
        label: 'Handle',
        type: 'petNamePath',
        required: true,
        placeholder: 'HOST',
      },
      {
        name: 'agentName',
        label: 'Powers',
        type: 'petNamePath',
        required: true,
        placeholder: 'guest-name',
      },
    ],
    submitLabel: 'Create',
    aliases: ['guest'],
  },

  // ============ PROFILE ============
  enter: {
    name: 'enter',
    label: 'Enter',
    description: 'Enter a host as current profile',
    category: 'profile',
    mode: 'inline',
    fields: [
      {
        name: 'hostName',
        label: 'Host',
        type: 'petNamePath',
        required: true,
        placeholder: 'host-name',
      },
    ],
    submitLabel: 'Enter',
  },
  exit: {
    name: 'exit',
    label: 'Exit',
    description: 'Exit to parent profile',
    category: 'profile',
    mode: 'immediate',
    fields: [],
  },

  // ============ SYSTEM ============
  cancel: {
    name: 'cancel',
    label: 'Cancel',
    description: 'Cancel a value/formula',
    category: 'system',
    mode: 'inline',
    fields: [
      {
        name: 'petName',
        label: 'Name',
        type: 'petNamePath',
        required: true,
        placeholder: 'pet-name',
      },
      {
        name: 'reason',
        label: 'Reason',
        type: 'text',
        required: false,
        placeholder: 'Cancellation reason',
      },
    ],
    submitLabel: 'Cancel',
  },
  help: {
    name: 'help',
    label: 'Help',
    description: 'Show command reference',
    category: 'system',
    mode: 'immediate',
    fields: [],
  },
};

/**
 * Get all commands as an array, sorted by name.
 * @returns {CommandDefinition[]}
 */
export const getCommandList = () =>
  Object.values(COMMANDS).sort((a, b) => a.name.localeCompare(b.name));

/**
 * Filter commands by prefix (matches name or aliases).
 * @param {string} prefix - Prefix to filter by
 * @returns {CommandDefinition[]}
 */
export const filterCommands = prefix => {
  const lower = prefix.toLowerCase();
  return getCommandList().filter(cmd => {
    if (cmd.name.toLowerCase().startsWith(lower)) return true;
    if (cmd.aliases) {
      return cmd.aliases.some(alias => alias.toLowerCase().startsWith(lower));
    }
    return false;
  });
};

/**
 * Alias map for quick lookup.
 * @type {Record<string, string>}
 */
const ALIASES = Object.fromEntries(
  Object.values(COMMANDS).flatMap(cmd =>
    (cmd.aliases || []).map(alias => [alias, cmd.name]),
  ),
);

/**
 * Get a command by name or alias.
 * @param {string} name - Command name or alias
 * @returns {CommandDefinition | undefined}
 */
export const getCommand = name => COMMANDS[name] || COMMANDS[ALIASES[name]];

/**
 * Get commands by category.
 * @param {string} category - Category name
 * @returns {CommandDefinition[]}
 */
export const getCommandsByCategory = category =>
  getCommandList().filter(cmd => cmd.category === category);

/**
 * Get all categories.
 * @returns {string[]}
 */
export const getCategories = () => {
  const categories = new Set(getCommandList().map(cmd => cmd.category));
  return [...categories].sort();
};
