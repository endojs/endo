import { lockdown } from '@endo/lockdown';

lockdown({ errorTaming: 'unsafe', stackFiltering: 'verbose' });
Error.stackTraceLimit = Infinity;
