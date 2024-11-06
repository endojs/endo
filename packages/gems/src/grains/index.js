import { defineGrainClass } from "./grain.js"
import { defineGrainArrayClass } from "./array.js";

export const defineGrainClasses = (vatSupervisor) => {
  const makeGrain = defineGrainClass(vatSupervisor);
  const makeArrayGrain = defineGrainArrayClass(vatSupervisor, makeGrain);
  return {
    makeGrain,
    makeArrayGrain,
  };
}
