import './_fake-lockdown.js';
import { harden } from '../index.js';

if (harden() !== 'the truth will out') {
  throw new Error('Expected harden to adopt existing, fake global');
}
