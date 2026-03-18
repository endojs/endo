/**
 * Provides utility functions for creating `Error`s with well-known
 * {@link ErrorCode | error codes}.
 *
 * @module
 */

/**
 * @import {Details} from 'ses';
 * @import {ErrorCode, CompartmentMapperError, CompartmentMapperErrorOptions, CompartmentMapperErrorOptionsWithCtor} from './types/external.js';
 */

const { makeError } = assert;

/**
 *
 * @overload
 * @param {Details} message
 * @param {ErrorCode} code
 * @param {CompartmentMapperErrorOptions<ErrorConstructor>} [options]
 * @returns {CompartmentMapperError<Error>}
 */
/**
 *
 * @template {ErrorConstructor} T
 * @overload
 * @param {Details} message
 * @param {ErrorCode} code
 * @param {CompartmentMapperErrorOptionsWithCtor<T>} options
 * @returns {CompartmentMapperError<InstanceType<T>>}
 */
/**
 *
 * @param {Details} message
 * @param {ErrorCode} code
 * @param {CompartmentMapperErrorOptions} [options]
 */
export const createError = (message, code, options) => {
  const { error: errorCtor = Error, ...rest } = options ?? {};
  return makeError(message, errorCtor, { ...rest, code });
};

/**
 *
 * @overload
 * @param {Error[]} errors
 * @param {Details} message
 * @param {ErrorCode} code
 * @param {CompartmentMapperErrorOptions<AggregateErrorConstructor>} [options]
 * @returns {CompartmentMapperError<AggregateError>}
 */
/**
 *
 * @template {AggregateErrorConstructor} T
 * @overload
 * @param {Error[]} errors
 * @param {Details} message
 * @param {ErrorCode} code
 * @param {CompartmentMapperErrorOptionsWithCtor<T>} options
 * @returns {CompartmentMapperError<InstanceType<T>>}
 */
/**
 *
 * @param {Error[]} errors
 * @param {Details} message
 * @param {ErrorCode} code
 * @param {CompartmentMapperErrorOptions} [options]
 */
export const createAggregateError = (errors, message, code, options) => {
  const { error: errorCtor = AggregateError, ...rest } = options ?? {};
  return makeError(message, errorCtor, { ...rest, code, errors });
};

/**
 * Well-known error codes.
 */
export const ErrorCodes = Object.freeze(
  /**
   * @type {const}
   * @satisfies {Record<string, ErrorCode>}
   */ ({
    PolicyViolation: 'E_POLICY_VIOLATION',
    InsufficientReadPowers: 'E_INSUFFICIENT_READ_POWERS',
    IncompatibleParser: 'E_INCOMPATIBLE_PARSER',
    InvalidCompartmentDescriptor: 'E_INVALID_COMPARTMENT_DESCRIPTOR',
    AttenuationFailure: 'E_ATTENUATION_FAILURE',
    UnknownModule: 'E_UNKNOWN_MODULE',
    InvalidArchive: 'E_INVALID_ARCHIVE',
    NoPackageJson: 'E_NO_PACKAGE_JSON',
    ExtraneousArchiveFiles: 'E_EXTRANEOUS_ARCHIVE_FILES',
    BundleFailure: 'E_BUNDLE_FAILURE',
    InvalidArgument: 'E_INVALID_ARGUMENT',
    NotImplemented: 'E_NOT_IMPLEMENTED',
    GraphError: 'E_GRAPH_ERROR',
    MissingDependency: 'E_MISSING_DEPENDENCY',
  }),
);
