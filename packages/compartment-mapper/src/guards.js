/**
 * Common type guards.
 *
 * @module
 */

const { hasOwn } = Object;

/**
 * @import {
 *  ModuleConfiguration,
 *  FileModuleConfiguration,
 *  ErrorModuleConfiguration,
 *  ModuleSource,
 *  ExitModuleSource,
 *  ErrorModuleSource,
 *  LocalModuleSource,
 *  ExitModuleConfiguration,
 *  CompartmentModuleConfiguration
 * } from './types.js';
 */

/**
 * Type guard for an {@link ErrorModuleConfiguration}.
 * @param {ModuleConfiguration} value
 * @returns {value is ErrorModuleConfiguration}
 */
export const isErrorModuleConfiguration = value =>
  hasOwn(value, 'deferredError') &&
  /** @type {any} */ (value).deferredError !== undefined;

/**
 * Type guard for a {@link FileModuleConfiguration}.
 *
 * @param {ModuleConfiguration} value
 * @returns {value is FileModuleConfiguration}
 */
export const isFileModuleConfiguration = value =>
  hasOwn(value, 'parser') &&
  /** @type {any} */ (value).parser !== undefined &&
  !isErrorModuleConfiguration(value);

/**
 * Type guard for an {@link ExitModuleConfiguration}.
 * @param {ModuleConfiguration} value
 * @returns {value is ExitModuleConfiguration}
 */
export const isExitModuleConfiguration = value =>
  hasOwn(value, 'exit') &&
  /** @type {any} */ (value).exit !== undefined &&
  !isErrorModuleConfiguration(value);

/**
 * Type guard for an {@link CompartmentModuleConfiguration}.
 * @param {ModuleConfiguration} value
 * @returns {value is CompartmentModuleConfiguration}
 */
export const isCompartmentModuleConfiguration = value =>
  hasOwn(value, 'compartment') &&
  /** @type {any} */ (value).compartment !== undefined &&
  hasOwn(value, 'module') &&
  /** @type {any} */ (value).module !== undefined &&
  !isErrorModuleConfiguration(value);
/**
 * Type guard for an {@link ErrorModuleSource}.
 *
 * @param {ModuleSource} value
 * @returns {value is ErrorModuleSource}
 */
export const isErrorModuleSource = value =>
  hasOwn(value, 'deferredError') &&
  /** @type {any} */ (value).deferredError !== undefined;

/**
 * Type guard for an {@link ExitModuleSource}.
 *
 * @param {ModuleSource} value
 * @returns {value is ExitModuleSource}
 */
export const isExitModuleSource = value =>
  hasOwn(value, 'exit') &&
  /** @type {any} */ (value).exit !== undefined &&
  !isErrorModuleSource(value);

/**
 * Type guard for an {@link LocalModuleSource}.
 *
 * @param {ModuleSource} value
 * @returns {value is LocalModuleSource}
 */
export const isLocalModuleSource = value =>
  hasOwn(value, 'bytes') &&
  /** @type {any} */ (value).bytes !== undefined &&
  hasOwn(value, 'parser') &&
  /** @type {any} */ (value).parser !== undefined &&
  hasOwn(value, 'sourceDirname') &&
  /** @type {any} */ (value).sourceDirname !== undefined &&
  hasOwn(value, 'location') &&
  /** @type {any} */ (value).location !== undefined &&
  !isErrorModuleSource(value);

/**
 * Type guard for a non-nullable object
 *
 * @param {unknown} value
 * @returns {value is object}
 */
export const isNonNullableObject = value =>
  typeof value === 'object' && value !== null;
