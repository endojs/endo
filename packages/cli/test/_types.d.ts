import type { Execa } from 'execa';

export type Expectation = {
  stdout: RegExp | string | undefined;
  stderr?: RegExp | string | undefined;
};
export type TestCommand = (
  command: ReturnType<Execa>,
  expectation: Expectation,
) => Promise<true>;
export type TestRoutine = (
  execa: Execa,
  testCommnd: TestCommand,
) => Promise<void>;
export type Context = {
  setup: (execa: Execa) => Promise<void>;
  teardown?: (execa: Execa) => Promise<void>;
};
