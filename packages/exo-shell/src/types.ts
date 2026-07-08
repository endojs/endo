export type ShellPolicy = {
  allowedCommands: string[];
  timeoutMs: number;
  maxOutputBytes: number;
  env?: Record<string, string>;
  searchPath?: string;
};

export type ShellInspectResult = {
  allowedCommands: string[];
  timeoutMs: number;
  maxOutputBytes: number;
};

export type ShellResult = {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: string | null;
  truncated: boolean;
};

/**
 * The engine `makeShell` drives execution through: host or sandbox, chosen by
 * the caller.  Declared structurally here so this shipped public surface does
 * not depend on a runtime dependency on `@endo/host-spawner`; that package's
 * `Spawner` is assignable to this shape.
 */
export type Spawner = (
  argv: string[],
  opts?: { cwd?: string; env?: Record<string, string>; shell?: boolean },
) => Promise<{
  pid: number;
  stdout?: AsyncIterable<Uint8Array> | null;
  stderr?: AsyncIterable<Uint8Array> | null;
  wait: () => Promise<{ code: number | null; signal: string | null }>;
  kill: (signal?: string | number) => Promise<void>;
}>;

export type EndoShell = {
  inspect: () => Promise<ShellInspectResult>;
  exec: (
    command: string,
    args: string[],
    options?: { timeoutMs?: number },
  ) => Promise<ShellResult>;
};
