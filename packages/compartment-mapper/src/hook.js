import 'ses';
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
 *   MapNodeModulesHooks,
 *   PhasedHookDefinition,
 *   PhasedHookInputType,
 *   PolicyOption,
 *   MakeHookExecutorOptions,
 *   LogOptions,
 * } from './types.js';
 */

import { dependencyAllowedByPolicy, makePackagePolicy } from './policy.js';
import { isNonNullableObject } from './guards.js';

const { entries, keys } = Object;
const { isArray } = Array;
const { quote: q } = assert;
const noop = () => {};

/**
 * Type guard for a {@link PhasedHookDefinition}
 *
 * @param {unknown} value
 * @returns {value is PhasedHookDefinition}
 */
const isPhasedHookDefinition = value =>
  !!value &&
  typeof value === 'object' &&
  !isArray(value) &&
  (('pre' in value &&
    (typeof value.pre === 'function' || isArray(value.pre))) ||
    ('post' in value &&
      (typeof value.post === 'function' || isArray(value.post))));

/**
 * Type guard for a {@link AnyHook}
 * @param {unknown} value
 * @returns {value is AnyHook}
 */
const isHook = value =>
  !isPhasedHookDefinition(value) && typeof value === 'function';

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
 * TODO: This would be painful to type properly given the mutation occuring here.
 * @param {any} target - The target object to receive default values
 * @param {...any} sources - One or more source objects containing default values
 * @returns {any} The target object with defaults applied
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
   * Execute a pre/post hook by name with the given input
   * @template {keyof Def} HooksName
   * @template {'pre' | 'post'} Phase
   * @overload
   * @param {`${HooksName}.${Phase}`} name - Pre/post hook name (e.g., "moduleDescriptorConfiguration.pre")
   * @param {PhasedHookInputType<Def, HooksName, Phase>} input - Input parameters for the hook
   * @returns {Partial<PhasedHookInputType<Def, HooksName, Phase>> | void} Partial update of input or void
   */

  /**
   * Execute a direct hook by name with the given input
   * @template {keyof Def} HooksName
   * @overload
   * @param {HooksName} name - Direct hook name (e.g., "moduleSource", "packageDescriptor")
   * @param {HookFnInputType<Def, HooksName>} input - Input parameters for the hook
   * @returns {Partial<HookFnInputType<Def, HooksName>> | void} Partial update of input or void
   */

  /**
   * Execute a hook by name with the given input. This is the implementation that handles
   * both direct hooks (e.g., "moduleSource") and pre/post hooks (e.g., "moduleDescriptorConfiguration.pre").
   * Supports pipeline composition where multiple hooks can be chained together.
   *
   * @param {string} name - Hook name (e.g., "moduleSource" or "moduleDescriptorConfiguration.pre")
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

    /** @type {AnyHook|AnyHook[]|undefined} */
    let hooks;

    // Check for pre/post hooks (e.g., "moduleDescriptorConfiguration.pre")
    if (name.includes('.')) {
      const [hookName, phase] = name.split('.');
      const hookGroup = effectiveConfig[hookName];
      if (isPhasedHookDefinition(hookGroup)) {
        hooks = hookGroup[phase];
      } else if (hookGroup !== undefined) {
        throw new TypeError(
          `Expected hook ${q(hookName)} to be a phased hook definition`,
        );
      }
    } else if (effectiveConfig[name] !== undefined) {
      // Direct hook (e.g., "moduleSource", "packageDescriptor")
      const hookValue = effectiveConfig[name];
      if (isHook(hookValue) || isArray(hookValue)) {
        hooks = hookValue;
      } else {
        throw new TypeError(
          `Expected hook ${q(name)} to be a function, array of functions, or phased hook definition`,
        );
      }
    }

    if (hooks) {
      // Handle both single hooks and arrays of hooks (pipelines)
      const hookArray = isArray(hooks) ? hooks : [hooks];

      if (hookArray.length === 0) {
        return undefined;
      }

      // Execute pipeline of hooks
      return executeHookPipeline(hookArray, input);
    }

    return undefined;
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
          /**
           * This hook validates that all resources named in the policy exist in
           * the compartment map.
           *
           * @param {HookFnInputType<MapNodeModulesHooks, 'canonicalNames'>} params
           */
          canonicalNames: [
            ({ canonicalNames }) => {
              /**
               * Looks for a similar canonical name in the list of known canonical names and appends a suggestion to the issue message
               * @param {string} badName Invalid canonical name
               * @param {string} issue Issue message to augment
               * @returns {string} The augmented issue message, or the original issue if no suggestion found
               */
              const makeSuggestion = (badName, issue) => {
                for (const canonicalName of canonicalNames) {
                  if (canonicalName.endsWith(`>${badName}`)) {
                    issue += `; did you mean ${q(canonicalName)}?`;
                    break;
                  }
                }
                return issue;
              };

              const issues = [];
              for (const [resourceName, resourcePolicy] of entries(
                policy.resources ?? {},
              )) {
                if (!canonicalNames.has(resourceName)) {
                  let issue = `Resource ${q(resourceName)} was not found`;
                  issue = makeSuggestion(resourceName, issue);
                  issues.push(issue);
                }
                if (resourcePolicy && typeof resourcePolicy === 'object') {
                  for (const packageName of keys(
                    resourcePolicy.packages ?? {},
                  )) {
                    if (!canonicalNames.has(packageName)) {
                      let issue = `Resource ${q(packageName)} from resource ${q(resourceName)} was not found`;
                      issue = makeSuggestion(packageName, issue);
                      issues.push(issue);
                    }
                  }
                }
              }

              if (issues.length) {
                throw new Error(
                  `Unknown resources found in policy\n  - ${issues.join('\n  - ')}`,
                );
              }
            },
          ],

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
  };

  return defaultHooks[name];
};
