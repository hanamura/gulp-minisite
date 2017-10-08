'use strict';

const marked   = require('marked');
const nunjucks = require('nunjucks');
const path     = require('path');

module.exports = options => {
  options || (options = {});
  options.path || (options.path = 'template');
  options.markdown || (options.markdown = str => {
    if (!str) return str;
    return new nunjucks.runtime.SafeString(marked(str));
  });

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