import { encodeBase64 } from '@endo/base64';
import bar from './bar.json';
print('hi');
print(Object.isFrozen(Object));
print(JSON.stringify(bar));
print(encodeBase64(new TextEncoder().encode('Hello')));
print('ok');
