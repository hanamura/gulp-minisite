var marked   = require('marked');
var nunjucks = require('nunjucks');
var path     = require('path');

module.exports = function(options) {

  options || (options = {});
  options.path || (options.path = 'template');

  var env = new nunjucks.Environment(
    new nunjucks.FileSystemLoader(options.path),
    {noCache: true}
  );
  env.addFilter('markdown', function(str) {
    if (!str) {
      return str;
    }
    return new nunjucks.runtime.SafeString(marked(str));
  });

  return function(tmplName, tmplData) {
    return env.render(tmplName, tmplData);
  };
};
