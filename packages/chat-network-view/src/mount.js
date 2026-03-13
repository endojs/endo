// @ts-check
/* global document */

import { renderPeers } from './peers.js';
import './peers.css';

/**
 * Mount the network peers view into a container element.
 * Returns a cleanup function that tears down the view.
 *
 * @param {HTMLElement} $container
 * @param {object} props
 * @param {unknown} props.powers - Resolved endo powers for this profile
 * @param {unknown} props.rootPowers - Root endo powers (host)
 * @param {string[]} props.profilePath
 * @param {(newPath: string[]) => void} props.onProfileChange
 * @returns {() => void} cleanup function
 */
export const mountNetworkView = ($container, props) => {
  const $root = document.createElement('div');
  $root.style.width = '100%';
  $root.style.height = '100%';
  $container.appendChild($root);

  return renderPeers($root, props);
};
