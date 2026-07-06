/**
 * Hand-written declarations for `@endo/exo-shell`.  Same shim pattern as
 * `packages/exo-git/types.d.ts`.
 */

declare module '@endo/exo-shell' {
  export type ShellPolicy = {
    allowedCommands: string[];
    timeoutMs: number;
    maxOutputBytes: number;
    env?: Record<string, string>;
    searchPath?: string;
  };

  export type ShellResult = {
    stdout: string;
    stderr: string;
    exitCode: number | null;
    signal: string | null;
    truncated: boolean;
  };

  export type EndoShell = {
    inspect: () => Promise<{
      allowedCommands: string[];
      timeoutMs: number;
      maxOutputBytes: number;
    }>;
    exec: (
      command: string,
      args: string[],
      options?: { timeoutMs?: number },
    ) => Promise<ShellResult>;
  };

  /** Build the `EndoShell` exo over a working directory, policy, and spawner. */
  export const makeShell: (powers: {
    cwd: string;
    policy: ShellPolicy;
    spawner: any;
    readOnly?: boolean;
  }) => any;

  export const ShellInterface: object;
}

declare module '@endo/exo-shell/src/shell.js' {
  export const makeShell: typeof import('@endo/exo-shell').makeShell;
}

declare module '@endo/exo-shell/src/interfaces.js' {
  export const ShellInterface: object;
}

declare module '@endo/exo-shell/src/types.js' {
  export type ShellPolicy = import('@endo/exo-shell').ShellPolicy;
  export type ShellResult = import('@endo/exo-shell').ShellResult;
  export type EndoShell = import('@endo/exo-shell').EndoShell;
}
