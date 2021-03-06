'use strict';

var path = require('path');

module.exports = function(source, options) {

  var data = {};

  var basename = path.basename(source, path.extname(source));
  var dirnames = path.dirname(source).split('/').filter(function(x) { return x !== '.' });
  var matches  = basename.match(/^_?(?:#([^.]*)\.)?(.+?)(?:\.([^.]+))?$/);

  // data.source
  // ===========

  data.source = source;

  // data.extname
  // ============

  data.extname = path.extname(source).slice(1);

  // data.dirnames
  // =============

  data.dirnames = dirnames.map(function(x) { return x.replace(/^_/g, '') });

  // data.draft
  // ==========

  data.draft = dirnames.concat([basename]).some(function(x) { return x.indexOf('_') === 0 });

  // data.order
  // ==========

  data.order = matches[1];

  // data.slug, data.locale
  // ======================

  if (options.locales && ~options.locales.indexOf(matches[3])) {
    data.slug   = matches[2];
    data.locale = matches[3];
  } else {
    if (matches[3] !== undefined) {
      data.slug = matches[2] + '.' + matches[3];
    } else {
      data.slug = matches[2];
    }
    data.locale = null;
  }

  // data.index
  // ==========

  data.index = data.slug === 'index';

  // ===
  // ===

  return data;
};
