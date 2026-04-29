import { lockdown } from '@endo/lockdown';

lockdown({ errorTaming: 'unsafe', stackFiltering: 'concise' });
Error.stackTraceLimit = Infinity;
