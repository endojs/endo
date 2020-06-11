// eslint-disable-next-line import/no-cycle
import { foo } from './a';

/*
 * --------->
 * <!-- foo as bar -->
 */
console.error('here am I');
export { foo as bar };
