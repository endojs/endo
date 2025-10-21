/**
 * Types for "universal hooks"
 *
 * @module
 */

import type {
  CanonicalName,
  FileUrlString,
  Language,
  LogFn,
  LogOptions,
  Simplify,
} from '../types.js';
import type { PackageDescriptor } from './node-modules.js';

/**
 * A synchronous hook function that accepts input parameters and optionally returns a partial update.
 *
 * @template TInput - The input parameters type
 */
export type HookFn<TInput extends object> = (
  params: TInput & { log: LogFn },
) => Partial<TInput> | void;

/**
 * A hook that accepts any input.
 *
 * Used for generic hook handling where specific types aren't known.
 */
export type AnyHook = HookFn<any>;

/**
 * Base definition for what constitutes a valid hook definition.
 *
 * Maps hook names to single hooks or arrays of hooks (pipelines).
 */
export type HookDefinition = Record<string, AnyHook | AnyHook[]>;

/**
 * Utility type to deeply make a hooks object partial.
 *
 * Converts all hook properties to optional while preserving their structure;
 * used for options bags. Pipeline support is handled transparently by the hook executor.
 *
 * @template T - The hook definition type to make partial
 */
export type HookConfiguration<T extends HookDefinition = HookDefinition> = {
  [K in keyof T]?: T[K] extends HookFn<any>
    ? T[K] | T[K][]
    : T[K] extends AnyHook[]
      ? T[K]
      : never;
};

/**
 * Generic type that converts any *Hooks type into an options bag with optional hooks property.
 *
 * Used to add hook support to configuration objects.
 *
 * @template Def - The hook definition type
 */
export type HookOption<Def extends HookDefinition = HookDefinition> = {
  /** Optional hooks configuration */
  hooks?: HookConfiguration<Def>;
};

/**
 * Helper type to extract the input type from a hook definition.
 *
 * Used for type inference in {@link HookExecutorFn | hook executors}.
 *
 * @template Def - The hook definition type
 * @template HookName - The hook name key
 */
export type HookFnInputType<
  Def extends HookDefinition,
  HookName extends keyof Def,
> =
  Def[HookName] extends HookFn<infer TInput>
    ? Simplify<TInput & Required<LogOptions>>
    : never;

/**
 * A function which some code uses to execute its hooks.
 *
 * @template Def - The hook definition type
 */
export interface HookExecutorFn<Def extends HookDefinition> {
  /**
   * Execute a single hook by name.
   *
   * @template HookName - The hook name key
   * @param name - The name of the hook to execute
   * @param input - The input parameters for the hook
   * @returns Partial update of the input, or void
   */
  <HookName extends keyof Def>(
    name: HookName,
    input: HookFnInputType<Def, HookName>,
  ): Partial<HookFnInputType<Def, HookName>> | void;
}

/**
 * Configuration for possible hooks into `mapNodeModules()`
 */
export type MapNodeModulesHooks = {
  /**
   * Executed after parsing a `PackageDescriptor`.
   */
  packageDescriptor: HookFn<{
    packageDescriptor: PackageDescriptor;
    packageLocation: FileUrlString;
    moduleSpecifier: string;
  }>;

  /**
   * Executed for each canonical name mentioned in policy but not found in the
   * compartment map
   */
  unknownCanonicalName: HookFn<{
    canonicalName: CanonicalName;
    path: string[];
    message: string;
    suggestion?: CanonicalName;
  }>;

  /**
   * Executed with all canonical names found in the compartment map.
   * Called once before translateGraph.
   */
  canonicalNames: HookFn<{
    canonicalNames: Readonly<Set<CanonicalName>>;
  }>;

  /**
   * Hook executed for each canonical name (corresponding to a package) in the
   * `CompartmentMapDescriptor` with a list of canonical names of its
   * dependencies.
   *
   * Each hook in the pipeline can return partial updates to the input.
   *
   * Suggested use cases:
   * - Adding dependencies based on policy
   * - Removing dependencies based on policy
   * - Filtering dependencies based on multiple criteria
   */
  packageDependencies: HookFn<{
    canonicalName: CanonicalName;
    dependencies: Readonly<Set<CanonicalName>>;
  }>;
};

/**
 * Hooks for `makeImportHookMaker()`; called via {@link LinkHooks}
 */
export type MakeImportHookMakerHooks = {
  /**
   * Hook executed when processing a module source.
   */
  moduleSource: HookFn<{
    moduleSource:
      | {
          location: FileUrlString;
          language: Language;
          bytes: Uint8Array;
          imports?: string[] | undefined;
          exports?: string[] | undefined;
          reexports?: string[] | undefined;
          sha512?: string | undefined;
        }
      | { error: string }
      | { exit: string };
    canonicalName: CanonicalName;
  }>;
};

/**
 * Hooks for `link()`; called via {@link LoadLocationHooks}, {@link LoadFromMapHooks}, or {@link CaptureFromMapHooks}
 */
export type LinkHooks = MakeImportHookMakerHooks;

/**
 * Hooks for `loadLocation()`
 */
export type LoadLocationHooks = MapNodeModulesHooks & LinkHooks;

/**
 * Hooks for `loadFromMap()`
 */
export type LoadFromMapHooks = LinkHooks;

/**
 * Hooks for `digestCompartmentMap()`; called via {@link CaptureFromMapHooks}
 */
export type DigestCompartmentMapHooks = {
  packageConnections: HookFn<{
    canonicalName: CanonicalName;
    connections: Set<CanonicalName>;
  }>;
};

/**
 * Hooks for `captureFromMap()`
 */
export type CaptureFromMapHooks = DigestCompartmentMapHooks & LinkHooks;

/**
 * All {@link HookDefinition hook definitions} for all defined hooks.
 */
export interface HookDefinitions {
  mapNodeModules: MapNodeModulesHooks;
  importLocation: MakeImportHookMakerHooks;
  makeImportHookMaker: MakeImportHookMakerHooks;
  link: LinkHooks;
  loadLocation: LoadLocationHooks;
  digestCompartmentMap: DigestCompartmentMapHooks;
  captureFromMap: CaptureFromMapHooks;
  loadFromMap: LoadFromMapHooks;
}

/**
 * All hook configurations for all defined hooks.
 */
export type HookConfigurations = {
  [K in keyof HookDefinitions]: Simplify<HookConfiguration<HookDefinitions[K]>>;
};

/**
 * Options for `makeHookExecutor()`
 */
export type MakeHookExecutorOptions<
  Def extends HookDefinition = HookDefinition,
> = LogOptions & {
  defaultHookConfiguration?: HookConfiguration<Def>;
};

export type HooksDefinitionForName<DefName extends keyof HookDefinitions> =
  HookDefinitions[DefName];
