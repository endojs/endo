// @ts-check

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
 * @property {unknown} powers - The powers object
 * @property {(value: unknown) => void} showValue - Display a value
 * @property {(message: string) => void} showMessage - Display a message
 * @property {(error: Error) => void} showError - Display an error
 */

/**
 * Create a command executor bound to powers.
 *
 * @param {ExecutorContext} context
 */
export const createCommandExecutor = ({ powers, showValue, showMessage, showError }) => {
  /**
   * Execute a command with the given parameters.
   *
   * @param {string} commandName - The command name
   * @param {Record<string, unknown>} params - Command parameters
   * @returns {Promise<CommandResult>}
   */
  const execute = async (commandName, params) => {
    try {
      switch (commandName) {
        // ============ MESSAGING ============
        case 'request': {
          const { recipient, description, resultName } = params;
          const recipientPath = String(recipient).split('.');
          const resultPath = resultName ? String(resultName).split('.') : undefined;
          await E(powers).request(recipientPath, String(description), resultPath);
          return { success: true, message: 'Request sent' };
        }

        case 'dismiss': {
          const { messageNumber } = params;
          await E(powers).dismiss(Number(messageNumber));
          return { success: true, message: `Message #${messageNumber} dismissed` };
        }

        case 'adopt': {
          const { messageNumber, edgeName, petName } = params;
          const targetName = petName ? String(petName) : String(edgeName);
          await E(powers).adopt(Number(messageNumber), String(edgeName), targetName);
          return { success: true, message: `Adopted as "${targetName}"` };
        }

        case 'resolve': {
          const { messageNumber, petName } = params;
          await E(powers).resolve(Number(messageNumber), String(petName));
          return { success: true, message: `Request #${messageNumber} resolved` };
        }

        case 'reject': {
          const { messageNumber, reason } = params;
          await E(powers).reject(Number(messageNumber), reason ? String(reason) : undefined);
          return { success: true, message: `Request #${messageNumber} rejected` };
        }

        // ============ EXECUTION ============
        case 'eval': {
          const { source, endowments = [], resultName, workerName = 'MAIN' } = params;
          const codeNames = /** @type {Array<{codeName: string, petName: string}>} */ (endowments).map(e => e.codeName);
          const petNamePaths = /** @type {Array<{codeName: string, petName: string}>} */ (endowments).map(e => e.petName.split('.'));
          const resultPath = resultName ? String(resultName).split('.') : undefined;

          const result = await E(powers).evaluate(
            String(workerName),
            String(source),
            codeNames,
            petNamePaths,
            resultPath,
          );

          if (resultName) {
            return { success: true, message: `Result saved as "${resultName}"`, value: result };
          }
          return { success: true, value: result };
        }

        // ============ NAMING/STORAGE ============
        case 'list': {
          const { path } = params;
          const pathParts = path ? String(path).split('.') : [];
          const names = await E(powers).list(...pathParts);
          const sortedNames = harden([...names].sort());
          showValue(sortedNames);
          return { success: true, value: sortedNames };
        }

        case 'show': {
          const { petName } = params;
          const pathParts = String(petName).split('.');
          const value = await E(powers).lookup(...pathParts);
          showValue(value);
          return { success: true, value };
        }

        case 'remove': {
          const { petName } = params;
          const pathParts = String(petName).split('.');
          await E(powers).remove(...pathParts);
          return { success: true, message: `"${petName}" removed` };
        }

        case 'move': {
          const { fromName, toName } = params;
          const fromPath = String(fromName).split('.');
          const toPath = String(toName).split('.');
          await E(powers).move(fromPath, toPath);
          return { success: true, message: `"${fromName}" moved to "${toName}"` };
        }

        case 'copy': {
          const { fromName, toName } = params;
          const fromPath = String(fromName).split('.');
          const toPath = String(toName).split('.');
          await E(powers).copy(fromPath, toPath);
          return { success: true, message: `"${fromName}" copied to "${toName}"` };
        }

        case 'mkdir': {
          const { petName } = params;
          const pathParts = String(petName).split('.');
          await E(powers).makeDirectory(...pathParts);
          return { success: true, message: `Directory "${petName}" created` };
        }

        // ============ CONNECTIONS ============
        case 'invite': {
          const { guestName } = params;
          const invitation = await E(powers).invite(String(guestName));
          return { success: true, value: invitation, message: `Invitation created for "${guestName}"` };
        }

        case 'accept': {
          const { locator, guestName } = params;
          await E(powers).accept(String(locator), String(guestName));
          return { success: true, message: `Invitation accepted, connected as "${guestName}"` };
        }

        // ============ WORKERS ============
        case 'spawn': {
          const { workerName } = params;
          const pathParts = String(workerName).split('.');
          await E(powers).provideWorker(pathParts);
          return { success: true, message: `Worker "${workerName}" spawned` };
        }

        // ============ HOSTS/GUESTS ============
        case 'host': {
          const { hostName } = params;
          await E(powers).provideHost(String(hostName));
          return { success: true, message: `Host "${hostName}" created` };
        }

        case 'guest': {
          const { guestName } = params;
          await E(powers).provideGuest(String(guestName));
          return { success: true, message: `Guest "${guestName}" created` };
        }

        // ============ BUNDLES ============
        case 'mkbundle': {
          const { bundleName, powersName, resultName, workerName = 'MAIN' } = params;
          const result = await E(powers).makeBundle(
            String(workerName),
            String(bundleName),
            String(powersName),
            resultName ? String(resultName) : undefined,
          );
          return { success: true, value: result, message: resultName ? `Bundle instantiated as "${resultName}"` : 'Bundle instantiated' };
        }

        case 'mkplugin': {
          const { specifier, powersName, resultName, workerName = 'MAIN' } = params;
          const result = await E(powers).makeUnconfined(
            String(workerName),
            String(specifier),
            String(powersName),
            resultName ? String(resultName) : undefined,
          );
          return { success: true, value: result, message: resultName ? `Plugin created as "${resultName}"` : 'Plugin created' };
        }

        // ============ SYSTEM ============
        case 'cancel': {
          const { petName, reason } = params;
          const pathParts = String(petName).split('.');
          const error = reason ? new Error(String(reason)) : new Error('Cancelled');
          await E(powers).cancel(pathParts, error);
          return { success: true, message: `"${petName}" cancelled` };
        }

        case 'info': {
          const peerInfo = await E(powers).getPeerInfo();
          return { success: true, value: peerInfo };
        }

        default:
          throw new Error(`Unknown command: ${commandName}`);
      }
    } catch (error) {
      const err = /** @type {Error} */ (error);
      showError(err);
      return { success: false, error: err };
    }
  };

  return { execute };
};
