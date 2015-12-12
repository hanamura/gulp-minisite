'use strict';

module.exports = function(a, b) {
  var aOrder = a.order;
  var bOrder = b.order;

  if (aOrder !== undefined && bOrder !== undefined) {
    if (aOrder < bOrder) { return -1 }
    if (aOrder > bOrder) { return 1 }
  } else if (aOrder !== undefined) {
    return 1;
  } else if (bOrder !== undefined) {
    return -1;
  }

  var aSlug = a.slug;
  var bSlug = b.slug;

  if (aSlug < bSlug) { return -1 }
  if (aSlug > bSlug) { return 1 }

  return 0;
};
