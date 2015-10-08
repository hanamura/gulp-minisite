var path = require('path');
var swig = require('swig');

swig.setDefaults({cache: false});

module.exports = function(options) {

  options || (options = {});
  options.path || (options.path = 'template');

  return function(tmplName, tmplData) {
    return swig.renderFile(path.join(options.path, tmplName), tmplData);
  };
};
