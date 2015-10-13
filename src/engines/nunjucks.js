var nunjucks = require('nunjucks');
var path     = require('path');

module.exports = function(options) {

  options || (options = {});
  options.path || (options.path = 'template');

  var env = new nunjucks.Environment(
    new nunjucks.FileSystemLoader(options.path),
    {noCache: true}
  );

  return function(tmplName, tmplData) {
    return env.render(tmplName, tmplData);
  };
};
