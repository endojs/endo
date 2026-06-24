// @ts-check

import { renderGraph } from './graph.js';
import './graph.css';

/**
 * Mount the inventory graph UI into a container element.
 * Returns a cleanup function that tears down the graph.
 *
 * @param {HTMLElement} $container
 * @param {object} props
 * @param {unknown} props.powers - Resolved endo powers for this profile
 * @param {unknown} props.rootPowers - Root endo powers (host)
 * @param {string[]} props.profilePath
 * @param {(newPath: string[]) => void} props.onProfileChange
 * @returns {() => void} cleanup function
 */
export const mountInventoryGraph = ($container, props) => {
  const $root = document.createElement('div');
  $root.style.width = '100%';
  $root.style.height = '100%';
  $container.appendChild($root);

  return renderGraph($root, props);
};
