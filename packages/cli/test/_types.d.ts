import type { ExecaMethod } from 'execa';

export type Expectation = {
  stdout: RegExp | string | undefined;
  stderr?: RegExp | string | undefined;
};
export type TestCommand = (
  command: ReturnType<ExecaMethod>,
  expectation: Expectation,
) => Promise<true>;
export type TestRoutine = (
  execa: ExecaMethod,
  testCommnd: TestCommand,
) => Promise<void>;
export type Context = {
  setup: (execa: ExecaMethod) => Promise<void>;
  teardown?: (execa: ExecaMethod) => Promise<void>;
};
