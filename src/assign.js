'use strict';

module.exports = (target, object) => {
  const descriptors = {};
  Object.keys(object).forEach(key => {
    descriptors[key] = Object.getOwnPropertyDescriptor(object, key);
  });
  Object.getOwnPropertySymbols(object).forEach(symbol => {
    const descriptor = Object.getOwnPropertyDescriptor(object, symbol);
    if (descriptor.enumerable) {
      descriptors[symbol] = descriptor;
    }
  });
  return Object.defineProperties(target, descriptors);
};
