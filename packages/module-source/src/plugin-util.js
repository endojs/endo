/**
 * Provides {@link visitorFromPlugin}
 *
 * @module
 */

import * as babelTypes from '@babel/types';

/**
 * @import {PluginFactory} from './types/module-source.js'
 * @import {Visitor} from '@babel/traverse'
 */

/**
 * Extracts the Babel visitor from a Babel plugin factory function.
 *
 * @param {PluginFactory} plugin A Babel plugin factory (receives `{ types }`)
 * @returns {Visitor}
 */

export const visitorFromPlugin = plugin =>
  plugin({ types: babelTypes }).visitor;
