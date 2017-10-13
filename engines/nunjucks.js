'use strict';

const marked   = require('marked');
const nunjucks = require('nunjucks');
const path     = require('path');

module.exports = (options = {}) => {
  options = Object.assign({
    path: 'template',
    markdown: str => {
      return str ? new nunjucks.runtime.SafeString(marked(str)) : str;
    }
  }, options);

  const env = new nunjucks.Environment(
    new nunjucks.FileSystemLoader(options.path),
    {noCache: true}
  );
  env.addFilter('markdown', options.markdown);

  return context => {
    if (!context.page.template) {
      return context.page.body;
    }
    return env.render(context.page.template, context);
  };
};
