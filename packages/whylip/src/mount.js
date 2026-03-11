// @ts-check
/* global document */

import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { WhylipApp } from './App.jsx';

/**
 * Mount the Whylip UI into a container element.
 * Returns a cleanup function that unmounts the React tree.
 *
 * @param {HTMLElement} $container
 * @param {object} props
 * @param {unknown} props.powers - Resolved endo powers for this profile
 * @param {unknown} props.rootPowers - Root endo powers
 * @param {string[]} props.profilePath
 * @param {(newPath: string[]) => void} props.onProfileChange
 * @returns {() => void} unmount function
 */
export const mountWhylip = ($container, props) => {
  const $root = document.createElement('div');
  $root.id = 'whylip-root';
  $container.appendChild($root);

  const root = createRoot($root);
  root.render(createElement(WhylipApp, props));

  return () => root.unmount();
};
