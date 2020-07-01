// eslint-disable-next-line import/no-cycle
import { foo } from './a';

/*
 * --------->
 * <!-- foo as bar -->
 */
export { foo as bar };
