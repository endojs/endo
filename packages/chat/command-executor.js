// @ts-check
/* global globalThis */

import harden from '@endo/harden';

/** @import { ERef } from '@endo/far' */
/** @import { EndoHost } from '@endo/daemon' */

import { E } from '@endo/far';

import { makeBrowserTree, checkoutToDirectory } from './browser-tree.js';

/**
 * @typedef {object} CommandResult
 * @property {boolean} success - Whether the command succeeded
 * @property {unknown} [value] - Result value (for show, list, etc.)
 * @property {string} [message] - User-friendly message
 * @property {Error} [error] - Error if failed
 */

/**
 * @typedef {object} ExecutorContext
 * @property {ERef<EndoHost>} powers - The powers object
 * @property {(value: unknown, id?: string, petNamePath?: string[], messageContext?: { number: bigint, edgeName: string }) => unknown} showValue - Display a value
 * @property {(message: string) => unknown} showMessage - Display a message
 * @property {(error: Error) => unknown} showError - Display an error
 * @property {() => unknown | null} [getChannelRef] - Returns channel ref when in channel mode
 * @property {(petNamePath: string, readOnly: boolean) => Promise<void>} [openBlobViewer] - Open blob viewer/editor
 * @property {(workerRef: unknown, label: string) => void} [openDebugger] - Open debugger panel for a worker
 */

/**
 * Create a command executor bound to powers.
 *
 * @param {ExecutorContext} context
 */
export const createCommandExecutor = ({
  powers,
  showValue,
  showMessage,
  showError,
  getChannelRef,
  openBlobViewer,
  openDebugger,
}) => {
  /**
   * Execute a command with the given parameters.
   *
   * @param {string} commandName - The command name
   * @param {Record<string, unknown>} params - Command parameters
   * @returns {Promise<CommandResult>}
   */
  const execute = async (commandName, params) => {
    console.log(`[Chat] Executing /${commandName}`, params);
    try {
      switch (commandName) {
        // ============ MESSAGING ============
        case 'request': {
          const { recipient, description, resultName } = params;
          // Split dot-notation names into paths for the request API
          const recipientPath = String(recipient).split('/');
          const resultPath = resultName
            ? String(resultName).split('/')
            : undefined;
          await E(powers).request(
            recipientPath,
            String(description),
            resultPath,
          );
          return { success: true, message: 'Request sent' };
        }

        case 'dismiss': {
          const { messageNumber } = params;
          await E(powers).dismiss(
            BigInt(/** @type {number} */ (messageNumber)),
          );
          return {
            success: true,
            message: `Message #${messageNumber} dismissed`,
          };
        }

        case 'clear': {
          await E(powers).dismissAll();
          return {
            success: true,
            message: 'All messages dismissed',
          };
        }

        case 'adopt': {
          const { messageNumber, edgeName, petName } = params;
          const targetNameStr = petName ? String(petName) : String(edgeName);
          const targetNamePath = targetNameStr.split('/');

          // In channel mode, adopt from channel message by formula ID
          const channelRef = getChannelRef ? getChannelRef() : null;
          if (channelRef) {
            const channelMessages = await E(channelRef).listMessages();
            const targetNumber = BigInt(/** @type {number} */ (messageNumber));
            const msg = channelMessages.find(
              (/** @type {{ number: bigint }} */ m) =>
                m.number === targetNumber,
            );
            if (!msg) {
              throw new Error(`Channel message #${messageNumber} not found`);
            }
            const msgNames = /** @type {string[]} */ (
              /** @type {any} */ (msg).names ||
                /** @type {any} */ (msg).edgeNames ||
                []
            );
            const msgIds = /** @type {string[]} */ (
              /** @type {any} */ (msg).ids || []
            );
            const edgeIndex = msgNames.indexOf(String(edgeName));
            if (edgeIndex === -1) {
              throw new Error(
                `No edge named "${edgeName}" in channel message #${messageNumber}`,
              );
            }
            const formulaId = msgIds[edgeIndex];
            if (!formulaId) {
              throw new Error(
                `No formula ID for edge "${edgeName}" in channel message #${messageNumber}`,
              );
            }
            // Write the formula ID into the user's pet store
            await E(powers).storeLocator(targetNamePath, formulaId);
            return { success: true, message: `Adopted as "${targetNameStr}"` };
          }

          // Inbox mode: use the host's adopt method
          await E(powers).adopt(
            BigInt(/** @type {number} */ (messageNumber)),
            String(edgeName),
            targetNamePath,
          );
          return { success: true, message: `Adopted as "${targetNameStr}"` };
        }

        case 'resolve': {
          const { messageNumber, petName } = params;
          await E(powers).resolve(
            BigInt(/** @type {number} */ (messageNumber)),
            String(petName),
          );
          return {
            success: true,
            message: `Request #${messageNumber} resolved`,
          };
        }

        case 'reject': {
          const { messageNumber, reason } = params;
          await E(powers).reject(
            BigInt(/** @type {number} */ (messageNumber)),
            reason ? String(reason) : undefined,
          );
          return {
            success: true,
            message: `Request #${messageNumber} rejected`,
          };
        }

        case 'reply': {
          const { messageNumber, message } = params;
          const { strings, edgeNames, petNames } =
            /** @type {{ strings: string[], edgeNames: string[], petNames: string[] }} */ (
              message
            );

          // In channel mode, post to channel with replyTo
          const channelRef = getChannelRef ? getChannelRef() : null;
          if (channelRef) {
            // Resolve pet names to formula IDs for the channel
            const resolvedIds = await Promise.all(
              petNames.map(async petName => {
                const petPath = petName.split('/');
                const id = await E(powers).identify(
                  .../** @type {[string, ...string[]]} */ (petPath),
                );
                return id || '';
              }),
            );
            await E(channelRef).post(
              strings,
              edgeNames,
              petNames,
              String(messageNumber),
              resolvedIds,
            );
            return {
              success: true,
              message: `Reply sent to channel message #${messageNumber}`,
            };
          }

          // Inbox mode: use the host's reply method
          await E(powers).reply(
            BigInt(/** @type {number} */ (messageNumber)),
            strings,
            edgeNames,
            petNames,
          );
          return {
            success: true,
            message: `Reply sent to message #${messageNumber}`,
          };
        }

        case 'form': {
          const { recipient, description, fields: fieldDefs } = params;
          const recipientPath = String(recipient).split('/');
          const fields = /** @type {Array<{name: string, label: string}>} */ (
            fieldDefs
          ).map(f => ({
            name: String(f.name).trim(),
            label: String(f.label).trim(),
          }));
          await E(powers).form(recipientPath, String(description), fields);
          return { success: true, message: 'Form sent' };
        }

        case 'submit': {
          const { messageNumber } = params;
          // Submit is typically called from the inline form UI with values,
          // but the /submit command just validates the message exists.
          // Actual value submission happens via the inbox form UI.
          await E(powers).submit(
            BigInt(/** @type {number} */ (messageNumber)),
            {},
          );
          return {
            success: true,
            message: `Values submitted for form #${messageNumber}`,
          };
        }

        case 'define': {
          const { source, slots: slotPairs = [] } = params;
          /** @type {Record<string, { label: string }>} */
          const slots = {};
          for (const pair of /** @type {Array<{codeName: string, label: string}>} */ (
            slotPairs
          )) {
            slots[pair.codeName] = { label: pair.label };
          }
          await E(powers).define(String(source), slots);
          return {
            success: true,
            message: 'Definition sent to host',
          };
        }

        case 'endow': {
          const {
            messageNumber,
            bindings: bindingPairs = [],
            resultName,
            workerName = '@main',
          } = params;
          /** @type {Record<string, string>} */
          const bindings = {};
          for (const pair of /** @type {Array<{codeName: string, petName: string}>} */ (
            bindingPairs
          )) {
            bindings[pair.codeName] = pair.petName;
          }
          await E(powers).endow(
            BigInt(/** @type {number} */ (messageNumber)),
            bindings,
            String(workerName),
            resultName ? String(resultName) : undefined,
          );
          return {
            success: true,
            message: `Definition #${messageNumber} endowed`,
          };
        }

        // ============ EXECUTION ============
        case 'eval':
        case 'js': {
          const {
            source,
            endowments = [],
            resultName,
            workerName = '@main',
          } = params;
          const codeNames =
            /** @type {Array<{codeName: string, petName: string}>} */ (
              endowments
            ).map(e => e.codeName);
          // Split dot-notation pet names into paths for the evaluate API
          const petNamePaths =
            /** @type {Array<{codeName: string, petName: string}>} */ (
              endowments
            ).map(e => e.petName.split('/'));
          const resultPath = resultName
            ? String(resultName).split('/')
            : undefined;

          const result = await E(powers).evaluate(
            String(workerName),
            String(source),
            codeNames,
            petNamePaths,
            resultPath,
          );

          if (resultName) {
            return {
              success: true,
              message: `Result saved as "${resultName}"`,
              value: result,
            };
          }
          return { success: true, value: result };
        }

        // ============ NAMING/STORAGE ============
        case 'ls':
        case 'list': {
          const { path } = params;
          const pathParts = path ? String(path).split('/') : [];
          const names = await E(powers).list(...pathParts);
          const sortedNames = harden([...names].sort());
          showValue(sortedNames, undefined, undefined, undefined);
          return { success: true, value: sortedNames };
        }

        case 'show': {
          const { petName } = params;
          const pathParts = String(petName).split('/');
          const value = await E(powers).lookup(pathParts);
          const id = await E(powers).identify(...pathParts);
          showValue(value, id, pathParts, undefined);
          return { success: true, value };
        }

        case 'rm':
        case 'remove': {
          const { petName, petNames } = params;
          // Support both single petName (legacy) and petNames array (new)
          const paths = /** @type {unknown[]} */ (petNames || [petName]);
          const results = await Promise.all(
            paths.map(async name => {
              const pathParts = String(name).split('/');
              await E(powers).remove(...pathParts);
              return name;
            }),
          );
          const message =
            results.length === 1
              ? `"${results[0]}" removed`
              : `Removed ${results.length} names: ${results.map(n => `"${n}"`).join(', ')}`;
          return { success: true, message };
        }

        case 'mv':
        case 'move': {
          const { fromName, toName } = params;
          const fromPath = String(fromName).split('/');
          const toPath = String(toName).split('/');
          await E(powers).move(fromPath, toPath);
          return {
            success: true,
            message: `"${fromName}" moved to "${toName}"`,
          };
        }

        case 'cp':
        case 'copy': {
          const { fromName, toName } = params;
          const fromPath = String(fromName).split('/');
          const toPath = String(toName).split('/');
          await E(powers).copy(fromPath, toPath);
          return {
            success: true,
            message: `"${fromName}" copied to "${toName}"`,
          };
        }

        case 'locate': {
          const { petName } = params;
          const pathParts = String(petName).split('/');
          let locator = await E(powers).locate(
            .../** @type {[string, ...string[]]} */ (pathParts),
          );
          if (locator === undefined) {
            throw new Error(`No value found for "${petName}"`);
          }

          // Invitations have their own locate() that includes the
          // required 'from' parameter for acceptance.  The generic
          // directory locate() omits it, producing a broken link.
          if (String(locator).includes('type=invitation')) {
            try {
              const ref = await E(powers).lookup(
                .../** @type {[string, ...string[]]} */ (pathParts),
              );
              locator = await E(ref).locate();
            } catch {
              // Fall back to the generic locator
            }
          }

          showValue(locator, undefined, undefined, undefined);
          return { success: true, value: locator };
        }

        case 'mkdir': {
          const { petName } = params;
          const pathParts = String(petName).split('/');
          await E(powers).makeDirectory(pathParts);
          return { success: true, message: `Directory "${petName}" created` };
        }

        case 'mount': {
          const { path: mountPath, petName } = params;
          const petNamePath = String(petName).split('/');
          await E(powers).provideMount(
            String(mountPath),
            petNamePath,
            harden({ readOnly: false }),
          );
          return {
            success: true,
            message: `Mounted "${mountPath}" as "${petName}"`,
          };
        }

        case 'mktmp': {
          const { petName } = params;
          const petNamePath = String(petName).split('/');
          await E(powers).provideScratchMount(petNamePath);
          return {
            success: true,
            message: `Scratch space "${petName}" created`,
          };
        }

        case 'dm': {
          const { recipient, message } = params;
          await E(powers).send(String(recipient), [String(message)], [], []);
          return {
            success: true,
            message: `Direct message sent to "${recipient}"`,
          };
        }

        case 'ci':
        case 'checkin': {
          const { petName } = params;
          const petNamePath = String(petName).split('/');
          if (typeof globalThis.showDirectoryPicker !== 'function') {
            throw new Error('Directory picker not available in this browser');
          }
          const dirHandle = await globalThis.showDirectoryPicker({
            mode: 'read',
          });
          const progress = { files: 0 };
          const tree = makeBrowserTree(dirHandle, {
            onFile: () => {
              progress.files += 1;
            },
          });
          await E(powers).storeTree(tree, petNamePath);
          return {
            success: true,
            message: `Checked in ${progress.files} files as "${petName}"`,
          };
        }

        case 'co':
        case 'checkout': {
          const { petName } = params;
          const petNamePath = String(petName).split('/');
          if (typeof globalThis.showDirectoryPicker !== 'function') {
            throw new Error('Directory picker not available in this browser');
          }
          const tree = await E(powers).lookup(petNamePath);
          const destHandle = await globalThis.showDirectoryPicker({
            mode: 'readwrite',
          });
          const progress = { files: 0 };
          await checkoutToDirectory(tree, destHandle, {
            onFile: () => {
              progress.files += 1;
            },
          });
          return {
            success: true,
            message: `Checked out ${progress.files} files from "${petName}"`,
          };
        }

        // ============ CONNECTIONS ============
        case 'invite': {
          const {
            guestName,
            delivery = 'link',
            accessLevel = 'read-and-write',
            rateLimit = 'none',
          } = params;
          const channelRef = getChannelRef ? getChannelRef() : null;

          if (channelRef) {
            // Channel mode: use createInvitation for channel-specific invites
            console.log(
              `[Chat] Creating channel invitation for "${guestName}"...`,
            );
            const [invitation, attenuator] = await E(
              channelRef,
            ).createInvitation(String(guestName));

            // Apply access level
            if (accessLevel === 'read-only') {
              // Disable posting by setting validity to false after creation,
              // then re-enable with a strict heat config that blocks all posts
              await E(attenuator).setHeatConfig(
                harden({
                  burstLimit: 0,
                  sustainedRate: 0,
                  lockoutDurationMs: 0,
                  postLockoutPct: 100,
                }),
              );
            }

            // Apply rate limiting (only if not read-only)
            if (accessLevel !== 'read-only' && rateLimit !== 'none') {
              /** @type {Record<string, { burstLimit: number, sustainedRate: number, lockoutDurationMs: number, postLockoutPct: number }>} */
              const rateLimitPresets = {
                relaxed: {
                  burstLimit: 20,
                  sustainedRate: 30,
                  lockoutDurationMs: 30000,
                  postLockoutPct: 50,
                },
                moderate: {
                  burstLimit: 10,
                  sustainedRate: 10,
                  lockoutDurationMs: 60000,
                  postLockoutPct: 50,
                },
                strict: {
                  burstLimit: 5,
                  sustainedRate: 3,
                  lockoutDurationMs: 120000,
                  postLockoutPct: 70,
                },
              };
              const heatConfig = rateLimitPresets[String(rateLimit)];
              if (heatConfig) {
                await E(attenuator).setHeatConfig(harden(heatConfig));
              }
            }

            const accessLabel =
              accessLevel === 'read-only' ? ' (read-only)' : '';
            const rateLimitLabel =
              rateLimit !== 'none' ? `, rate limit: ${rateLimit}` : '';

            showMessage(
              `Channel invitation created for "${guestName}"${accessLabel}${rateLimitLabel}. Share the channel with them so they can join.`,
            );
            showValue(invitation, undefined, undefined, undefined);
            return {
              success: true,
              value: invitation,
              message: `Channel invitation created for "${guestName}"`,
            };
          }

          // Inbox mode: use host invite
          console.log(`[Chat] Creating invitation for "${guestName}"...`);
          const invitation = await E(powers).invite(String(guestName));

          if (delivery === 'inventory') {
            console.log(
              `[Chat] Invitation stored in inventory as "${guestName}"`,
            );
            return {
              success: true,
              message: `Invitation for "${guestName}" stored in inventory. Send it via message or use /locate to get a link.`,
            };
          }

          const locator = await E(invitation).locate();
          console.log(`[Chat] Invitation locator generated`);
          showMessage(`Invitation locator for "${guestName}":`);
          showValue(locator, undefined, undefined, undefined);
          return {
            success: true,
            value: locator,
            message: `Invitation created for "${guestName}"`,
          };
        }

        case 'accept': {
          const { locator, guestName } = params;
          console.log(
            `[Chat] Accepting invitation for "${guestName}" from ${String(locator).slice(0, 40)}...`,
          );
          const accepted = E(powers).accept(String(locator), String(guestName));
          const timeout = new Promise((_, reject) => {
            setTimeout(
              () =>
                reject(
                  new Error(
                    `Accept timed out after 60s. Ensure both nodes have networking enabled (/network or /network-libp2p).`,
                  ),
                ),
              60_000,
            );
          });
          await Promise.race([accepted, timeout]);
          console.log(`[Chat] Invitation accepted for "${guestName}"`);
          return {
            success: true,
            message: `Invitation accepted, connected as "${guestName}"`,
          };
        }

        case 'share': {
          const { petName } = params;
          const petNameStr = String(petName);
          const pathParts = petNameStr.split('/');
          console.log(
            `[Chat] Generating shareable locator for "${petNameStr}"...`,
          );
          const locator = await E(powers).locateForSharing(...pathParts);
          if (!locator) {
            throw new Error(`No value found for "${petNameStr}"`);
          }
          showMessage(`Shareable locator for "${petNameStr}":`);
          showValue(locator, undefined, undefined, undefined);
          return {
            success: true,
            value: locator,
            message: `Locator generated for "${petNameStr}"`,
          };
        }

        case 'adopt-locator': {
          const { locator, petName } = params;
          const petNameStr = String(petName);
          console.log(`[Chat] Adopting from locator as "${petNameStr}"...`);
          await E(powers).adoptFromLocator(String(locator), petNameStr);
          return {
            success: true,
            message: `Adopted as "${petNameStr}" from locator`,
          };
        }

        case 'network': {
          const effectiveModulePath =
            String(params.modulePath || '') ||
            // @ts-ignore Vite injects this at build time
            (import.meta.env?.TCP_NETSTRING_PATH ?? '');
          const effectiveHost = String(params.host || '') || '127.0.0.1';
          const effectivePort = String(params.port || '') || '8940';
          const effectiveHostPort = `${effectiveHost}:${effectivePort}`;

          if (!effectiveModulePath) {
            return {
              success: false,
              message:
                'Module path required. Provide the file:// URL to tcp-netstring.js',
            };
          }

          await E(powers).storeValue(effectiveHostPort, 'tcp-listen-addr');
          console.log(`[Chat] /network: loading module ${effectiveModulePath}`);
          await E(powers).makeUnconfined('@main', effectiveModulePath, {
            powersName: '@agent',
            resultName: 'network-service',
          });
          console.log(`[Chat] /network: moving to NETS.tcp`);
          await E(powers).move(['network-service'], ['@nets', 'tcp']);
          console.log(`[Chat] /network: TCP network ready`);
          return {
            success: true,
            message: `TCP network started on ${effectiveHostPort}`,
          };
        }

        case 'network-libp2p': {
          const effectiveModulePath =
            String(params.modulePath || '') ||
            // @ts-ignore Vite injects this at build time
            (import.meta.env?.LIBP2P_PATH ?? '');

          if (!effectiveModulePath) {
            return {
              success: false,
              message:
                'Module path required. Provide the file:// URL to libp2p.js',
            };
          }

          console.log(
            `[Chat] /network-libp2p: loading module ${effectiveModulePath}`,
          );
          // The libp2p module self-configures (bootstraps into the public
          // IPFS DHT and discovers relays automatically) so there is no
          // request/resolve step like the TCP network.
          await E(powers).makeUnconfined(undefined, effectiveModulePath, {
            powersName: '@agent',
            resultName: 'network-service-libp2p',
            workerTrustedShims: [
              '@libp2p/webrtc',
              './shims/async-generator-return.js',
            ],
          });
          console.log(`[Chat] /network-libp2p: moving to NETS.libp2p`);
          await E(powers).move(['network-service-libp2p'], ['@nets', 'libp2p']);
          console.log(`[Chat] /network-libp2p: libp2p network ready`);
          return {
            success: true,
            message:
              'libp2p network started (relay discovery may still be in progress)',
          };
        }

        case 'network-ws-relay': {
          const effectiveModulePath =
            String(params.modulePath || '') ||
            // @ts-ignore Vite injects this at build time
            (import.meta.env?.WS_RELAY_PATH ?? '');
          const relayUrl = String(params.relayUrl || '');
          const relayDomain =
            String(params.relayDomain || '') || new URL(relayUrl).hostname;

          if (!relayUrl) {
            return {
              success: false,
              message: 'Relay URL required (e.g. wss://relay.example.com)',
            };
          }

          if (!effectiveModulePath) {
            return {
              success: false,
              message:
                'Module path required. Provide the file:// URL to ws-relay.js',
            };
          }

          console.log(
            `[Chat] /network-ws-relay: connecting to relay ${relayUrl} (domain=${relayDomain})`,
          );
          await E(powers).makeUnconfined(undefined, effectiveModulePath, {
            powersName: '@agent',
            resultName: 'network-service-ws-relay',
            env: {
              WS_RELAY_URL: relayUrl,
              WS_RELAY_DOMAIN: relayDomain,
            },
          });
          console.log(`[Chat] /network-ws-relay: moving to @nets/ws-relay`);
          await E(powers).move(
            ['network-service-ws-relay'],
            ['@nets', 'ws-relay'],
          );
          console.log(`[Chat] /network-ws-relay: relay network ready`);
          return {
            success: true,
            message: `Connected to relay at ${relayUrl}`,
          };
        }

        // ============ WORKERS ============
        case 'spawn': {
          const { workerName } = params;
          const pathParts = String(workerName).split('/');
          await E(powers).provideWorker(pathParts);
          return { success: true, message: `Worker "${workerName}" spawned` };
        }

        // ============ HOSTS/GUESTS ============
        case 'mkhost':
        case 'host': {
          const { handleName, agentName } = params;
          await E(powers).provideHost(String(handleName), {
            agentName: String(agentName),
          });
          return { success: true, message: `Host "${agentName}" created` };
        }

        case 'mkguest':
        case 'guest': {
          const { handleName, agentName } = params;
          await E(powers).provideGuest(String(handleName), {
            agentName: String(agentName),
          });
          return { success: true, message: `Guest "${agentName}" created` };
        }

        // ============ VIEWER/EDITOR ============
        case 'view':
        case 'cat': {
          const { petName } = params;
          if (openBlobViewer) {
            await openBlobViewer(String(petName), true);
          }
          return { success: true };
        }

        case 'edit': {
          const { petName } = params;
          if (openBlobViewer) {
            await openBlobViewer(String(petName), false);
          }
          return { success: true };
        }

        case 'debug': {
          const { workerName } = params;
          const workerPath = String(workerName).split('/');
          const debuggerRef = await E(
            /** @type {any} */ (powers),
          ).attachDebugger(.../** @type {[string, ...string[]]} */ (workerPath));
          if (openDebugger) {
            openDebugger(debuggerRef, String(workerName));
          }
          return {
            success: true,
            message: `Debugger attached to "${workerName}"`,
          };
        }

        // ============ SYSTEM ============
        case 'cancel': {
          const { petName, reason } = params;
          const pathParts = String(petName).split('/');
          const error = reason
            ? new Error(String(reason))
            : new Error('Cancelled');
          await E(powers).cancel(pathParts, error);
          return { success: true, message: `"${petName}" cancelled` };
        }

        default:
          throw new Error(`Unknown command: ${commandName}`);
      }
    } catch (error) {
      const err = /** @type {Error} */ (error);
      console.error(`[Chat] /${commandName} failed:`, err);
      showError(err);
      return { success: false, error: err };
    }
  };

  return { execute };
};
