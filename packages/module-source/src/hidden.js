export const HIDDEN_PREFIX = '$h\u034f_';
export const HIDDEN_CONST_VAR_PREFIX = '$c\u034f_';
export const HIDDEN_A = `${HIDDEN_PREFIX}a`;
export const HIDDEN_IMPORT = `${HIDDEN_PREFIX}import`;
export const HIDDEN_IMPORT_SELF = `${HIDDEN_PREFIX}importSelf`;
export const HIDDEN_IMPORTS = `${HIDDEN_PREFIX}imports`;
export const HIDDEN_ONCE = `${HIDDEN_PREFIX}once`;
// HIDDEN_META is used to replace `import.meta`. The value fits the original
// length so it doesn’t displace the column number of following text
export const HIDDEN_META = `${HIDDEN_PREFIX}___meta`;
export const HIDDEN_LIVE = `${HIDDEN_PREFIX}live`;
export const HIDDEN_IDENTIFIERS = [
  HIDDEN_A,
  HIDDEN_IMPORT,
  HIDDEN_IMPORT_SELF,
  HIDDEN_IMPORTS,
  HIDDEN_ONCE,
  HIDDEN_META,
  HIDDEN_LIVE,
];
