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
import { render as renderValue } from './value-render.js';

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

  /** Map from form messageId to its description, for value message rendering. */
  /** @type {Map<string, string>} */
  const formDescriptions = new Map();
  /** @type {Map<string, Array<{name: string, secret: boolean}>>} */
  const formFieldMeta = new Map();

  // Schedule a hard scroll-to-bottom shortly after messages start arriving.
  // The existing message backlog arrives rapidly via the iterator; this
  // timer fires once the initial batch has been rendered, ensuring the
  // user lands at the latest message when switching to the inbox.
  let initialScrollTimer = setTimeout(() => {
    $parent.scrollTo(0, $parent.scrollHeight);
    initialScrollTimer = 0;
  }, 150);

  const selfLocator = await E(powers).locate('@self');
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

    const isSent = fromId === selfLocator;

    if (conversationId) {
      const otherPartyId = isSent ? toId : fromId;
      if (otherPartyId !== conversationId) {
        // Self-to-self messages (e.g. endow result delivery) belong to a
        // conversation when their replyTo references a message already in
        // this conversation thread.
        const replyTo =
          'replyTo' in message
            ? /** @type {string} */ (message.replyTo)
            : undefined;
        if (
          fromId === selfLocator &&
          toId === selfLocator &&
          replyTo &&
          $parent.querySelector(
            `.message-envelope[data-message-id="${CSS.escape(replyTo)}"]`,
          )
        ) {
          // falls through — include in this conversation
        } else if (conversationPetName) {
          // ID didn't match directly — try matching by pet name
          // (handles peer/remote/guest formula indirection)
          // eslint-disable-next-line no-await-in-loop
          const names = await E(powers).reverseLocate(otherPartyId);
          if (
            !Array.isArray(names) ||
            !names.includes(
              /** @type {import('@endo/daemon').Name} */ (conversationPetName),
            )
          ) {
            // eslint-disable-next-line no-continue
            continue;
          }
        } else {
          // eslint-disable-next-line no-continue
          continue;
        }
      }
    }

    const $envelope = document.createElement('div');
    $envelope.className = 'message-envelope';
    $envelope.dataset.number = String(number);
    if (message.messageId) {
      $envelope.dataset.messageId = String(message.messageId);
    }
    if (message.replyTo) {
      $envelope.dataset.replyTo = String(message.replyTo);
    }

    const $message = document.createElement('div');
    $message.className = isSent ? 'message sent' : 'message';

    const $error = document.createElement('span');
    $error.style.color = 'red';
    $error.innerText = '';

    dismissed.then(() => {
      $envelope.remove();
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
      const fromNames = await E(powers).reverseLocate(fromId);
      const fromName = fromNames?.[0];
      if (fromName !== undefined) {
        $senderChip = document.createElement('b');
        $senderChip.innerText = `@${fromName}`;
      }
    } else {
      const toNames = await E(powers).reverseLocate(toId);
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
            const petNames = await E(powers).reverseLocate(id);
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
      const { source, codeNames, edgeNames, workerName } = message;
      // settled, resultId, and result are only present on reviewer
      // messages; the proposer's sent receipt omits them.
      const settled = 'settled' in message ? message.settled : undefined;
      const resultId = 'resultId' in message ? message.resultId : undefined;
      const result = 'result' in message ? message.result : undefined;
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
              resultName.split('/')
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
        // Sender view — the proposer's sent receipt does not include
        // settled/result promises, so show a static label.  If the
        // proposer specified a resultName, the result is written to
        // their directory once the reviewer grants.
        const $status = document.createElement('span');
        $status.className = 'eval-proposal-status';
        $status.textContent = 'Proposed';
        $actions.appendChild($status);
        if (resultName) {
          $actions.appendChild(makeShowResultButton());
        }
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
              workerName: workerName || '@main',
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

        // Replace buttons with status when settled (reviewer messages only)
        if (settled)
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
    } else if (message.type === 'definition') {
      const { source, slots } = message;
      assert(typeof source === 'string');

      const $definition = document.createElement('div');
      $definition.className = 'eval-proposal-message';

      // Sender chip
      if ($senderChip) {
        const $chipLine = document.createElement('div');
        $chipLine.className = 'eval-proposal-from';
        $chipLine.appendChild($senderChip);
        $chipLine.appendChild(document.createTextNode(' proposes to define:'));
        $definition.appendChild($chipLine);
      }

      // Source code
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
      $definition.appendChild($codeWrapper);

      // Slot bindings
      const slotEntries = Object.entries(
        /** @type {Record<string, { label: string }>} */ (slots),
      );
      /** @type {Record<string, HTMLInputElement>} */
      const slotInputs = {};

      if (slotEntries.length > 0) {
        const $slotsSection = document.createElement('div');
        $slotsSection.className = 'eval-proposal-endowments';

        const $slotsLabel = document.createElement('div');
        $slotsLabel.className = 'eval-proposal-endowments-label';
        $slotsLabel.textContent = 'Slots to fill:';
        $slotsSection.appendChild($slotsLabel);

        const $slotsList = document.createElement('div');
        $slotsList.className = 'eval-proposal-endowments-list';

        for (const [codeName, { label }] of slotEntries) {
          const $row = document.createElement('div');
          $row.className = 'eval-proposal-mapping';

          const $codeName = document.createElement('code');
          $codeName.textContent = codeName;
          $row.appendChild($codeName);

          const $arrow = document.createElement('span');
          $arrow.textContent = ' ← ';
          $row.appendChild($arrow);

          const $input = document.createElement('input');
          $input.type = 'text';
          $input.className = 'eval-proposal-reject-reason';
          $input.placeholder = label;
          $row.appendChild($input);
          slotInputs[codeName] = $input;

          $slotsList.appendChild($row);
        }
        $slotsSection.appendChild($slotsList);
        $definition.appendChild($slotsSection);
      }

      // Actions
      const $actions = document.createElement('div');
      $actions.className = 'eval-proposal-actions';

      if (!isSent) {
        const doSubmit = () => {
          /** @type {Record<string, string>} */
          const bindings = {};
          for (const [codeName, $input] of Object.entries(slotInputs)) {
            const val = $input.value.trim();
            if (!val) {
              $error.innerText = ` Missing binding for ${codeName}`;
              return;
            }
            bindings[codeName] = val;
          }
          $error.innerText = '';
          E(powers)
            .endow(number, bindings)
            .catch(error => {
              $error.innerText = ` ${error.message}`;
            });
        };

        // Enter key in any slot input submits the form
        for (const $input of Object.values(slotInputs)) {
          $input.addEventListener('keydown', e => {
            if (e.key === 'Enter') {
              e.preventDefault();
              doSubmit();
            }
          });
        }

        const $submit = document.createElement('button');
        $submit.className = 'eval-proposal-grant';
        $submit.textContent = 'Submit';
        $submit.onclick = doSubmit;
        $actions.appendChild($submit);
      }

      $definition.appendChild($actions);
      $body.appendChild($definition);
    } else if (message.type === 'form') {
      const { description, fields, messageId: formMsgId } = message;
      formDescriptions.set(String(formMsgId), String(description));
      formFieldMeta.set(
        String(formMsgId),
        fields.map(f => ({
          name: /** @type {{name: string}} */ (f).name,
          secret: /** @type {{secret?: boolean}} */ (f).secret === true,
        })),
      );

      const $form = document.createElement('div');
      $form.className = 'form-request-message';

      // Sender chip + description
      const $desc = document.createElement('div');
      $desc.className = 'form-request-description';
      if ($senderChip) {
        $desc.appendChild($senderChip);
        $desc.appendChild(document.createTextNode(' '));
      }
      $desc.appendChild(
        document.createTextNode(
          `${isSent ? 'form' : 'sent form'}: ${JSON.stringify(description)}`,
        ),
      );
      $form.appendChild($desc);

      // Show fields as read-only list
      const $fieldsContainer = document.createElement('div');
      $fieldsContainer.className = 'form-request-fields';

      const fieldArray =
        /** @type {Array<{name: string, label: string, example?: string, default?: string, secret?: boolean}>} */ (
          fields
        );

      /** @type {Record<string, HTMLInputElement>} */
      const fieldInputs = {};
      for (const field of fieldArray) {
        const $row = document.createElement('div');
        $row.className = 'form-request-field-row';

        const $label = document.createElement('label');
        $label.className = 'form-request-field-label';
        $label.textContent = field.label || field.name;

        const $input = document.createElement('input');
        $input.type = field.secret ? 'password' : 'text';
        $input.className = 'form-request-field-input';
        $input.placeholder = field.example || field.name;
        if (field.default) {
          $input.value = field.default;
        }
        $input.autocomplete = 'off';
        $input.dataset.formType = 'other';
        $input.dataset.lpignore = 'true';

        fieldInputs[field.name] = $input;
        $row.appendChild($label);

        if (field.secret) {
          const $group = document.createElement('div');
          $group.className = 'form-field-input-group';
          $group.appendChild($input);

          const $toggle = document.createElement('button');
          $toggle.type = 'button';
          $toggle.className = 'form-field-toggle';
          $toggle.textContent = 'Show';
          $toggle.onclick = () => {
            const hidden = $input.type === 'password';
            $input.type = hidden ? 'text' : 'password';
            $toggle.textContent = hidden ? 'Hide' : 'Show';
          };
          $group.appendChild($toggle);

          const $copy = document.createElement('button');
          $copy.type = 'button';
          $copy.className = 'form-field-copy';
          $copy.textContent = 'Copy';
          $copy.onclick = () => {
            navigator.clipboard.writeText($input.value);
            $copy.textContent = 'Copied';
            setTimeout(() => {
              $copy.textContent = 'Copy';
            }, 1500);
          };
          $group.appendChild($copy);

          $row.appendChild($group);
        } else {
          $row.appendChild($input);
        }
        $fieldsContainer.appendChild($row);
      }
      $form.appendChild($fieldsContainer);

      // Actions
      const $actions = document.createElement('div');
      $actions.className = 'form-request-actions';

      const $submitBtn = document.createElement('button');
      $submitBtn.className = 'form-request-submit';
      $submitBtn.textContent = 'Submit';
      const submitForm = () => {
        /** @type {Record<string, string>} */
        const values = {};
        for (const field of fieldArray) {
          values[field.name] = fieldInputs[field.name].value;
        }
        E(powers)
          .submit(number, values)
          .catch(err => {
            $error.innerText = ` ${/** @type {Error} */ (err).message}`;
          });
      };
      $submitBtn.onclick = submitForm;
      $actions.appendChild($submitBtn);

      $fieldsContainer.addEventListener(
        'keydown',
        /** @param {KeyboardEvent} e */ e => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submitForm();
          }
        },
      );

      $form.appendChild($actions);

      $body.appendChild($form);
    } else if (message.type === 'value') {
      const { valueId } = message;
      const valueReplyTo = /** @type {string | undefined} */ (
        'replyTo' in message ? message.replyTo : undefined
      );
      const formTitle =
        valueReplyTo !== undefined
          ? formDescriptions.get(String(valueReplyTo))
          : undefined;

      const $valueMsg = document.createElement('div');
      $valueMsg.className = 'form-request-message';

      const $desc = document.createElement('div');
      $desc.className = 'form-request-description';
      if ($senderChip) {
        $desc.appendChild($senderChip);
        $desc.appendChild(document.createTextNode(' '));
      }
      const responseText =
        formTitle !== undefined
          ? `responded to form: ${JSON.stringify(formTitle)}`
          : 'responded to form';
      $desc.appendChild(document.createTextNode(responseText));
      $valueMsg.appendChild($desc);

      // Render the value inline
      const $inlineValue = document.createElement('div');
      $inlineValue.className = 'form-request-inline-value';
      $valueMsg.appendChild($inlineValue);

      const fieldMeta =
        valueReplyTo !== undefined
          ? formFieldMeta.get(String(valueReplyTo))
          : undefined;
      const secretFieldNames = new Set(
        (fieldMeta || []).filter(f => f.secret).map(f => f.name),
      );

      E(powers)
        .lookupById(valueId)
        .then(
          value => {
            if (
              secretFieldNames.size > 0 &&
              value !== null &&
              typeof value === 'object'
            ) {
              const record = /** @type {Record<string, unknown>} */ (value);
              const $fields = document.createElement('div');
              $fields.className = 'form-request-fields';
              for (const key of Object.keys(record)) {
                const $row = document.createElement('div');
                $row.className = 'form-request-field-row';

                const $label = document.createElement('span');
                $label.className = 'form-request-field-label';
                $label.textContent = key;
                $row.appendChild($label);

                if (secretFieldNames.has(key)) {
                  const $group = document.createElement('div');
                  $group.className = 'form-field-input-group';

                  const $masked = document.createElement('span');
                  $masked.className = 'form-value-secret';
                  $masked.textContent =
                    '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022';
                  $group.appendChild($masked);

                  const realValue = String(record[key]);

                  const $toggle = document.createElement('button');
                  $toggle.type = 'button';
                  $toggle.className = 'form-field-toggle';
                  $toggle.textContent = 'Show';
                  $toggle.onclick = () => {
                    const isHidden = $masked.textContent !== realValue;
                    $masked.textContent = isHidden
                      ? realValue
                      : '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022';
                    $toggle.textContent = isHidden ? 'Hide' : 'Show';
                  };
                  $group.appendChild($toggle);

                  const $copy = document.createElement('button');
                  $copy.type = 'button';
                  $copy.className = 'form-field-copy';
                  $copy.textContent = 'Copy';
                  $copy.onclick = () => {
                    navigator.clipboard.writeText(realValue);
                    $copy.textContent = 'Copied';
                    setTimeout(() => {
                      $copy.textContent = 'Copy';
                    }, 1500);
                  };
                  $group.appendChild($copy);

                  $row.appendChild($group);
                } else {
                  $row.appendChild(renderValue(record[key]));
                }
                $fields.appendChild($row);
              }
              $inlineValue.appendChild($fields);
            } else {
              $inlineValue.appendChild(renderValue(value));
            }
          },
          (/** @type {Error} */ err) => {
            $inlineValue.innerText = `Error: ${err.message}`;
          },
        );

      // Show Value button for closer inspection
      const $actions = document.createElement('div');
      $actions.className = 'form-request-actions';
      const $showResult = document.createElement('button');
      $showResult.className = 'form-request-show-result';
      $showResult.textContent = 'Show Value';
      $showResult.title = 'Inspect the submitted value';
      $showResult.addEventListener('click', () => {
        E(powers)
          .lookupById(valueId)
          .then(
            value => {
              showValue(value, valueId, undefined, {
                number,
                edgeName: 'value',
              });
            },
            (/** @type {Error} */ err) => {
              $error.innerText = ` ${err.message}`;
            },
          );
      });
      $actions.appendChild($showResult);
      $valueMsg.appendChild($actions);

      $body.appendChild($valueMsg);
    }

    $envelope.appendChild($message);
    $parent.insertBefore($envelope, $end);

    // During the initial batch, reschedule the hard scroll so it fires
    // after the last message in the backlog rather than mid-batch.
    if (initialScrollTimer) {
      clearTimeout(initialScrollTimer);
      initialScrollTimer = setTimeout(() => {
        $parent.scrollTo(0, $parent.scrollHeight);
        initialScrollTimer = 0;
      }, 50);
    } else if (wasAtEnd) {
      $parent.scrollTo(0, $parent.scrollHeight);
    }
  }
};
