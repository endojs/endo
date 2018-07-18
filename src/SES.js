import { createSES } from './bundled/index.js';
import { createSESString } from './bundle.js';


export const SES = createSES(createSESString);
