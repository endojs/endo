export function makeNullQueue<TValue>(value: TValue): import("@endo/stream").AsyncQueue<TValue, unknown>;
export const nullIteratorQueue: import("@endo/stream").AsyncQueue<{
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
export function makeChangeTopic<TValue>(): import("./types.js").Topic<TValue, undefined, undefined, undefined>;
//# sourceMappingURL=pubsub.d.ts.map