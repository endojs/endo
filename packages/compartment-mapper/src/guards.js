/**
 * Common type guards.
 *
 * @module
 */

const { hasOwn } = Object;
/**
 * @import {
 *  ModuleDescriptorConfiguration,
 *  ErrorModuleDescriptorConfiguration,
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
