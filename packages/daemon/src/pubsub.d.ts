export function makeNullQueue<TValue>(value: TValue): AsyncQueue<TValue, unknown>;
export const nullIteratorQueue: AsyncQueue<{
    value: undefined;
    done: boolean;
}, unknown>;
export function makeChangePubSub<TValue>(): {
    sink: {
        /**
         * @param {TValue} value
         */
        put: (value: TValue) => void;
    };
    makeSpring: () => {
        get: () => Promise<any>;
    };
};
export function makeChangeTopic<TValue>(): Topic<TValue, undefined, undefined, undefined>;
import type { AsyncQueue } from '@endo/stream';
import type { Topic } from './types.js';
//# sourceMappingURL=pubsub.d.ts.map