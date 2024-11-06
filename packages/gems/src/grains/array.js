import { Far } from '@endo/captp';

export function defineGrainArrayClass(vatSupervisor, makeGrain) {
  const { defineClass } = vatSupervisor;
  const makeGrainArray = defineClass('GrainArray', {
    initFn (label, initialArray = []) {
      if (!Array.isArray(initialArray)) {
        throw new Error('initialArray must be an array');
      }
      const grain = makeGrain(label, initialArray);
      return harden({
        grain,
      });
    },

    methods: {
      getArray() {
        return this.state.grain.getValue();
      },
      subscribe(callbackObj) {
        return this.state.grain.subscribe(callbackObj);
      },
      setArray(newArray) {
        if (!Array.isArray(newArray)) {
          throw new Error('newArray must be an array');
        }
        this.state.grain.setValue(newArray);
      },
      push(item) {
        const array = this.state.grain.getValue();
        const newArray = [...array, item];
        this.state.grain.setValue(newArray);
        return newArray.length;
      },
      pop() {
        const array = this.state.grain.getValue();
        const item = array[array.length - 1];
        const remaining = array.slice(0, array.length - 1);
        this.state.grain.setValue(remaining);
        return item;
      },
      destroy() {
        this.state.grain.destroy();
      },
      readonly() {
        return Far('ReadonlyGrainArray', {
          getArray: () => [...this.state.array],
          subscribe: callbackObj => this.subscribe(callbackObj),
        });
      },
    },
    
  });

  return makeGrainArray;
}
