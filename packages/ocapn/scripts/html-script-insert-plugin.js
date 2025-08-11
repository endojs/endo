// @ts-check

import { load as loadHtml } from 'cheerio';
import { format as prettierFormat } from 'prettier';

/**
 * @param {string} scriptSrc
 * @returns {import('vite').Plugin}
 */
export function htmlScriptInsertPlugin(scriptSrc) {
  return {
    name: 'ocap-kernel:html-trusted-prelude',
    async transformIndexHtml(htmlString) {
      const htmlDoc = loadHtml(htmlString);

      const endoifyElement = `<script type="module" crossorigin="" src="${scriptSrc}"></script>`;
      htmlDoc(endoifyElement).insertBefore('head:first script:first');

      return prettierFormat(htmlDoc.html(), {
        parser: 'html',
        tabWidth: 2,
      });
    },
  };
}