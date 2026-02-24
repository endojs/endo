// @ts-check
/* global window, document, requestAnimationFrame, navigator, setTimeout */

/** @import { ERef } from '@endo/far' */
/** @import { EndoHost } from '@endo/daemon' */

import { E } from '@endo/far';
import { makeRefIterator } from './ref-iterator.js';
import {
  prepareTextWithPlaceholders,
  renderMarkdown,
  highlightCode,
} from './markdown-render.js';
import {
  dateFormatter,
  timeFormatter,
  relativeTime,
} from './time-formatters.js';

/**
 * @param {HTMLElement} $parent
 * @param {HTMLElement | null} $end
 * @param {ERef<EndoHost>} powers
 * @param {{ showValue: (value: unknown, id?: string, petNamePath?: string[], messageContext?: { number: bigint, edgeName: string }) => void | Promise<void>, conversationId?: string | null, conversationPetName?: string | null }} options
 */
export const inboxComponent = async (
  $parent,
  $end,
  powers,
  { showValue, conversationId, conversationPetName },
) => {
  $parent.scrollTo(0, $parent.scrollHeight);

  const selfId = await E(powers).identify('SELF');
  for await (const message of makeRefIterator(E(powers).followMessages())) {
    // Read DOM at animation frame to determine whether to pin scroll to bottom
    // of the messages pane.
    const wasAtEnd = await new Promise(resolve =>
      requestAnimationFrame(() => {
        const scrollTop = /** @type {number} */ ($parent.scrollTop);
        const endScrollTop = /** @type {number} */ (
          $parent.scrollHeight - $parent.clientHeight
        );
        resolve(scrollTop > endScrollTop - 10);
      }),
    );

    const { number, from: fromId, to: toId, date, dismissed } = message;

    const isSent = fromId === selfId;

    if (conversationId) {
      const otherPartyId = isSent ? toId : fromId;
      if (otherPartyId !== conversationId) {
        // ID didn't match directly — try matching by pet name
        // (handles peer/remote/guest formula indirection)
        if (conversationPetName) {
          // eslint-disable-next-line no-await-in-loop
          const names = await E(powers).reverseIdentify(otherPartyId);
          if (!Array.isArray(names) || !names.includes(conversationPetName)) {
            // eslint-disable-next-line no-continue
            continue;
          }
        } else {
          // eslint-disable-next-line no-continue
          continue;
        }
      }
    }

    const $message = document.createElement('div');
    $message.className = isSent ? 'message sent' : 'message';

    const $error = document.createElement('span');
    $error.style.color = 'red';
    $error.innerText = '';

    dismissed.then(() => {
      $message.remove();
    });

    const parsedDate = new Date(date);
    const $timestamp = document.createElement('span');
    $timestamp.className = 'timestamp';
    $timestamp.innerText = timeFormatter.format(parsedDate);

    const $tooltip = document.createElement('span');
    $tooltip.className = 'timestamp-tooltip';

    const $controls = document.createElement('span');
    $controls.className = 'timestamp-controls';

    const $msgNum = document.createElement('span');
    $msgNum.className = 'timestamp-num';
    $msgNum.innerText = `#${number}`;
    $controls.appendChild($msgNum);

    const $dismiss = document.createElement('button');
    $dismiss.className = 'dismiss-button';
    $dismiss.innerText = '×';
    $dismiss.title = 'Dismiss';
    $dismiss.onclick = () => {
      E(powers)
        .dismiss(number)
        .catch(error => {
          $error.innerText = ` ${error.message}`;
        });
    };
    $controls.appendChild($dismiss);

    $tooltip.appendChild($controls);

    const $times = document.createElement('span');
    $times.className = 'timestamp-times';
    const relative = relativeTime(parsedDate);
    const timeLines = [date, dateFormatter.format(parsedDate), relative].filter(
      Boolean,
    );
    for (const line of timeLines) {
      const $line = document.createElement('div');
      $line.className = 'timestamp-line';

      const $text = document.createElement('span');
      $text.innerText = line;
      $line.appendChild($text);

      const $copy = document.createElement('span');
      $copy.className = 'timestamp-copy';
      $copy.innerText = '⧉';
      $line.appendChild($copy);

      $line.onclick = () => {
        navigator.clipboard.writeText(line).then(() => {
          $copy.innerText = '✓';
          setTimeout(() => {
            $copy.innerText = '⧉';
          }, 1000);
        });
      };

      $times.appendChild($line);
    }
    $tooltip.appendChild($times);

    $timestamp.appendChild($tooltip);
    $message.appendChild($timestamp);

    const $body = document.createElement('div');
    $body.className = 'message-body';
    $body.appendChild($error);
    $message.appendChild($body);

    // Create sender/recipient chip to be injected into message content
    /** @type {HTMLElement | null} */
    let $senderChip = null;
    if (!isSent) {
      const fromNames = await E(powers).reverseIdentify(fromId);
      const fromName = fromNames?.[0];
      if (fromName !== undefined) {
        $senderChip = document.createElement('b');
        $senderChip.innerText = `@${fromName}`;
      }
    } else {
      const toNames = await E(powers).reverseIdentify(toId);
      const toName = toNames?.[0];
      if (toName !== undefined) {
        $senderChip = document.createElement('b');
        $senderChip.innerText = `@${toName}`;
      }
    }

    if (message.type === 'request') {
      const { description, settled } = message;

      const $description = document.createElement('span');
      // Inject sender chip before the description text
      if ($senderChip) {
        $description.appendChild($senderChip);
        $description.appendChild(document.createTextNode(' '));
      }
      $description.appendChild(
        document.createTextNode(JSON.stringify(description)),
      );
      $body.appendChild($description);

      const $input = document.createElement('span');
      $body.appendChild($input);

      const $pet = document.createElement('input');
      $pet.autocomplete = 'off';
      $pet.dataset.formType = 'other';
      $pet.dataset.lpignore = 'true';
      $input.appendChild($pet);

      const $resolve = document.createElement('button');
      $resolve.innerText = 'resolve';
      $input.appendChild($resolve);

      const $reject = document.createElement('button');
      $reject.innerText = 'reject';
      $reject.onclick = () => {
        E(powers).reject(number, $pet.value).catch(window.reportError);
      };
      $input.appendChild($reject);

      $resolve.onclick = () => {
        E(powers)
          .resolve(number, $pet.value)
          .catch(error => {
            $error.innerText = ` ${error.message}`;
          });
      };

      settled.then(status => {
        $input.innerText = ` ${status} `;
      });
    } else if (message.type === 'package') {
      const { strings, names } = message;
      assert(Array.isArray(strings));
      assert(Array.isArray(names));

      // Prepare text with placeholders for markdown rendering
      const textWithPlaceholders = prepareTextWithPlaceholders(strings);
      const { fragment, insertionPoints } =
        renderMarkdown(textWithPlaceholders);

      // Inject sender chip into the first paragraph or heading
      // But NOT into code fence wrappers or lists - prepend a new paragraph instead
      if ($senderChip) {
        // Find first element that's a plain paragraph (not code fence wrapper) or heading
        const $firstPara = fragment.querySelector(
          'p:not(.md-code-fence-wrapper), h1, h2, h3, h4, h5, h6',
        );
        const $firstChild = fragment.firstChild;
        const isCodeFenceOrList =
          $firstChild &&
          (($firstChild instanceof Element &&
            $firstChild.classList.contains('md-code-fence-wrapper')) ||
            ($firstChild instanceof Element && $firstChild.tagName === 'UL') ||
            ($firstChild instanceof Element && $firstChild.tagName === 'OL'));

        if ($firstPara && !isCodeFenceOrList) {
          // Insert into existing paragraph or heading
          $firstPara.insertBefore(
            document.createTextNode(' '),
            $firstPara.firstChild,
          );
          $firstPara.insertBefore($senderChip, $firstPara.firstChild);
        } else {
          // Prepend a new paragraph for the chip
          const $chipPara = document.createElement('p');
          $chipPara.className = 'md-paragraph';
          $chipPara.appendChild($senderChip);
          fragment.insertBefore($chipPara, fragment.firstChild);
        }
      }

      // Append the rendered markdown
      $body.appendChild(fragment);

      // Create token chips for each insertion point
      for (
        let index = 0;
        index < Math.min(insertionPoints.length, names.length);
        index += 1
      ) {
        assert.typeof(names[index], 'string');
        const edgeName = names[index];
        const $slot = insertionPoints[index];

        const $token = document.createElement('span');
        $token.className = 'token';
        $token.tabIndex = 0;
        $token.setAttribute('role', 'button');
        $token.title = 'Open value';

        const $name = document.createElement('b');
        $name.innerText = `@${edgeName}`;
        $token.appendChild($name);

        const updateHoverTitle = async () => {
          const id = message.ids?.[index];
          if (!id) return;
          try {
            const petNames = await E(powers).reverseIdentify(id);
            if (Array.isArray(petNames) && petNames.length > 0) {
              $token.title = petNames.join(', ');
            }
          } catch {
            // Keep default title on failure.
          }
        };

        const openValue = async () => {
          const valueId = message.ids?.[index];
          if (!valueId) {
            $error.innerText = ' Value not available';
            return;
          }
          try {
            const value = await E(powers).lookupById(valueId);
            // Pass message context for title display
            showValue(value, valueId, undefined, { number, edgeName });
          } catch (error) {
            $error.innerText = ` ${/** @type {Error} */ (error).message}`;
          }
        };

        $token.addEventListener('click', () => {
          openValue();
        });

        $token.addEventListener('keydown', event => {
          if (event.repeat || event.metaKey) return;
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            openValue();
          }
        });

        updateHoverTitle();

        // Replace the placeholder slot with the token
        $slot.replaceWith($token);
      }
    } else if (
      message.type === 'eval-proposal-reviewer' ||
      message.type === 'eval-proposal-proposer'
    ) {
      const {
        source,
        codeNames,
        edgeNames,
        workerName,
        settled,
        resultId,
        result,
      } = message;
      const resultName = /** @type {string | undefined} */ (
        'resultName' in message ? message.resultName : undefined
      );
      assert(typeof source === 'string');
      assert(Array.isArray(codeNames));
      assert(Array.isArray(edgeNames));

      // Create proposal container
      const $proposal = document.createElement('div');
      $proposal.className = 'eval-proposal-message';

      // Inject sender/recipient chip
      if ($senderChip) {
        const $chipLine = document.createElement('div');
        $chipLine.className = 'eval-proposal-from';
        $chipLine.appendChild($senderChip);
        $chipLine.appendChild(
          document.createTextNode(' proposes to evaluate:'),
        );
        $proposal.appendChild($chipLine);
      }

      // Render the source code in a code fence
      const $codeWrapper = document.createElement('div');
      $codeWrapper.className = 'md-paragraph md-code-fence-wrapper';
      const $pre = document.createElement('pre');
      $pre.className = 'md-code-fence';

      const $label = document.createElement('span');
      $label.className = 'md-code-fence-language';
      $label.textContent = 'javascript';
      $pre.appendChild($label);

      const $code = document.createElement('code');
      $code.className = 'language-javascript';
      $code.dataset.language = 'javascript';
      $code.appendChild(highlightCode(source, 'javascript'));
      $pre.appendChild($code);
      $codeWrapper.appendChild($pre);
      $proposal.appendChild($codeWrapper);

      // Show endowments mapping or "no further endowments" note
      const $endowments = document.createElement('div');
      $endowments.className = 'eval-proposal-endowments';

      if (codeNames.length > 0) {
        const $endowmentsLabel = document.createElement('div');
        $endowmentsLabel.className = 'eval-proposal-endowments-label';
        $endowmentsLabel.textContent = 'Endowments:';
        $endowments.appendChild($endowmentsLabel);

        const $endowmentsList = document.createElement('div');
        $endowmentsList.className = 'eval-proposal-endowments-list';
        for (let i = 0; i < codeNames.length; i += 1) {
          const $mapping = document.createElement('div');
          $mapping.className = 'eval-proposal-mapping';

          const $codeName = document.createElement('code');
          $codeName.textContent = codeNames[i];
          $mapping.appendChild($codeName);

          const $arrow = document.createElement('span');
          $arrow.textContent = ' ← ';
          $mapping.appendChild($arrow);

          const $edgeName = document.createElement('span');
          $edgeName.className = 'token';
          const $nameB = document.createElement('b');
          $nameB.textContent = `@${edgeNames[i]}`;
          $edgeName.appendChild($nameB);
          $mapping.appendChild($edgeName);

          $endowmentsList.appendChild($mapping);
        }
        $endowments.appendChild($endowmentsList);
      } else {
        const $noEndowments = document.createElement('div');
        $noEndowments.className = 'eval-proposal-no-endowments';
        $noEndowments.textContent = 'No further endowments';
        $endowments.appendChild($noEndowments);
      }
      $proposal.appendChild($endowments);

      // Show worker and result name if provided
      if (workerName || resultName) {
        const $options = document.createElement('div');
        $options.className = 'eval-proposal-options';
        if (workerName) {
          const $worker = document.createElement('span');
          $worker.textContent = `Worker: ${workerName}`;
          $options.appendChild($worker);
        }
        if (resultName) {
          if (workerName) {
            $options.appendChild(document.createTextNode('  '));
          }
          const $result = document.createElement('span');
          $result.textContent = `Result: ${resultName}`;
          $options.appendChild($result);
        }
        $proposal.appendChild($options);
      }

      // Actions section - different for sender vs receiver
      const $actions = document.createElement('div');
      $actions.className = 'eval-proposal-actions';

      const makeShowResultButton = () => {
        const $showResult = document.createElement('button');
        $showResult.className = 'eval-proposal-show-result';
        $showResult.textContent = 'Show Result';
        $showResult.title = 'Show the evaluation result';
        $showResult.addEventListener('click', () => {
          if (resultId && result) {
            Promise.all([resultId, result]).then(
              ([id, value]) => {
                if (!id) {
                  $error.innerText = ' Result is not available.';
                  return;
                }
                showValue(value, id, undefined, {
                  number,
                  edgeName: 'result',
                });
              },
              (/** @type {Error} */ error) => {
                $error.innerText = ` ${error.message}`;
              },
            );
            return;
          }
          if (resultName) {
            const resultPath = /** @type {[string, ...string[]]} */ (
              resultName.split('.')
            );
            Promise.all([
              E(powers).identify(...resultPath),
              E(powers).lookup(resultPath),
            ]).then(
              ([id, value]) => {
                if (!id) {
                  $error.innerText = ' Result is not available.';
                  return;
                }
                showValue(value, id, resultPath, {
                  number,
                  edgeName: resultName,
                });
              },
              (/** @type {Error} */ error) => {
                $error.innerText = ` ${error.message}`;
              },
            );
            return;
          }
          $error.innerText = ' No result is available.';
        });
        return $showResult;
      };

      if (isSent) {
        // Sender view - show status/result after receiver acts
        settled.then(status => {
          $actions.innerHTML = '';
          if (status === 'fulfilled') {
            $actions.appendChild(makeShowResultButton());
          } else {
            const $status = document.createElement('span');
            $status.className = 'eval-proposal-status';
            $status.classList.add('status-rejected');
            $status.textContent = 'Rejected';
            $actions.appendChild($status);
          }
        });
      } else {
        // Receiver view - show Grant and Counter-proposal buttons
        const $grant = document.createElement('button');
        $grant.className = 'eval-proposal-grant';
        $grant.textContent = 'Grant';
        $grant.onclick = () => {
          E(powers)
            .grantEvaluate(number)
            .catch(error => {
              $error.innerText = ` ${error.message}`;
            });
        };
        $actions.appendChild($grant);

        const $counter = document.createElement('button');
        $counter.className = 'eval-proposal-counter';
        $counter.textContent = 'Counter-proposal';
        $counter.onclick = () => {
          // Dispatch event to open counter-proposal form with pre-filled data
          const event = new CustomEvent('open-counter-proposal', {
            bubbles: true,
            detail: {
              messageNumber: number,
              source,
              codeNames,
              edgeNames,
              workerName: workerName || 'MAIN',
              resultName: resultName || '',
            },
          });
          $counter.dispatchEvent(event);
        };
        $actions.appendChild($counter);

        const $rejectReason = document.createElement('input');
        $rejectReason.className = 'eval-proposal-reject-reason';
        $rejectReason.type = 'text';
        $rejectReason.placeholder = 'Reason (optional)';
        $actions.appendChild($rejectReason);

        const $reject = document.createElement('button');
        $reject.className = 'eval-proposal-reject';
        $reject.textContent = 'Reject';
        $reject.onclick = () => {
          const reason = $rejectReason.value.trim() || undefined;
          E(powers)
            .reject(number, reason)
            .catch(error => {
              $error.innerText = ` ${error.message}`;
            });
        };
        $actions.appendChild($reject);

        // Replace buttons with status when settled
        settled.then(status => {
          // Capture reason before clearing (only available if we rejected it)
          const rejectionReason = $rejectReason.value.trim();

          // Clear existing buttons
          $actions.innerHTML = '';

          const $status = document.createElement('span');
          $status.className = 'eval-proposal-status';

          if (status === 'fulfilled') {
            $status.classList.add('status-granted');
            $status.textContent = 'Granted';
          } else {
            $status.classList.add('status-rejected');
            $status.textContent = 'Rejected';
          }

          $actions.appendChild($status);

          // Show rejection reason if available
          if (status === 'rejected' && rejectionReason) {
            const $reason = document.createElement('span');
            $reason.className = 'eval-proposal-rejection-reason';
            $reason.textContent = `: ${rejectionReason}`;
            $actions.appendChild($reason);
          }

          if (status === 'fulfilled') {
            $actions.appendChild(makeShowResultButton());
          }
        });
      }

      $proposal.appendChild($actions);
      $body.appendChild($proposal);
    }

    $parent.insertBefore($message, $end);

    if (wasAtEnd) {
      $parent.scrollTo(0, $parent.scrollHeight);
    }
  }
};
