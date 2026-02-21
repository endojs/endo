// @ts-check

/** @import { ERef } from '@endo/far' */
/** @import { EndoHost } from '@endo/daemon' */

import { E } from '@endo/far';

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
          const recipientPath = String(recipient).split('.');
          const resultPath = resultName
            ? String(resultName).split('.')
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

        case 'dismiss-all': {
          await E(powers).dismissAll();
          return {
            success: true,
            message: 'All messages dismissed',
          };
        }

        case 'adopt': {
          const { messageNumber, edgeName, petName } = params;
          const targetNameStr = petName ? String(petName) : String(edgeName);
          // Interface expects petName as string[]
          const targetNamePath = targetNameStr.split('.');
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

        case 'grant':
        case 'allow': {
          const { messageNumber } = params;
          await E(powers).grantEvaluate(
            BigInt(/** @type {number} */ (messageNumber)),
          );
          return {
            success: true,
            message: `Eval-proposal #${messageNumber} granted`,
          };
        }

        case 'approve-eval': {
          const { messageNumber, workerName } = params;
          await E(powers).approveEvaluation(
            BigInt(/** @type {number} */ (messageNumber)),
            workerName ? String(workerName) : undefined,
          );
          return {
            success: true,
            message: `Eval request #${messageNumber} approved`,
          };
        }

        // ============ EXECUTION ============
        case 'eval':
        case 'js': {
          const {
            source,
            endowments = [],
            resultName,
            workerName = 'MAIN',
          } = params;
          const codeNames =
            /** @type {Array<{codeName: string, petName: string}>} */ (
              endowments
            ).map(e => e.codeName);
          // Split dot-notation pet names into paths for the evaluate API
          const petNamePaths =
            /** @type {Array<{codeName: string, petName: string}>} */ (
              endowments
            ).map(e => e.petName.split('.'));
          const resultPath = resultName
            ? String(resultName).split('.')
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
          const pathParts = path ? String(path).split('.') : [];
          const names = await E(powers).list(...pathParts);
          const sortedNames = harden([...names].sort());
          showValue(sortedNames, undefined, undefined, undefined);
          return { success: true, value: sortedNames };
        }

        case 'show': {
          const { petName } = params;
          const pathParts = String(petName).split('.');
          // @ts-expect-error lookup signature expects tuple
          const value = await E(powers).lookup(...pathParts);
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
              const pathParts = String(name).split('.');
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
          const fromPath = String(fromName).split('.');
          const toPath = String(toName).split('.');
          await E(powers).move(fromPath, toPath);
          return {
            success: true,
            message: `"${fromName}" moved to "${toName}"`,
          };
        }

        case 'cp':
        case 'copy': {
          const { fromName, toName } = params;
          const fromPath = String(fromName).split('.');
          const toPath = String(toName).split('.');
          await E(powers).copy(fromPath, toPath);
          return {
            success: true,
            message: `"${fromName}" copied to "${toName}"`,
          };
        }

        case 'mkdir': {
          const { petName } = params;
          const pathParts = String(petName).split('.');
          // @ts-expect-error spread argument requires tuple type
          await E(powers).makeDirectory(...pathParts);
          return { success: true, message: `Directory "${petName}" created` };
        }

        // ============ CONNECTIONS ============
        case 'invite': {
          const { guestName } = params;
          console.log(`[Chat] Creating invitation for "${guestName}"...`);
          const invitation = await E(powers).invite(String(guestName));
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
          const accepted = E(powers).accept(
            String(locator),
            String(guestName),
          );
          const timeout = new Promise((_, reject) => {
            setTimeout(
              () =>
                reject(
                  new Error(
                    `Accept timed out after 30s. Ensure both nodes have TCP networking enabled (/network).`,
                  ),
                ),
              30_000,
            );
          });
          await Promise.race([accepted, timeout]);
          console.log(`[Chat] Invitation accepted for "${guestName}"`);
          return {
            success: true,
            message: `Invitation accepted, connected as "${guestName}"`,
          };
        }

        case 'network': {
          const effectiveModulePath =
            String(params.modulePath || '') ||
            // @ts-ignore Vite injects this at build time
            (import.meta.env?.TCP_NETSTRING_PATH ?? '');
          const effectiveHostPort =
            String(params.hostPort || '') || 'localhost:0';

          if (!effectiveModulePath) {
            return {
              success: false,
              message:
                'Module path required. Provide the file:// URL to tcp-netstring.js',
            };
          }

          console.log(
            `[Chat] /network: loading module ${effectiveModulePath}`,
          );
          const network = E(powers).makeUnconfined(
            'MAIN',
            effectiveModulePath,
            {
              powersName: 'AGENT',
              resultName: 'network-service',
            },
          );
          console.log(`[Chat] /network: waiting for port request message...`);
          const iteratorRef = E(powers).followMessages();
          const existingMessages = /** @type {unknown[]} */ (
            await E(powers).listMessages()
          );
          for (let i = 0; i < existingMessages.length; i += 1) {
            // eslint-disable-next-line no-await-in-loop
            await E(iteratorRef).next();
          }
          const { value: message } = await E(iteratorRef).next();
          const { number } = E.get(message);
          console.log(
            `[Chat] /network: resolving port request with "${effectiveHostPort}"`,
          );
          await E(powers).storeValue(effectiveHostPort, 'netport');
          await E(powers).resolve(await number, 'netport');
          console.log(
            `[Chat] /network: waiting for network module to start...`,
          );
          await network;
          console.log(`[Chat] /network: moving to NETS.tcp`);
          await E(powers).move(['network-service'], ['NETS', 'tcp']);
          console.log(`[Chat] /network: TCP network ready`);
          return {
            success: true,
            message: `TCP network started on ${effectiveHostPort}`,
          };
        }

        // ============ WORKERS ============
        case 'spawn': {
          const { workerName } = params;
          const pathParts = String(workerName).split('.');
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

        // ============ SYSTEM ============
        case 'cancel': {
          const { petName, reason } = params;
          const pathParts = String(petName).split('.');
          const error = reason
            ? new Error(String(reason))
            : new Error('Cancelled');
          // @ts-expect-error cancel expects string, not string[]
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
