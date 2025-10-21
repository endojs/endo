/**
 * Universal hook utilities.
 *
 * Exports {@link makeHookExecutor} and {@link makeDefaultHookConfiguration}.
 *
 * @module
 */

/**
 * @import {
 *   HookConfigurations,
 *   HookDefinitions,
 *   AnyHook,
 *   HookConfiguration,
 *   HookDefinition,
 *   HookExecutorFn,
 *   HookFn,
 *   HookFnInputType,
 *   PolicyOption,
 *   MakeHookExecutorOptions,
 *   LogOptions,
 *   CanonicalName,
 * } from './types.js';
 */

import { dependencyAllowedByPolicy, makePackagePolicy } from './policy.js';
import { isNonNullableObject } from './guards.js';

const { entries } = Object;
const { isArray } = Array;
const { quote: q } = assert;
const noop = () => {};

/**
 * Type guard for a {@link AnyHook}
 * @param {unknown} value
 * @returns {value is AnyHook}
 */
const isHook = value => typeof value === 'function';

/**
 * Recursively applies default values from one or more source objects to a target object. _Mutates the target object._
 *
 * Similar to `lodash`'s `defaultsDeep`, this function deeply merges objects, only setting
 * values in the target if they are undefined or null.
 *
 * Special array handling for the hook configuration merging:
 * - When both source and target are arrays, concatenates them with _source items_ first
 * - When one is an array and the other isn't, creates a new array with _source first_
 * - _Arrays are concatenated; not deeply merged_
 *
 * This would be painful to type properly given the mutation occuring here.
 *
 * Exported for testing only; not intended to be called outside of this module.
 *
 * @param {any} target - The target object to receive default values
 * @param {...any} sources - One or more source objects containing default values
 * @returns {any} The target object with defaults applied
 * @internal
 */
export const applyHookDefaults = (target = {}, ...sources) => {
  // If target is null or not an object (but not undefined), return as-is
  if (target == null || typeof target !== 'object') {
    return target;
  }

  for (const source of sources) {
    if (source != null && typeof source === 'object') {
      for (const [key, value] of entries(source)) {
        if (target[key] === undefined || target[key] === null) {
          // Target doesn't have this key or it's null/undefined, use the source value
          if (value !== null && typeof value === 'object' && !isArray(value)) {
            // If the source value is an object (but not array), create a new object
            target[key] = applyHookDefaults({}, value);
          } else {
            // For primitives, arrays, or null values, assign directly
            target[key] = value;
          }
        } else {
          // Target has a value, handle array concatenation and object merging
          const targetValue = target[key];
          const sourceValue = value;

          if (isArray(targetValue) && isArray(sourceValue)) {
            // Both are arrays: concatenate with source first
            target[key] = [...sourceValue, ...targetValue];
          } else if (isArray(targetValue) && !isArray(sourceValue)) {
            // Target is array, source is not: prepend source to target array
            target[key] = [sourceValue, ...targetValue];
          } else if (!isArray(targetValue) && isArray(sourceValue)) {
            // Source is array, target is not: append target to source array
            target[key] = [...sourceValue, targetValue];
          } else if (
            typeof targetValue === 'object' &&
            targetValue !== null &&
            typeof sourceValue === 'object' &&
            sourceValue !== null &&
            !isArray(targetValue) &&
            !isArray(sourceValue)
          ) {
            // Both are objects (but not arrays), merge them recursively
            applyHookDefaults(targetValue, sourceValue);
          }
          // If target has a value and it's not compatible for merging,
          // don't override (preserve existing value)
        }
      }
    }
  }

  return target;
};

/**
 * Creates a hook executor function.
 *
 * This form will require a type assertion of `typeof makeHookExecutor<YourHookDefinitions>` wrapped around the function itself.
 *
 * @example
 * ```js
 * const hooks = {
 *   moduleSource: (input) => { console.log('moduleSource hook', input); },
 *   moduleDescriptorConfiguration: {
 *     pre: (input) => { console.log('pre hook', input); return input; },
 *     post: (input) => { console.log('post hook', input); }
 *   }
 * };
 *
 * const executeHook = makeHookExecutor(hooks);
 *
 * // Execute direct hook
 * executeHook('moduleSource', { some: 'data' });
 *
 * // Execute pre/post hooks
 * executeHook('moduleDescriptorConfiguration.pre', { some: 'data' });
 * executeHook('moduleDescriptorConfiguration.post', { some: 'data' });
 * ```
 * @template {HookDefinition} Def
 * @overload
 * @param {HookConfiguration<Def>} hookConfiguration
 * @param {MakeHookExecutorOptions<Def>} [options]
 * @returns {HookExecutorFn<Def>}
 */

/**
 * Creates a hook executor function.
 *
 * This form accepts the name of a {@link HookDefinitions known hook definition}  in lieu of a type assertion.
 *
 * @template {keyof HookDefinitions} HooksName
 * @template {HookDefinitions[HooksName]} Def
 * @overload
 * @param {HooksName} name
 * @param {HookConfiguration<Def>} hookConfiguration
 * @param {MakeHookExecutorOptions<Def>} [options]
 * @returns {HookExecutorFn<Def>}
 */

/**
 * @param {HookConfiguration<Def>|string} hookConfigurationOrString
 * @param {HookConfiguration<Def>|MakeHookExecutorOptions<Def>} optionsOrHookConfiguration
 * @param {MakeHookExecutorOptions<Def>} [options]
 * @returns {HookExecutorFn<Def>}
 */
export const makeHookExecutor = (
  hookConfigurationOrString,
  optionsOrHookConfiguration,
  options,
) => {
  /** @type {HookConfiguration<Def>} */
  let hookConfiguration;
  if (typeof hookConfigurationOrString === 'string') {
    hookConfiguration = /** @type {HookConfiguration<Def>} */ (
      optionsOrHookConfiguration
    );
    options = /** @type {MakeHookExecutorOptions<Def>} */ (options ?? {});
  } else {
    hookConfiguration = hookConfigurationOrString;
    options = /** @type {MakeHookExecutorOptions<Def>} */ (
      optionsOrHookConfiguration ?? {}
    );
  }
  const { log = noop, defaultHookConfiguration } = options;

  /**
   * Execute multiple hooks in a pipeline, accumulating partial updates
   *
   * @template {HookFnInputType<Def, DefName>} Value Input & output value
   * @template {keyof Def} DefName - The hook name key
   * @param {Array<HookFn<Value>>} hooks - Array of hooks to execute in sequence
   * @param {Value} input - Input parameters for the hooks
   * @returns {Value} The original input merged with all partial updates from the pipeline
   */
  const executeHookPipeline = (hooks, input) =>
    hooks.reduce(
      (accumulatedInput, hook) => {
        /** @type {Partial<Value>|void|undefined} */
        let result;
        try {
          result = hook({ ...accumulatedInput, log });
        } catch (err) {
          throw new Error(`Hook Error: ${err.message}`, {
            cause: err,
          });
        }

        if (isNonNullableObject(result) && !isArray(result)) {
          return {
            ...accumulatedInput,
            ...result,
          };
        } else if (result !== undefined) {
          throw new TypeError(
            `Hook Error: hook returned non-plain-object: ${q(result)}`,
          );
        }
        return accumulatedInput;
      },
      { ...input },
    );

  /**
   * Execute a direct hook by name with the given input
   * @template {keyof Def} HooksName
   * @overload
   * @param {HooksName} name - Direct hook name (e.g., "moduleSource", "packageDescriptor")
   * @param {HookFnInputType<Def, HooksName>} input - Input parameters for the hook
   * @returns {Partial<HookFnInputType<Def, HooksName>> | void} Partial update of input or void
   */

  /**
   * Execute a hook by name with the given input.
   * Supports pipeline composition where multiple hooks can be chained together.
   *
   * @param {string} name - Hook name (e.g., "moduleSource", "packageDescriptor")
   * @param {unknown} input - Input parameters for the hook
   */
  const executeHook = (name, input) => {
    // Use merged configuration that combines user hooks with defaults
    const effectiveConfig = applyHookDefaults(
      { ...hookConfiguration },
      defaultHookConfiguration,
    );

    if (!effectiveConfig) {
      return undefined;
    }

    // Direct hook (e.g., "moduleSource", "packageDescriptor")
    const hookValue = effectiveConfig[name];
    
    if (hookValue === undefined) {
      return undefined;
    }

    if (!isHook(hookValue) && !isArray(hookValue)) {
      throw new TypeError(
        `Expected hook ${q(name)} to be a function or array of functions`,
      );
    }

    // Handle both single hooks and arrays of hooks (pipelines)
    const hookArray = isArray(hookValue) ? hookValue : [hookValue];

    if (hookArray.length === 0) {
      return undefined;
    }

    // Execute pipeline of hooks
    return executeHookPipeline(
      hookArray,
      /** @type {HookFnInputType<Def, keyof Def>} */ (input),
    );
  };
  return executeHook;
};

/**
 * Creates defaults for a named {@link HookDefinitions known hook definition}.
 *
 * @template {keyof HookConfigurations} Name
 * @param {Name} name
 * @param {PolicyOption & LogOptions} [options]
 * @returns {HookConfigurations[Name]}
 */
export const makeDefaultHookConfiguration = (
  name,
  { policy, log: _factoryLog = noop } = {},
) => {
  /**
   * @type {HookConfigurations}
   */
  const defaultHooks = {
    // these hooks for mapNodeModules are only applied if a policy was provided.
    mapNodeModules: policy
      ? {
          unknownCanonicalName: ({ canonicalName, message, log }) => {
            log(
              `WARN: Invalid resource ${q(canonicalName)} in policy: ${message}`,
            );
          },

          /**
           * This hook filters the list of allowed dependencies based on package policy.
           *
           * @param {HookFnInputType<MapNodeModulesHooks, 'packageDependencies'>} params
           */
          packageDependencies: [
            ({ canonicalName, dependencies, log }) => {
              const packagePolicy = makePackagePolicy(canonicalName, {
                policy,
              });
              const filteredDependencies = new Set(
                [...dependencies].filter(dependency => {
                  const allowed = dependencyAllowedByPolicy(
                    dependency,
                    packagePolicy,
                  );
                  if (!allowed) {
                    log(
                      `Excluding dependency ${q(dependency)} of package ${q(canonicalName)} per policy`,
                    );
                  }
                  return allowed;
                }),
              );

              return filteredDependencies.size !== dependencies.size
                ? { dependencies: filteredDependencies }
                : undefined;
            },
          ],
        }
      : {},
    importLocation: {},
    makeImportHookMaker: {},
    link: {},
    loadLocation: {},
    digestCompartmentMap: {},
    captureFromMap: {},
    loadFromMap: {},
  };

  return defaultHooks[name];
};
