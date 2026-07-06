export type SpawnerOpts = {
  cwd?: string;
  env?: Record<string, string>;
  shell?: boolean;
};

export type ProcessLike = {
  pid: number;
  stdout?: AsyncIterable<Uint8Array> | null;
  stderr?: AsyncIterable<Uint8Array> | null;
  wait: () => Promise<{ code: number | null; signal: string | null }>;
  kill: (signal?: string | number) => Promise<void>;
};

export type Spawner = (
  argv: string[],
  opts?: SpawnerOpts,
) => Promise<ProcessLike>;

export type HostSpawnerOptions = {
  searchPath?: string;
  defaultEnv?: Record<string, string | undefined>;
  killProcessGroup?: boolean;
};
