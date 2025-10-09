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
 * Defines a hook that has both pre-execution and post-execution phases.
 *
 * Used where specific types are not known.
 *
 * If both phases are not necessary, just use {@link HookFn | a single Hook}.
 * Each phase can be a single hook or a pipeline of hooks.
 */
export type PhasedHookDefinition = {
  /** Hook or pipeline executed before the main operation */
  pre: AnyHook | AnyHook[];
  /** Hook or pipeline executed after the main operation */
  post: AnyHook | AnyHook[];
};

/**
 * Base definition for what constitutes a valid hook definition.
 *
 * Maps hook names to single hooks, arrays of hooks (pipelines), or phased hook definitions.
 */
export type HookDefinition = Record<
  string,
  PhasedHookDefinition | AnyHook | AnyHook[]
>;

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
      : T[K] extends PhasedHookDefinition
        ? {
            pre?: T[K]['pre'] extends AnyHook | AnyHook[]
              ?
                  | T[K]['pre']
                  | (T[K]['pre'] extends AnyHook[] ? never : T[K]['pre'][])
              : never;
            post?: T[K]['post'] extends AnyHook | AnyHook[]
              ?
                  | T[K]['post']
                  | (T[K]['post'] extends AnyHook[] ? never : T[K]['post'][])
              : never;
          }
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
 * Possible hook phase names.
 */
export type HookPhase = 'pre' | 'post';

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
 * Helper type to extract the input type from a specific phase of a phased hook.
 *
 * Used for type inference in {@link HookExecutorFn | hook executors}.
 *
 * @template Def - The hook definition type
 * @template DefName - The hook name key
 * @template Phase - The phase (`pre` or `post`)
 */
export type PhasedHookInputType<
  Def extends HookDefinition,
  DefName extends keyof Def,
  Phase extends HookPhase,
> = Def[DefName] extends {
  [key in Phase]?: HookFn<infer TInput>;
}
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

  /**
   * Execute a specific phase of a phased hook.
   *
   * @template HookName - The hook name key
   * @template Phase - The phase (`pre` or `post`)
   * @param name - The name of the hook phase in the format `hookName.phase`
   * @param input - The input parameters for the hook phase
   * @returns Partial update of the input, or void
   */
  <HookName extends keyof Def, Phase extends HookPhase>(
    name: `${HookName & string}.${Phase}`,
    input: PhasedHookInputType<Def, HookName, Phase>,
  ): Partial<PhasedHookInputType<Def, HookName, Phase>> | void;
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
    issue: string;
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
