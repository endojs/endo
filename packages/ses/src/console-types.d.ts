/* eslint-disable no-restricted-globals */

export type ExternalConsole = {
  warn: (...message: Array<any>) => void;
  error: (...message: Array<any>) => void;
  groupCollapsed: (label: string) => void;
  groupEnd: () => void;
};

export type InternalConsole = {
  warn: (...message: Array<any>) => void;
  error: (...message: Array<string>) => void;
};
