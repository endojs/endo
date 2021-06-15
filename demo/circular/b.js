// eslint-disable-next-line import/no-cycle
import { foo } from './a.js';

/*
 * --------->
 * <!-- foo as bar -->
 */
export { foo as bar };
