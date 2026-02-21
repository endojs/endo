// @ts-check
/* global document */

import { passStyleOf, getInterfaceOf } from '@endo/pass-style';
import { numberFormatter } from './time-formatters.js';

/**
 * Render a value as DOM elements.
 * @param {unknown} value
 * @returns {HTMLElement}
 */
export const render = value => {
  let passStyle;
  try {
    passStyle = passStyleOf(value);
  } catch {
    const $value = document.createElement('div');
    $value.className = 'error';
    $value.innerText = '⚠️ Not passable ⚠️';
    return $value;
  }

  switch (passStyle) {
    case 'null':
    case 'undefined':
    case 'boolean': {
      const $value = document.createElement('span');
      $value.className = 'number';
      $value.innerText = `${value}`;
      return $value;
    }
    case 'bigint': {
      const $value = document.createElement('span');
      $value.className = 'bigint';
      $value.innerText = `${numberFormatter.format(/** @type {bigint} */ (value))}n`;
      return $value;
    }
    case 'number': {
      const $value = document.createElement('span');
      $value.className = 'number';
      $value.innerText = numberFormatter.format(/** @type {number} */ (value));
      return $value;
    }
    case 'string': {
      const $value = document.createElement('span');
      $value.className = 'string';
      $value.innerText = JSON.stringify(value);
      return $value;
    }
    case 'promise': {
      const $value = document.createElement('span');
      $value.innerText = '⏳';
      // TODO await (and respect cancellation)
      return $value;
    }
    case 'copyArray': {
      const $value = document.createElement('span');
      $value.appendChild(document.createTextNode('['));
      const $entries = document.createElement('span');
      $entries.className = 'entries';
      $value.appendChild($entries);
      let $entry;
      for (const child of /** @type {unknown[]} */ (value)) {
        $entry = document.createElement('span');
        $entries.appendChild($entry);
        const $child = render(child);
        $entry.appendChild($child);
        $entry.appendChild(document.createTextNode(', '));
      }
      // Remove final comma.
      if ($entry) {
        $entry.removeChild(/** @type {ChildNode} */ ($entry.lastChild));
      }
      $value.appendChild(document.createTextNode(']'));
      return $value;
    }
    case 'copyRecord': {
      const $value = document.createElement('span');
      $value.appendChild(document.createTextNode('{'));
      const $entries = document.createElement('span');
      $value.appendChild($entries);
      $entries.className = 'entries';
      let $entry;
      for (const [key, child] of Object.entries(
        /** @type {Record<string, unknown>} */ (value),
      )) {
        $entry = document.createElement('span');
        $entries.appendChild($entry);
        const $key = document.createElement('span');
        $key.innerText = `${JSON.stringify(key)}: `;
        $entry.appendChild($key);
        const $child = render(child);
        $entry.appendChild($child);
        $entry.appendChild(document.createTextNode(', '));
      }
      if ($entry) {
        // Remove final comma.
        $entry.removeChild(/** @type {ChildNode} */ ($entry.lastChild));
      }
      $value.appendChild(document.createTextNode('}'));
      return $value;
    }
    case 'tagged': {
      const $value = document.createElement('span');
      const $tag = document.createElement('span');
      const tagged =
        /** @type {{ [Symbol.toStringTag]: string, payload: unknown }} */ (
          value
        );
      $tag.innerText = `${JSON.stringify(tagged[Symbol.toStringTag])} `;
      $tag.className = 'tag';
      $value.appendChild($tag);
      const $child = render(tagged.payload);
      $value.appendChild($child);
      return $value;
    }
    case 'error': {
      const $value = document.createElement('span');
      $value.className = 'error';
      $value.innerText = /** @type {Error} */ (value).message;
      return $value;
    }
    case 'remotable': {
      const $value = document.createElement('span');
      $value.className = 'remotable';
      const remotable = /** @type {{ [Symbol.toStringTag]: string }} */ (value);
      $value.innerText = remotable[Symbol.toStringTag];
      return $value;
    }
    default: {
      throw new Error(
        'Unreachable if programmed to account for all pass-styles',
      );
    }
  }
};

/**
 * Map from remotable interface tags to semantic types.
 * @type {Record<string, string>}
 */
export const INTERFACE_TO_TYPE = {
  EndoHost: 'profile',
  EndoGuest: 'profile',
  Endo: 'profile',
  EndoDirectory: 'directory',
  EndoWorker: 'worker',
  Handle: 'handle',
  Invitation: 'invitation',
  EndoReadable: 'readable',
  AsyncIterator: 'readable',
};

/**
 * Infer the semantic type from a value.
 * @param {unknown} value
 * @returns {string}
 */
export const inferType = value => {
  const passStyle = passStyleOf(value);

  // For primitives, use the pass style directly
  if (passStyle !== 'remotable') {
    return passStyle;
  }

  // For remotables, try to infer from the interface tag
  const iface = getInterfaceOf(value);
  if (iface) {
    // Interface format is "Alleged: TypeName" or just "TypeName"
    const match = iface.match(/^(?:Alleged:\s*)?(\w+)/);
    if (match) {
      const typeName = match[1];
      if (typeName in INTERFACE_TO_TYPE) {
        return INTERFACE_TO_TYPE[typeName];
      }
    }
  }

  return 'remotable';
};
