# gulp-minisite [![Build Status](https://travis-ci.org/hanamura/gulp-minisite.svg?branch=master)](https://travis-ci.org/hanamura/gulp-minisite)

Static site generator for Gulp ecosystem.

## Why?

1. A single build system is enough for static site development. I already have Gulp. I don’t want to work hard for making full-featured-standalone-static-site-generator to work well with Gulp/Npm/Node. Or to compile, minify, and optimize many different kinds of files properly in their way, while Gulp does everything well.  
  Making user-friendly presentation (HTML and pertty permalinks) from developer-friendly expression (eg. JSON, YAML, or Markdown and pretty filenames) is the one thing to do well for gulp-minisite.
2. To start small and expand flexibly, gulp-minisite keeps it simple, works without complex configutations, and provides some handy options and features.

### gulp-minisite does:

- transform source files into HTML using template engine.
- compose useful data and you can use it in a template file.
- build clean permalink structure.

### gulp-minisite does NOT:

- compile any file into CSS or JavaScript. Do it with Gulp and your favorite compiler.
- minify or optimize any kind of files. Do it with Gulp and your favorite minifier or optimizer.
- watch file changes. Do it with `gulp.watch()`.
- run a local webserver. Do it with [gulp-webserver](https://github.com/schickling/gulp-webserver).
- force you to use specific template engine. ([Nunjucks](https://mozilla.github.io/nunjucks/) by default, but you can change it)
- provide flexible permalink configurations [like](http://jekyllrb.com/docs/permalinks/) [that](https://gohugo.io/extras/permalinks/). Just put files and follow the convensions.
- generate dynamic pages like paginated indexes. Traverse files and generate “dynamic“ pages manually before executing gulp-minisite tasks. (But considering some sort of helpers)
- behave like a blog engine. It’s made for a general website (including a blog).
- have any theme.

## Install

```sh
$ npm install gulp-minisite --save-dev
```

## Tutorial

### Start with minimum example

Directory structure:

```
.
├── src
|   └── index.html
├── gulpfile.js
└── package.json
```

`src/index.html`:

```html
<h1>Hello</h1>
<p>Hello World</p>
```

`gulpfile.js`:

```javascript
var gulp = require('gulp');
var minisite = require('gulp-minisite');

gulp.task('minisite', function() {
  return gulp.src('src/**/*')
    .pipe(minisite())
    .pipe(gulp.dest('dest'));
});
```

#### Output

```
...
├── dest
|   └── index.html
...
```

`dest/index.html`:

```html
<h1>Hello</h1>
<p>Hello World</p>
```

Just copied `index.html`. This is still useless.

### Use YAML and template

Add template:

```
.
├── src
|   └── index.html
├── template      <- added
|   └── home.html <- added
...
```

`template/home.html`:

```jinja
<h1>{{ page.title }}</h1>
<p>{{ page.description }}</p>
```

By default, you can use [Nunjucks]() template engine. See [the document](https://mozilla.github.io/nunjucks/templating.html) for further information.

Rename `src/index.html` to `src/index.yml` and modify content:

```
.
├── src
|   └── index.yml <- rename and modify
...
```

`src/index.yml`:

```yaml
template: home.html
title: Hello
description: Hello World
```

Specify template name by `template` attribute.

#### Output

`dest/index.html`:

```html
<h1>Hello</h1>
<p>Hello World</p>
```

### Use Markdown with YAML [front-matter](http://jekyllrb.com/docs/frontmatter/)

```
.
├── src
|   └── index.md <- renamed
...
```

`src/index.md`:

```markdown
---
template: home.html
title: Hello
---
Hello World with **Markdown** syntax.
```

Update `template/home.html`:

```jinja
<h1>{{ page.title }}</h1>
{{ page.body | markdown }}
```

#### Output

`dest/index.html`:

```html
<h1>Hello</h1>
<p>
  Hello World with <strong>Markdown</strong> syntax.
</p>
```

### Add about page

Add document and template:

```
.
├── src
|   ├── index.md
|   └── about.yml  <- added
├── template
|   ├── home.html
|   └── about.html <- added
...
```

`src/about.yml`:

```yaml
template: about.html
title: About
description: [Contact me](mailto:mail@example.com)
```

`template/about.html`:

```jinja
<h2>{{ page.title }}</h2>
<p>{{ page.description | markdown }}</p>
```

#### Output

```
...
├── dest
|   ├── index.html
|   └── about
|       └── index.html
...
```

`dest/about/index.html`:

```html
<h2>About</h2>
<p><a href="mailto:mail@example.com">Contact me</a></p>
```

### Add product pages

Add some files:

```
.
├── src
|   ├── index.md
|   ├── about.yml
|   └── product             <- added
|       ├── index.yml       <- added
|       ├── salt.yml        <- added
|       ├── pepper.yml      <- added
|       └── sugar.yml       <- added
├── template
|   ├── home.html
|   ├── about.html
|   ├── product-index.html  <- added
|   ├── product-detail.html <- added
...
```

`src/product/index.yml`:

```yaml
template: product-index.html
title: Products
```

`src/product/salt.yml`:

```yaml
template: product-detail.html
title: Salt
description: This is salty.
```

`template/product-index.html`:

```jinja
{% for product in page.collection %}
<li><a href="{{ product.path }}">{{ product.title }}</a></li>
{% endfor %}
```

`template/product-detail.html`

```jinja
<h2>{{ page.title }}</h2>
<p>{{ page.description }}</p>
```

#### Output

```
...
├── dest
|   ├── index.html
|   ├── about
|   |   └── index.html
|   └── product
|       ├── index.html
|       ├── salt
|       |   └── index.html
|       ├── pepper
|       |   └── index.html
|       └── sugar
|           └── index.html
...
```

`dest/product/index.html`:

```html
<li><a href="/product/pepper">Pepper</a></li>
<li><a href="/product/salt">Salt</a></li>
<li><a href="/product/sugar">Sugar</a></li>
```

`dest/product/salt/index.html`:

```html
<h2>Salt</h2>
<p>This is salty.</p>
```

Products are sorted by filename.

### Sort products by specific order

Rename product files:

```
...
|   └── product
|       ├── index.yml
|       ├── #01.salt.yml   <- renamed
|       ├── #02.pepper.yml <- renamed
|       └── #03.sugar.yml  <- renamed
...
```

#### Output

`dest/product/index.html`:

```html
<li><a href="/product/salt">Salt</a></li>
<li><a href="/product/pepper">Pepper</a></li>
<li><a href="/product/sugar">Sugar</a></li>
```

Order part of filename is stripped from output.

### Add site name for all pages

Add `site` option in `gulpfile.js`:

```javascript
...
gulp.task('minisite', function() {
  return gulp.src('src/**/*')
    .pipe(minisite({
      site: {name: 'Hello Website'}
    }))
    .pipe(gulp.dest('dest'));
});
```

Prepend title tag to all template files:

```jinja
{% if page.path === '/' %}
<title>{{ site.name }}</title>
{% else %}
<title>{{ page.title }} - {{ site.name }}</title>
{% endif %}
...
```

#### Output

`dest/index.html`:

```html
<title>Hello Website</title>
...
```

`dest/about/index.html`:

```html
<title>About - Hello Website</title>
...
```

### Add Japanese language version of files

Suffix language name:

```
.
├── src
|   ├── index.md
|   ├── index.ja.md           <- added
|   ├── about.html
|   ├── about.ja.html         <- added
|   └── product
|       ├── index.yml
|       ├── index.ja.yml      <- added
|       ├── #01.salt.yml
|       ├── #01.salt.ja.yml   <- added
|       ├── #02.pepper.yml
|       ├── #02.pepper.ja.yml <- added
|       ├── #03.sugar.yml
|       └── #03.sugar.ja.yml  <- added
...
```

`src/index.ja.md`:

```markdown
---
template: home.html
title: こんにちは
---
こんにちは、世界
```

Specify `locales` and `defaultLocale` in `gulpfile.js`:

```javascript
...
gulp.task('minisite', function() {
  return gulp.src('src/**/*')
    .pipe(minisite({
      site: {name: 'Hello Website'},
      locales: ['en', 'ja'],
      defaultLocale: 'en',
    }))
    .pipe(gulp.dest('dest'));
});
```

#### Output

```
...
├── dest
|   ├── index.html
|   ├── about
|   |   └── index.html
|   ├── product
|   |   ├── index.html
|   |   ├── salt
|   |   |   └── index.html
|   |   ├── pepper
|   |   |   └── index.html
|   |   └── sugar
|   |       └── index.html
|   └── ja
|       ├── index.html
|       ├── about
|       |   └── index.html
|       └── product
|           ├── index.html
|           ├── salt
|           |   └── index.html
|           ├── pepper
|           |   └── index.html
|           └── sugar
|               └── index.html
...
```

`dest/index.html`:

```html
...
<h1>こんにちは</h1>
<p>こんにちは、世界</p>
```

### Write draft document

Start filename with `_`:

```
.
├── src
|   ├── _contact.html <- added
...
```

`gulpfile.js`:

```javascript
...
var gutil = require('gulp-util');
...
gulp.task('minisite', function() {
  return gulp.src('src/**/*')
    .pipe(minisite({
      site: {name: 'Hello Website'},
      locales: ['en', 'ja'],
      defaultLocale: 'en',
      draft: !gutil.env.production,
    }))
    .pipe(gulp.dest('dest'));
});
```

#### Output

With `$ gulp minisite`:

```
...
├── dest
|   ├── contact
|   |   └── index.html
...
```

But with `$ gulp minisite --production`, `dest/contact/index.html` won’t be generated.

### Add image files

```
...
├── src
|   ├── img                <- added
|   |   ├── logo.png       <- added
|   |   ├── logo.ja.png    <- added
|   |   ├── logo@2x.png    <- added
|   |   └── logo@2x.ja.png <- added
...
```

#### Output

```
...
├── dest
|   ├── img
|   |   ├── logo.png
|   |   └── logo@2x.png
...
|   └── ja
|       ├── img
|       |   ├── logo.png
|       |   └── logo@2x.png
...
```

If your files aren’t document, gulp-minisite just relocate and copies them.

### Use Sass, CoffeeScript, etc.

gulp-minisite does nothing for that. Just proceed them as you like.

```
...
├── style
|   └── main.scss
├── script
|   └── main.coffee
...
```

`gulpfile.js`:

```javascript
...
var sass = require('gulp-sass');
var coffee = require('gulp-coffee');
...
gulp.task('css', function() {
  return gulp.src('style/**/*')
    .pipe(sass())
    .pipe(gulp.dest('dest/css'));
});
gulp.task('js', function() {
  return gulp.src('script/**/*')
    .pipe(coffee())
    .pipe(gulp.dest('dest/js'));
});
...
```

## Options

### minisite([options])

#### options.locales

- Type: `Array` of `String`
- Default: `null`

Acceptable locale names.

#### options.defaultLocale

- Type: `String`
- Default: `null`

If `defaultLocale` specified, any file without locale part in filename will be assigned that locale.

#### options.site

- Type: `Object`
- Default: `null`

Site-global variable. You can refer the object in template files like `{{ site.name }}`.

#### options.templateEngine

- Type: `Function`
- Default: Nunjucks template engine

Template engine’s render function. The function should receive template name (actually, `template` value of document) and data, and return rendered string.

To use [jade](https://github.com/jadejs/jade):

```javascript
...
templateEngine: function(tmplName, tmplData) {
  var jade = require('jade');
  var path = require('path');
  var tmplDir = 'jade';
  return jade.renderFile(path.join(tmplDir, tmplName), tmplData);
},
...
```

#### options.draft

- Type: `Boolean`
- Default: `false`

If `true`, draft files (their filename starts with `_`) will be proceeded.

#### options.dataExtensions

- Type: `Array` of `String`
- Default: `['yml', 'yaml', 'json']`

File extensions that are treated as documents. If you want YAML/JSON files not to turn out to be HTML, pass `[]` or `null`.

## License

MIT
