/**
 * Common type guards.
 *
 * @module
 */

const { hasOwn } = Object;

/**
 * @import {
 *  ModuleDescriptorConfiguration,
 *  FileModuleDescriptorConfiguration,
 *  ErrorModuleDescriptorConfiguration,
 *  ModuleSource,
 *  ExitModuleSource,
 *  ErrorModuleSource,
 *  LocalModuleSource,
 *  ExitModuleDescriptorConfiguration,
 *  CompartmentModuleDescriptorConfiguration
 * } from './types.js';
 */

/**
 * Type guard for an {@link ErrorModuleDescriptorConfiguration}.
 * @param {ModuleDescriptorConfiguration} value
 * @returns {value is ErrorModuleDescriptorConfiguration}
 */
export const isErrorModuleDescriptorConfiguration = value =>
  hasOwn(value, 'deferredError') &&
  /** @type {any} */ (value).deferredError !== undefined;

/**
 * Type guard for a {@link FileModuleDescriptorConfiguration}.
 *
 * @param {ModuleDescriptorConfiguration} value
 * @returns {value is FileModuleDescriptorConfiguration}
 */
export const isFileModuleDescriptorConfiguration = value =>
  hasOwn(value, 'parser') &&
  /** @type {any} */ (value).parser !== undefined &&
  !isErrorModuleDescriptorConfiguration(value);

/**
 * Type guard for an {@link ExitModuleDescriptorConfiguration}.
 * @param {ModuleDescriptorConfiguration} value
 * @returns {value is ExitModuleDescriptorConfiguration}
 */
export const isExitModuleDescriptorConfiguration = value =>
  hasOwn(value, 'exit') &&
  /** @type {any} */ (value).exit !== undefined &&
  !isErrorModuleDescriptorConfiguration(value);

/**
 * Type guard for an {@link CompartmentModuleDescriptorConfiguration}.
 * @param {ModuleDescriptorConfiguration} value
 * @returns {value is CompartmentModuleDescriptorConfiguration}
 */
export const isCompartmentModuleDescriptorConfiguration = value =>
  hasOwn(value, 'compartment') &&
  /** @type {any} */ (value).compartment !== undefined &&
  hasOwn(value, 'module') &&
  /** @type {any} */ (value).module !== undefined &&
  !isErrorModuleDescriptorConfiguration(value);
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
