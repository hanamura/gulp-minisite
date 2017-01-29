'use strict';

module.exports = (a, b) => {
  if (a.order !== null && b.order !== null) {
    if (a.order < b.order) return -1;
    if (a.order > b.order) return 1;
  } else if (a.order !== null) {
    return 1;
  } else if (b.order !== null) {
    return -1;
  }

  if (a.slug < b.slug) return -1;
  if (a.slug > b.slug) return 1;

  return 0;
};
