// @ts-check

/** @import { Token, Block, RenderOptions } from './types.js' */

/**
 * Render inline tokens to DOM elements.
 *
 * @param {Token[]} tokens
 * @param {Document} doc
 * @returns {DocumentFragment}
 */
export const renderInlineTokens = (tokens, doc) => {
  const fragment = doc.createDocumentFragment();

  for (const token of tokens) {
    switch (token.type) {
      case 'text': {
        const content = token.content || '';
        const lines = content.split('\n');
        for (let j = 0; j < lines.length; j += 1) {
          if (j > 0) {
            fragment.appendChild(doc.createElement('br'));
          }
          if (lines[j]) {
            fragment.appendChild(doc.createTextNode(lines[j]));
          }
        }
        break;
      }
      case 'emphasis': {
        const $el = doc.createElement('em');
        if (token.children) {
          $el.appendChild(renderInlineTokens(token.children, doc));
        }
        fragment.appendChild($el);
        break;
      }
      case 'strong': {
        const $el = doc.createElement('strong');
        if (token.children) {
          $el.appendChild(renderInlineTokens(token.children, doc));
        }
        fragment.appendChild($el);
        break;
      }
      case 'strikethrough': {
        const $el = doc.createElement('s');
        if (token.children) {
          $el.appendChild(renderInlineTokens(token.children, doc));
        }
        fragment.appendChild($el);
        break;
      }
      case 'code': {
        const $el = doc.createElement('code');
        $el.className = 'inline-code';
        $el.textContent = token.content || '';
        fragment.appendChild($el);
        break;
      }
      case 'link': {
        const $el = doc.createElement('a');
        $el.className = 'md-link';
        $el.setAttribute('href', token.href || '');
        $el.setAttribute('target', '_blank');
        $el.setAttribute('rel', 'noopener noreferrer');
        if (token.title) {
          $el.setAttribute('title', token.title);
        }
        if (token.children) {
          $el.appendChild(renderInlineTokens(token.children, doc));
        }
        fragment.appendChild($el);
        break;
      }
      default:
        break;
    }
  }

  return fragment;
};

/**
 * Render blocks to DOM.
 *
 * @param {Block[]} blocks
 * @param {RenderOptions} [options]
 * @returns {DocumentFragment}
 */
export const renderBlocks = (blocks, options) => {
  const doc = (options && options.document) || globalThis.document;
  const highlightCode = options && options.highlightCode;
  const fragment = doc.createDocumentFragment();

  for (const block of blocks) {
    switch (block.type) {
      case 'paragraph': {
        const $p = doc.createElement('p');
        $p.className = 'md-paragraph';
        if (Array.isArray(block.content)) {
          $p.appendChild(renderInlineTokens(block.content, doc));
        }
        fragment.appendChild($p);
        break;
      }
      case 'heading': {
        const level = Math.min(6, Math.max(1, block.level || 1));
        const $h = doc.createElement(`h${level}`);
        $h.className = `md-heading md-h${level}`;
        if (Array.isArray(block.content)) {
          $h.appendChild(renderInlineTokens(block.content, doc));
        }
        fragment.appendChild($h);
        break;
      }
      case 'code-fence': {
        const $pre = doc.createElement('pre');
        $pre.className = 'md-code-fence';
        if (block.language) {
          const $label = doc.createElement('span');
          $label.className = 'md-code-fence-language';
          $label.textContent = block.language;
          $pre.appendChild($label);
        }
        const $code = doc.createElement('code');
        if (block.language) {
          $code.className = `language-${block.language}`;
        }
        const content =
          typeof block.content === 'string' ? block.content : '';
        if (highlightCode && block.language) {
          $code.appendChild(highlightCode(content, block.language, doc));
        } else {
          $code.textContent = content;
        }
        $pre.appendChild($code);
        fragment.appendChild($pre);
        break;
      }
      case 'list': {
        const $list = doc.createElement(block.ordered ? 'ol' : 'ul');
        $list.className = 'md-list';
        if (block.children) {
          for (const item of block.children) {
            const $li = doc.createElement('li');
            $li.className = 'md-list-item';
            if (Array.isArray(item.content)) {
              $li.appendChild(renderInlineTokens(item.content, doc));
            }
            // Render nested children (sub-lists, etc.)
            if (item.children && item.children.length > 0) {
              $li.appendChild(renderBlocks(item.children, options));
            }
            $list.appendChild($li);
          }
        }
        fragment.appendChild($list);
        break;
      }
      case 'table': {
        const $table = doc.createElement('table');
        $table.className = 'md-table';

        // Header
        if (block.headerRow) {
          const $thead = doc.createElement('thead');
          const $tr = doc.createElement('tr');
          for (let c = 0; c < block.headerRow.length; c += 1) {
            const $th = doc.createElement('th');
            const align =
              block.alignments && block.alignments[c] !== 'none'
                ? block.alignments[c]
                : null;
            if (align) {
              $th.setAttribute('style', `text-align: ${align}`);
            }
            $th.appendChild(
              renderInlineTokens(block.headerRow[c], doc),
            );
            $tr.appendChild($th);
          }
          $thead.appendChild($tr);
          $table.appendChild($thead);
        }

        // Body
        if (block.bodyRows && block.bodyRows.length > 0) {
          const $tbody = doc.createElement('tbody');
          for (const row of block.bodyRows) {
            const $tr = doc.createElement('tr');
            for (let c = 0; c < row.length; c += 1) {
              const $td = doc.createElement('td');
              const align =
                block.alignments && block.alignments[c] !== 'none'
                  ? block.alignments[c]
                  : null;
              if (align) {
                $td.setAttribute('style', `text-align: ${align}`);
              }
              $td.appendChild(renderInlineTokens(row[c], doc));
              $tr.appendChild($td);
            }
            $tbody.appendChild($tr);
          }
          $table.appendChild($tbody);
        }

        fragment.appendChild($table);
        break;
      }
      case 'blockquote': {
        const $bq = doc.createElement('blockquote');
        $bq.className = 'md-blockquote';
        if (block.children) {
          $bq.appendChild(renderBlocks(block.children, options));
        }
        fragment.appendChild($bq);
        break;
      }
      case 'horizontal-rule': {
        const $hr = doc.createElement('hr');
        $hr.className = 'md-rule';
        fragment.appendChild($hr);
        break;
      }
      default:
        break;
    }
  }

  return fragment;
};
