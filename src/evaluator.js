import { getPrivateFields, registerPrivateFields } from './privateFields';
import { sanitizeEndowments, sanitizeOptions } from './sanitizer';
import { createRealmRec } from './realmRec';
import { createUnsafeRec } from './unsafeRec';
import repairLegacyAccessors from './repair/repairLegacyAccessors';
import repairFunctionConstructors from './repair/repairFunctionConstructors';

// Capture the current root realm record before anything gets modified.

const unsafeRec = createUnsafeRec();

// New evaluators can only be used safely if the current realm has been
// repaired: those repairs are mandatory and we apply them first.

let hasBeenRepaired = false;

/**
 * Evaluator()
 * The Evaluator constructor is a global. A host that wants to execute
 * code in a secure context creates a new evaluator.
 * The options are:
 * "source": the source text of a program to execute or a module specifier
 * for the module to load after creating the evaluator.
 * "type":
 * "endowments": a dictionary of globals to make available in the evaluator
 * "sloppyGlobalsMode"
 */
export default class Evaluator {
  constructor(options = {}) {
    if (!hasBeenRepaired) {
      // These repi
      repairLegacyAccessors();
      repairFunctionConstructors();
      hasBeenRepaired = true;
    }

    // Sanitize all parameters at the entry point. We replace the
    // original arguments to ensure those are not accidently used.
    options = sanitizeOptions(options, ['transforms']);

    // Allow the evaluator class to register itself inside any
    // new evaluator created. This is safe since all intrinsics
    // are shared.
    const extraDescriptors = {
      Evaluator: {
        value: Evaluator,
        writable: true,
        configurable: true
      }
    };

    // The unsafe record is created and returns a full environment.
    const realmRec = createRealmRec(unsafeRec, extraDescriptors, options);

    // The realmRec has all private fields of the realm instance.
    registerPrivateFields(this, realmRec);
  }

  get global() {
    const { safeGlobal } = getPrivateFields(this);
    return safeGlobal;
  }

  evaluate(x, endowments = {}, options = {}) {
    // Perform this check first to avoid unecessary sanitizing.
    if (typeof x !== 'string') {
      throw new TypeError('first argument of evaluate() must be a string');
    }
    // Sanitize all parameters at the entry point. We replace the
    // original arguments to ensure those are not accidently used.
    endowments = sanitizeEndowments(endowments);
    options = sanitizeOptions(options, ['transforms', 'sloppyGlobalsMode']);

    const { safeEvaluatorFactory } = getPrivateFields(this);
    return safeEvaluatorFactory(endowments, options)(x);
  }

  // eslint-disable-next-line class-methods-use-this
  toString() {
    return '[object Evaluator]';
  }

  static toString() {
    return 'function Evaluator() { [shim code] }';
  }
}
