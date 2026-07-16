import type { CapTPOptions } from '@endo/captp';
import type {
  Config,
  EndoMount,
  EndoMountEntry,
  EndoMountFile,
  EndoMountStat,
  MountNameChange,
  ReadableBlobView,
  ReadableTreeView,
  DefineRequest,
  EndoAgent,
  EndoBootstrap,
  EndoDiagnostics,
  EndoGuest,
  EndoHost,
  EndoTraceReport,
  Form,
  LogChunk,
  Message,
  Name,
  NameOrPath,
  NamePath,
  Package,
  PetName,
  Request,
  RetentionPath,
  RetentionPathDelta,
  RetentionPathSegment,
  SpecialName,
  StampedMessage,
  ValueMessage,
} from './src/types.js';

export type {
  Config,
  EndoMount,
  EndoMountEntry,
  EndoMountFile,
  EndoMountStat,
  MountNameChange,
  ReadableBlobView,
  ReadableTreeView,
  DefineRequest,
  EndoAgent,
  EndoDiagnostics,
  EndoGuest,
  EndoHost,
  EndoTraceReport,
  Form,
  LogChunk,
  Message,
  Name,
  Package,
  PetName,
  Request,
  RetentionPath,
  RetentionPathDelta,
  RetentionPathSegment,
  SpecialName,
  NamePath,
  NameOrPath,
  StampedMessage,
  ValueMessage,
};
export function start(config?: Config): Promise<void>;
export function stop(config?: Config): Promise<void>;
export function restart(config?: Config): Promise<void>;
export function terminate(config?: Config): Promise<void>;
export function clean(config?: Config): Promise<void>;
export function purge(config?: Config): Promise<void>;
export function makeEndoClient<TBootstrap>(
  name: string,
  sockPath: string,
  cancelled: Promise<void>,
  bootstrap?: TBootstrap,
  capTpOptions?: CapTPOptions,
): Promise<{
  getBootstrap: () => Promise<EndoBootstrap>;
  closed: Promise<void>;
}>;
