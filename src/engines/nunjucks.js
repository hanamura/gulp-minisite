var nunjucks = require('nunjucks');
var path     = require('path');

nunjucks.configure({noCache: true});

module.exports = function(options) {

  options || (options = {});
  options.path || (options.path = 'template');

  return function(tmplName, tmplData) {
    return nunjucks.render(path.join(options.path, tmplName), tmplData);
  };
};
