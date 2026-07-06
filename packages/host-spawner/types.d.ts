/**
 * Hand-written declarations for `@endo/host-spawner`.  Same shim pattern
 * as `packages/exo-git/types.d.ts`.
 */

declare module '@endo/host-spawner' {
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

  export const makeHostSpawner: (options?: {
    searchPath?: string;
    defaultEnv?: Record<string, string | undefined>;
    killProcessGroup?: boolean;
  }) => Spawner;
}

declare module '@endo/host-spawner/src/host-spawner.js' {
  export type SpawnerOpts = import('@endo/host-spawner').SpawnerOpts;
  export type ProcessLike = import('@endo/host-spawner').ProcessLike;
  export type Spawner = import('@endo/host-spawner').Spawner;
  export const makeHostSpawner: typeof import('@endo/host-spawner').makeHostSpawner;
}
