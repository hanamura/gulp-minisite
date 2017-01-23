var File    = require('gulp-util').File;
var array   = require('stream-array');
var assert  = require('stream-assert');
var chunk   = require('lodash.chunk');
var expect  = require('chai').expect;
var groupBy = require('lodash.groupby');
var yaml    = require('js-yaml');

var minisite = require('../src');

var create = function(filename, attr, body) {
  var contents = [];

  if (attr && body !== undefined) {
    contents.push('---', yaml.safeDump(attr), '---', body);
  } else if (attr) {
    contents.push(yaml.safeDump(attr));
  } else if (body !== undefined) {
    contents.push(body);
  }
  var content = contents.join('\n');

  return new File({
    cwd:      '/root/',
    base:     '/root/base',
    path:     '/root/base/' + filename,
    contents: new Buffer(content),
  });
};

describe('gulp-minisite', function() {

  // filename/filepath transformer
  // =============================

  describe('filename/filepath transformer (basic)', function() {

    it('should transform document into HTML', function(done) {
      array([create('hello.md', {}, '')])
        .pipe(minisite())
        .pipe(assert.length(1))
        .pipe(assert.first(function(file) {
          expect(file.path).to.equal('/root/base/hello/index.html');
        }))
        .pipe(assert.end(done));
    });

    it('should not transform file if it is not a document', function(done) {
      array([create('hello.md', null, 'Hello')])
        .pipe(minisite())
        .pipe(assert.length(1))
        .pipe(assert.first(function(file) {
          expect(file.path).to.equal('/root/base/hello.md');
          expect(file.contents.toString().trim()).to.equal('Hello');
        }))
        .pipe(assert.end(done));
    });

    it('should strip front matter', function(done) {
      array([create('hello.md', {title: 'hello'}, 'body')])
        .pipe(minisite())
        .pipe(assert.length(1))
        .pipe(assert.first(function(file) {
          expect(file.contents.toString().trim()).to.equal('body');
        }))
        .pipe(assert.end(done));
    });

    it('should proceed multiple files', function(done) {
      array([
        create('hello.md', {}, ''),
        create('world.md', {}, ''),
      ])
        .pipe(minisite())
        .pipe(assert.length(2))
        .pipe(assert.first(function(file) {
          expect(file.path).to.equal('/root/base/hello/index.html');
        }))
        .pipe(assert.second(function(file) {
          expect(file.path).to.equal('/root/base/world/index.html');
        }))
        .pipe(assert.end(done));
    });

    it('should throw PluginError if two files have the same path', function(done) {
      var PluginError = require('gulp-util').PluginError;
      array([
        create('hello.md', {}, ''),
        create('hello.yml', {}),
      ])
        .pipe(minisite())
        .on('error', function(e) {
          expect(e).to.be.an.instanceof(PluginError);
          expect(e.message).to.have.string('same path');
          done();
        });
    });

    it('should throw PluginError on YAML syntax error', function(done) {
      var PluginError = require('gulp-util').PluginError;
      array([create('hello.yml', null, 'x:\nx')])
        .pipe(minisite())
        .on('error', function(e) {
          expect(e).to.be.an.instanceof(PluginError);
          done();
        })
        .pipe(assert.end(done));
    });

    it('should treat YAML as document', function(done) {
      array([create('hello.yml', {
        title: 'Hello',
        description: 'Hello World',
      })])
        .pipe(minisite())
        .pipe(assert.length(1))
        .pipe(assert.first(function(file) {
          expect(file.path).to.equal('/root/base/hello/index.html');
          expect(file.data.title).to.equal('Hello');
          expect(file.data.description).to.equal('Hello World');
        }))
        .pipe(assert.end(done));
    });

    it('should treat JSON as document', function(done) {
      array([create('hello.json', null, '{"title":"Hello","description":"Hello World"}')])
        .pipe(minisite())
        .pipe(assert.length(1))
        .pipe(assert.first(function(file) {
          expect(file.path).to.equal('/root/base/hello/index.html');
          expect(file.data.title).to.equal('Hello');
          expect(file.data.description).to.equal('Hello World');
        }))
        .pipe(assert.end(done));
    });

    it('should accept empty YAML', function(done) {
      array([create('hello.yml', null, '')])
        .pipe(minisite())
        .pipe(assert.length(1))
        .pipe(assert.first(function(file) {
          expect(file.path).to.equal('/root/base/hello/index.html');
          expect(file.data).to.not.be.undefined;
        }))
        .pipe(assert.end(done));
    });

    it('should not treat YAML as document if dataExtensions is null', function(done) {
      array([create('hello.yml', {
        title: 'Hello',
        description: 'Hello World',
      })])
        .pipe(minisite({dataExtensions: null}))
        .pipe(assert.length(1))
        .pipe(assert.first(function(file) {
          expect(file.data.document).to.be.false;
          var attr = yaml.safeLoad(file.contents.toString());
          expect(attr.title).to.equal('Hello');
          expect(attr.description).to.equal('Hello World');
        }))
        .pipe(assert.end(done));
    });

    it('should give document consistent resource id', function(done) {
      array([
        create('foo.md', {}, ''),
        create('bar/baz.md', {}, ''),
      ])
        .pipe(minisite())
        .pipe(assert.length(2))
        .pipe(assert.first(function(file) {
          expect(file.data.resourceId).to.equal('foo');
        }))
        .pipe(assert.second(function(file) {
          expect(file.data.resourceId).to.equal('bar/baz');
        }))
        .pipe(assert.end(done));
    });

    it('should strip order part from filename', function(done) {
      array([create('#01.hello.md', {}, '')])
        .pipe(minisite())
        .pipe(assert.length(1))
        .pipe(assert.first(function(file) {
          expect(file.path).to.equal('/root/base/hello/index.html');
        }))
        .pipe(assert.end(done));
    });

  });

  // locale
  // ------

  describe('filename/filepath transformer (locale)', function() {

    it('should prefix locale to path', function(done) {
      array([create('hello.ja.md', {}, '')])
        .pipe(minisite({locales: ['ja']}))
        .pipe(assert.length(1))
        .pipe(assert.first(function(file) {
          expect(file.path).to.equal('/root/base/ja/hello/index.html');
        }))
        .pipe(assert.end(done));
    });

    it('should prefix locale to path even if it is not a document', function(done) {
      array([create('hello.ja.md', null, '')])
        .pipe(minisite({locales: ['ja']}))
        .pipe(assert.length(1))
        .pipe(assert.first(function(file) {
          expect(file.path).to.equal('/root/base/ja/hello.md');
        }))
        .pipe(assert.end(done));
    });

    it('should not prefix locale to path if it is default locale', function(done) {
      array([create('hello.ja.md', {}, '')])
        .pipe(minisite({locales: ['ja'], defaultLocale: 'ja'}))
        .pipe(assert.length(1))
        .pipe(assert.first(function(file) {
          expect(file.path).to.equal('/root/base/hello/index.html');
        }))
        .pipe(assert.end(done));
    });

    it('should assign default locale to document if it is specified', function(done) {
      array([create('hello.md', {}, '')])
        .pipe(minisite({locales: ['ja'], defaultLocale: 'ja'}))
        .pipe(assert.length(1))
        .pipe(assert.first(function(file) {
          expect(file.data.locale).to.equal('ja');
        }))
        .pipe(assert.end(done));
    });

    it('should not assign any locale to document if default locale is not specified', function(done) {
      array([create('hello.md', {}, '')])
        .pipe(minisite({locales: ['ja']}))
        .pipe(assert.length(1))
        .pipe(assert.first(function(file) {
          expect(file.data.locale).to.not.be.ok;
          expect(file.path).to.equal('/root/base/hello/index.html');
        }))
        .pipe(assert.end(done));
    });

    it('should ignore unknown locale', function(done) {
      array([create('hello.ja.md', {}, '')])
        .pipe(minisite({locales: ['en']}))
        .pipe(assert.length(1))
        .pipe(assert.first(function(file) {
          expect(file.path).to.equal('/root/base/hello.ja/index.html');
        }))
        .pipe(assert.end(done));
    });

    it('should give documents the same resource id if only a locale differs', function(done) {
      array([
        create('foo.md', {}, ''),
        create('bar/baz.md', {}, ''),
        create('foo.ja.md', {}, ''),
        create('bar/baz.ja.md', {}, ''),
      ])
        .pipe(minisite({locales: ['en', 'ja'], defaultLocale: 'en'}))
        .pipe(assert.length(4))
        .pipe(assert.first(function(file) {
          expect(file.data.resourceId).to.equal('foo');
        }))
        .pipe(assert.second(function(file) {
          expect(file.data.resourceId).to.equal('bar/baz');
        }))
        .pipe(assert.nth(2, function(file) {
          expect(file.data.resourceId).to.equal('foo');
        }))
        .pipe(assert.nth(3, function(file) {
          expect(file.data.resourceId).to.equal('bar/baz');
        }))
        .pipe(assert.end(done));
    });

  });

  // draft
  // -----

  describe('filename/filepath transformer (draft)', function() {

    it('should not output draft by default', function(done) {
      array([create('_hello.md', {}, '')])
        .pipe(minisite())
        .pipe(assert.length(0))
        .pipe(assert.end(done));
    });

    it('should output draft if specified', function(done) {
      array([create('_hello.md', {}, '')])
        .pipe(minisite({draft: true}))
        .pipe(assert.length(1))
        .pipe(assert.first(function(file) {
          expect(file.data.draft).to.be.true;
        }))
        .pipe(assert.end(done));
    });

    it('should strip underscore from filename of draft', function(done) {
      array([create('_hello.md', {}, '')])
        .pipe(minisite({draft: true}))
        .pipe(assert.length(1))
        .pipe(assert.first(function(file) {
          expect(file.path).to.equal('/root/base/hello/index.html');
        }))
        .pipe(assert.end(done));
    })

    it('should treat document as draft if any parent directory is marked as draft', function(done) {
      array([create('path/_to/hello.md', {}, '')])
        .pipe(minisite())
        .pipe(assert.length(0))
        .pipe(assert.end(done));
    });

  });

  // template engine
  // ===============

  describe('template engine', function() {

    it('should render content by default', function(done) {
      array([create('hello.yml', {
        template: 'hello.html',
        title: 'Hello',
        description: 'World',
      })])
        .pipe(minisite({
          templateEngine: require('../src/engines/nunjucks')({path: 'test/tmpl-basic'}),
        }))
        .pipe(assert.length(1))
        .pipe(assert.first(function(file) {
          expect(file.contents.toString().trim()).to.equal('Hello - World');
        }))
        .pipe(assert.end(done));
    });

    it('should render content with custom engine', function(done) {
      array([create('hello.yml', {
        template: true,
        title: 'Hello',
        description: 'World',
      })])
        .pipe(minisite({
          templateEngine: function(_, tmplData) {
            var nunjucks = require('nunjucks');
            nunjucks.configure({noCache: true});
            return nunjucks.renderString('{{ page.title }} - {{ page.description }}', tmplData);
          },
        }))
        .pipe(assert.length(1))
        .pipe(assert.first(function(file) {
          expect(file.contents.toString().trim()).to.equal('Hello - World');
        }))
        .pipe(assert.end(done));
    });

    it('should inherit template', function(done) {
      array([create('hello.yml', {
        template: 'pages/hello.html',
        title: 'Hello',
      })])
        .pipe(minisite({
          templateEngine: require('../src/engines/nunjucks')({path: 'test/tmpl-inheritance'}),
        }))
        .pipe(assert.length(1))
        .pipe(assert.first(function(file) {
          expect(file.contents.toString().trim()).to.equal('Root - Hello');
        }))
        .pipe(assert.end(done));
    });

    it('should include template', function(done) {
      array([create('hello.yml', {
        template: 'pages/hello.html',
        title: 'Hello',
      })])
        .pipe(minisite({
          templateEngine: require('../src/engines/nunjucks')({path: 'test/tmpl-include'}),
        }))
        .pipe(assert.length(1))
        .pipe(assert.first(function(file) {
          expect(file.contents.toString().trim()).to.equal('Hello - Partial');
        }))
        .pipe(assert.end(done));
    });

    it('should have markdown filter by default', function(done) {
      array([create('hello.md', {
        template: 'hello.html',
      }, 'Hello **World**')])
        .pipe(minisite({
          templateEngine: require('../src/engines/nunjucks')({path: 'test/tmpl-markdown'}),
        }))
        .pipe(assert.length(1))
        .pipe(assert.first(function(file) {
          expect(file.contents.toString().trim().replace(/[\n\t]+/g, '')).to.equal('<p>Hello <strong>World</strong></p>');
        }))
        .pipe(assert.end(done));
    });

    it('should make markdown filter not to throw error even if empty string, null, or undefined is passed', function(done) {
      array([create('hello.yml', {
        template: 'hello.html',
        emptyString: '',
        nullValue: null,
      })])
        .pipe(minisite({
          templateEngine: require('../src/engines/nunjucks')({path: 'test/tmpl-markdown-null'}),
        }))
        .pipe(assert.length(1))
        .pipe(assert.end(done));
    });

  });

  // template variable: site
  // =======================

  describe('template variable: site', function() {

    it('should be the object passed to minisite()', function(done) {
      array([create('hello.yml', {title: 'Hello', template: true})])
        .pipe(minisite({
          site: {name: 'Site'},
          templateEngine: function(_, tmplData) {
            expect(tmplData.site.name).to.equal('Site');
            return tmplData.page.title;
          },
        }))
        .pipe(assert.length(1))
        .pipe(assert.first(function(file) {
          expect(file.contents.toString()).to.equal('Hello');
        }))
        .pipe(assert.end(done));
    });

    it('should be assigned to locale specific objects if it has the exact same locales with options.locales', function(done) {
      array([
        create('hello.yml', {title: 'Hello', template: true}),
        create('hello.en.yml', {title: 'Hello En', template: true}),
        create('hello.ja.yml', {title: 'Hello Ja', template: true}),
      ])
        .pipe(minisite({
          locales: ['en', 'ja'],
          site: {
            '': {name: 'No locale'},
            en: {name: 'En'},
            ja: {name: 'Ja'},
          },
          templateEngine: function(_, tmplData) {
            expect(tmplData.site).to.not.have.property('');
            expect(tmplData.site).to.not.have.property('en');
            expect(tmplData.site).to.not.have.property('ja');
            ({
              '': function() {
                expect(tmplData.site.name).to.equal('No locale');
              },
              en: function() {
                expect(tmplData.site.name).to.equal('En');
              },
              ja: function() {
                expect(tmplData.site.name).to.equal('Ja');
              },
            })[tmplData.page.locale || '']();
            return tmplData.page.title;
          },
        }))
        .pipe(assert.length(3))
        .pipe(assert.first(function(file) {
          expect(file.contents.toString()).to.equal('Hello');
        }))
        .pipe(assert.second(function(file) {
          expect(file.contents.toString()).to.equal('Hello En');
        }))
        .pipe(assert.nth(2, function(file) {
          expect(file.contents.toString()).to.equal('Hello Ja');
        }))
        .pipe(assert.end(done));
    });

    it('should be the object passed to minisite() if it doesn’t have the exact same locales with options.locales', function(done) {
      array([
        create('hello.yml', {title: 'Hello', template: true}),
        create('hello.en.yml', {title: 'Hello En', template: true}),
        create('hello.ja.yml', {title: 'Hello Ja', template: true}),
      ])
        .pipe(minisite({
          locales: ['en', 'ja'],
          site: {
            name: 'Site',
            '': {name: 'No locale'},
            en: {name: 'En'},
            ja: {name: 'Ja'},
          },
          templateEngine: function(_, tmplData) {
            expect(tmplData.site.name).to.equal('Site');
            expect(tmplData.site[''].name).to.equal('No locale');
            expect(tmplData.site.en.name).to.equal('En');
            expect(tmplData.site.ja.name).to.equal('Ja');
            return tmplData.page.title;
          },
        }))
        .pipe(assert.length(3))
        .pipe(assert.first(function(file) {
          expect(file.contents.toString()).to.equal('Hello');
        }))
        .pipe(assert.second(function(file) {
          expect(file.contents.toString()).to.equal('Hello En');
        }))
        .pipe(assert.nth(2, function(file) {
          expect(file.contents.toString()).to.equal('Hello Ja');
        }))
        .pipe(assert.end(done));
    });

    it('should be reached to global site variable via global.site', function(done) {
      array([
        create('hello.yml', {title: 'Hello', template: true}),
        create('hello.en.yml', {}),
        create('hello.ja.yml', {}),
      ])
        .pipe(minisite({
          locales: ['en', 'ja'],
          site: {
            '': {name: 'No locale'},
            en: {name: 'En'},
            ja: {name: 'Ja'},
          },
          templateEngine: function(_, tmplData) {
            expect(tmplData.global.site[''].name).to.equal('No locale');
            expect(tmplData.global.site.en.name).to.equal('En');
            expect(tmplData.global.site.ja.name).to.equal('Ja');
            return tmplData.page.title;
          },
        }))
        .pipe(assert.length(3))
        .pipe(assert.first(function(file) {
          expect(file.contents.toString()).to.equal('Hello');
        }))
        .pipe(assert.end(done));
    });

  });

  // template variable: page
  // =======================

  describe('template variable: page', function() {

    it('should have shallow attribute access', function(done) {
      array([create('hello.yml', {title: 'Hello', myData: 'World'})])
        .pipe(minisite())
        .pipe(assert.length(1))
        .pipe(assert.first(function(file) {
          expect(file.data.title).to.equal('Hello');
          expect(file.data.myData).to.equal('World');
        }))
        .pipe(assert.end(done));
    });

  });

  // collection
  // ----------

  describe('template variable: page.collection', function() {

    it('should have collection related to index page', function(done) {
      array([
        create('items/index.yml', {}),
        create('items/#1.foo.yml', {title: 'FOO'}),
        create('items/#2.bar.yml', {title: 'BAR'}),
        create('items/#3.baz.yml', {title: 'BAZ'}),
      ])
        .pipe(minisite())
        .pipe(assert.length(4))
        .pipe(assert.first(function(file) {
          expect(file.data.collection).to.be.an('array');
          expect(file.data.collection).to.have.length(3);
          expect(file.data.collection[0].title).to.equal('FOO');
          expect(file.data.collection[1].title).to.equal('BAR');
          expect(file.data.collection[2].title).to.equal('BAZ');
        }))
        .pipe(assert.end(done));
    });

    it('should have collection related to index page (with locales)', function(done) {
      array([
        create('items/index.yml', {}),
        create('items/#1.foo.yml', {title: 'FOO'}),
        create('items/#2.bar.yml', {title: 'BAR'}),
        create('items/#3.baz.yml', {title: 'BAZ'}),
        create('items/index.ja.yml', {}),
        create('items/#1.foo.ja.yml', {title: 'FOO J'}),
        create('items/#2.bar.ja.yml', {title: 'BAR J'}),
        create('items/#3.baz.ja.yml', {title: 'BAZ J'}),
      ])
        .pipe(minisite({
          locales: ['en', 'ja'],
          defaultLocale: 'en',
        }))
        .pipe(assert.length(8))
        .pipe(assert.first(function(file) {
          expect(file.data.collection).to.be.an('array');
          expect(file.data.collection).to.have.length(3);
          expect(file.data.collection[0].title).to.equal('FOO');
          expect(file.data.collection[1].title).to.equal('BAR');
          expect(file.data.collection[2].title).to.equal('BAZ');
        }))
        .pipe(assert.nth(4, function(file) {
          expect(file.data.collection).to.be.an('array');
          expect(file.data.collection).to.have.length(3);
          expect(file.data.collection[0].title).to.equal('FOO J');
          expect(file.data.collection[1].title).to.equal('BAR J');
          expect(file.data.collection[2].title).to.equal('BAZ J');
        }))
        .pipe(assert.end(done));
    });

    it('should have collection related to page even if it is not an index', function(done) {
      array([
        create('items/foo.yml', {title: 'FOO'}),
        create('items/foo/001.yml', {title: 'FOO 001'}),
        create('items/foo/002.yml', {title: 'FOO 002'}),
        create('items/foo/003.yml', {title: 'FOO 003'}),
      ])
        .pipe(minisite())
        .pipe(assert.length(4))
        .pipe(assert.first(function(file) {
          expect(file.data.collection).to.be.an('array');
          expect(file.data.collection).to.have.length(3);
          expect(file.data.collection[0].title).to.equal('FOO 001');
          expect(file.data.collection[1].title).to.equal('FOO 002');
          expect(file.data.collection[2].title).to.equal('FOO 003');
        }))
        .pipe(assert.end(done));
    });

  });

  // locales
  // -------

  describe('template variable: page.locales', function() {

    it('should have references to the other locale pages representing the same resource', function(done) {
      array([
        create('hello.en.yml', {title: 'Hello En'}),
        create('hello.ja.yml', {title: 'Hello Ja'}),
        create('hello.de.yml', {title: 'Hello De'}),
      ])
        .pipe(minisite({locales: ['en', 'ja', 'de']}))
        .pipe(assert.length(3))
        .pipe(assert.first(function(file) {
          expect(file.data.title).to.equal('Hello En');
          expect(file.data.locales.en.title).to.equal('Hello En');
          expect(file.data.locales.ja.title).to.equal('Hello Ja');
          expect(file.data.locales.de.title).to.equal('Hello De');
        }))
        .pipe(assert.second(function(file) {
          expect(file.data.title).to.equal('Hello Ja');
          expect(file.data.locales.en.title).to.equal('Hello En');
          expect(file.data.locales.ja.title).to.equal('Hello Ja');
          expect(file.data.locales.de.title).to.equal('Hello De');
        }))
        .pipe(assert.nth(2, function(file) {
          expect(file.data.title).to.equal('Hello De');
          expect(file.data.locales.en.title).to.equal('Hello En');
          expect(file.data.locales.ja.title).to.equal('Hello Ja');
          expect(file.data.locales.de.title).to.equal('Hello De');
        }))
        .pipe(assert.end(done));
    });

  });

  // prev/next
  // ---------

  describe('template variable: page.prev, page.next', function() {

    it('should link to next document in the same collection', function(done) {
      array([
        create('items/001.yml', {title: '1'}),
        create('items/002.yml', {title: '2'}),
        create('items/003.yml', {title: '3'}),
      ])
        .pipe(minisite())
        .pipe(assert.length(3))
        .pipe(assert.first(function(file) {
          expect(file.data.next).to.exist;
          expect(file.data.next.title).to.equal('2');
        }))
        .pipe(assert.second(function(file) {
          expect(file.data.next).to.exist;
          expect(file.data.next.title).to.equal('3');
        }))
        .pipe(assert.nth(2, function(file) {
          expect(file.data.next).to.be.null;
        }))
        .pipe(assert.end(done));
    });

    it('should link to prev document in the same collection', function(done) {
      array([
        create('items/001.yml', {title: '1'}),
        create('items/002.yml', {title: '2'}),
        create('items/003.yml', {title: '3'}),
      ])
        .pipe(minisite())
        .pipe(assert.length(3))
        .pipe(assert.first(function(file) {
          expect(file.data.prev).to.be.null;
        }))
        .pipe(assert.second(function(file) {
          expect(file.data.prev).to.exist;
          expect(file.data.prev.title).to.equal('1');
        }))
        .pipe(assert.nth(2, function(file) {
          expect(file.data.prev).to.exist;
          expect(file.data.prev.title).to.equal('2');
        }))
        .pipe(assert.end(done));
    });

  });

  // template variable: pages
  // ========================

  describe('template variable: pages', function() {

    it('should contain all pages', function(done) {
      array([
        create('foo.yml', {title: 'FOO', template: true}),
        create('bar.yml', {title: 'BAR'}),
        create('items/index.yml', {}),
        create('items/baz.yml', {title: 'BAZ'}),
        create('items/qux.yml', {title: 'QUX'}),
      ])
        .pipe(minisite({templateEngine: function(_, tmplData) {
          expect(tmplData.pages).to.have.length(5);
          return tmplData.page.title;
        }}))
        .pipe(assert.length(5))
        .pipe(assert.first(function(file) {
          expect(file.contents.toString()).to.equal('FOO');
        }))
        .pipe(assert.end(done));
    });

    it('should contain all pages (with locales)', function(done) {
      array([
        create('foo.yml', {title: 'FOO', template: true}),
        create('bar.yml', {title: 'BAR'}),
        create('items/index.yml', {}),
        create('items/baz.yml', {title: 'BAZ'}),
        create('items/qux.yml', {title: 'QUX'}),
        create('foo.ja.yml', {title: 'FOO J'}),
        create('bar.ja.yml', {title: 'BAR J'}),
        create('items/index.ja.yml', {}),
        create('items/baz.ja.yml', {title: 'BAZ J'}),
        create('items/qux.ja.yml', {title: 'QUX J'}),
      ])
        .pipe(minisite({
          locales: ['en', 'ja'],
          defaultLocale: 'en',
          templateEngine: function(_, tmplData) {
            expect(tmplData.pages).to.have.length(5);
            expect(tmplData.global.pages.en).to.have.length(5);
            expect(tmplData.global.pages.ja).to.have.length(5);
            return tmplData.page.title;
          },
        }))
        .pipe(assert.length(10))
        .pipe(assert.first(function(file) {
          expect(file.contents.toString()).to.equal('FOO');
        }))
        .pipe(assert.end(done));
    });

  });

  // template variable: references
  // =============================

  describe('template variable: references', function() {

    it('should refer to page by resource id', function(done) {
      array([
        create('foo.md', {template: true, title: 'FOO'}, ''),
        create('bar/baz.md', {title: 'BAZ'}, ''),
      ])
        .pipe(minisite({templateEngine: function(_, tmplData) {
          expect(tmplData.references['foo'].title).to.equal('FOO');
          expect(tmplData.references['bar/baz'].title).to.equal('BAZ');
          return tmplData.page.title;
        }}))
        .pipe(assert.length(2))
        .pipe(assert.first(function(file) {
          expect(file.contents.toString()).to.equal('FOO');
        }))
        .pipe(assert.end(done));
    });

    it('should refer to page by resource id (with locales)', function(done) {
      array([
        create('foo.md', {template: true, title: 'FOO'}, ''),
        create('bar/baz.md', {title: 'BAZ'}, ''),
        create('foo.ja.md', {title: 'FOO J'}, ''),
        create('bar/baz.ja.md', {title: 'BAZ J'}, ''),
      ])
        .pipe(minisite({
          locales: ['en', 'ja'],
          defaultLocale: 'en',
          templateEngine: function(_, tmplData) {
            expect(tmplData.references['foo'].title).to.equal('FOO');
            expect(tmplData.global.references.en['foo'].title).to.equal('FOO');
            expect(tmplData.global.references.en['bar/baz'].title).to.equal('BAZ');
            expect(tmplData.global.references.ja['foo'].title).to.equal('FOO J');
            expect(tmplData.global.references.ja['bar/baz'].title).to.equal('BAZ J');
            return tmplData.page.title;
          },
        }))
        .pipe(assert.length(4))
        .pipe(assert.first(function(file) {
          expect(file.contents.toString()).to.equal('FOO');
        }))
        .pipe(assert.end(done));
    });

  });

  // template variable: collections
  // ==============================

  describe('template variable: collections', function() {

    it('should refer to collection of pages by collection id', function(done) {
      array([
        create('items/foo.yml', {title: 'FOO', template: true}),
        create('items/bar.yml', {title: 'BAR'}),
        create('items/baz.yml', {title: 'BAZ'}),
        create('products/category/foo.yml', {title: 'FOO'}),
        create('products/category/bar.yml', {title: 'BAR'}),
      ])
        .pipe(minisite({templateEngine: function(_, tmplData) {
          expect(tmplData.collections['items']).to.be.an('array');
          expect(tmplData.collections['items']).to.have.length(3);
          expect(tmplData.collections['products/category']).to.be.an('array');
          expect(tmplData.collections['products/category']).to.have.length(2);
          return tmplData.page.title;
        }}))
        .pipe(assert.length(5))
        .pipe(assert.first(function(file) {
          expect(file.contents.toString()).to.equal('FOO');
        }))
        .pipe(assert.end(done));
    });

    it('should refer to collection of pages by collection id (with locales)', function(done) {
      array([
        create('items/foo.yml', {title: 'FOO', template: true}),
        create('items/bar.yml', {title: 'BAR'}),
        create('items/baz.yml', {title: 'BAZ'}),
        create('items/foo.ja.yml', {title: 'FOO J'}),
        create('items/bar.ja.yml', {title: 'BAR J'}),
        create('items/baz.ja.yml', {title: 'BAZ J'}),
      ])
        .pipe(minisite({
          locales: ['en', 'ja'],
          defaultLocale: 'en',
          templateEngine: function(_, tmplData) {
            expect(tmplData.collections['items']).to.be.an('array');
            expect(tmplData.global.collections.en['items']).to.be.an('array');
            expect(tmplData.global.collections.en['items']).to.have.length(3);
            expect(tmplData.global.collections.ja['items']).to.be.an('array');
            expect(tmplData.global.collections.ja['items']).to.have.length(3);
            return tmplData.page.title;
          },
        }))
        .pipe(assert.length(6))
        .pipe(assert.first(function(file) {
          expect(file.contents.toString()).to.equal('FOO');
        }))
        .pipe(assert.end(done));
    });

    it('should sort documents in collection by order part of filename', function(done) {
      array([
        create('items/#2.bar.yml', {title: 'BAR', template: true}),
        create('items/#3.baz.yml', {title: 'BAZ'}),
        create('items/#1.foo.yml', {title: 'FOO'}),
      ])
        .pipe(minisite({templateEngine: function(_, tmplData) {
          expect(tmplData.collections['items']).to.be.an('array');
          expect(tmplData.collections['items']).to.have.length(3);
          expect(tmplData.collections['items'][0].title).to.equal('FOO');
          expect(tmplData.collections['items'][1].title).to.equal('BAR');
          expect(tmplData.collections['items'][2].title).to.equal('BAZ');
          return tmplData.page.title;
        }}))
        .pipe(assert.length(3))
        .pipe(assert.first(function(file) {
          expect(file.data.title).to.equal('BAR');
        }))
        .pipe(assert.end(done));
    });

  });

  // file injection
  // ==============

  describe('file injection', function() {

    it('should inject files (pagination example)', function(done) {
      array([
          create('items/01.yml'),
          create('items/02.yml'),
          create('items/03.yml'),
          create('items/04.yml'),
          create('items/05.yml'),
          create('items/06.yml'),
          create('items/07.yml'),
          create('items/08.yml'),
          create('items/09.yml'),
          create('items/10.yml'),
      ])
        .pipe(minisite({
          inject: function(data, options) {
            return chunk(data.collections['']['items'], 3).map(function(_, i) {
              return create(
                i === 0 ? 'items/index.yml' : 'items/page/' + (i + 1) + '.yml',
                {offset: i * 3}
              );
            });
          },
        }))
        .pipe(assert.length(14))
        .pipe(assert.nth(10, function(file) {
          expect(file.data.offset).to.equal(0);
          expect(file.path).to.equal('/root/base/items/index.html');
        }))
        .pipe(assert.nth(11, function(file) {
          expect(file.data.offset).to.equal(3);
          expect(file.path).to.equal('/root/base/items/page/2/index.html');
        }))
        .pipe(assert.nth(12, function(file) {
          expect(file.data.offset).to.equal(6);
          expect(file.path).to.equal('/root/base/items/page/3/index.html');
        }))
        .pipe(assert.nth(13, function(file) {
          expect(file.data.offset).to.equal(9);
          expect(file.path).to.equal('/root/base/items/page/4/index.html');
        }))
        .pipe(assert.end(done));
    });

    it('should inject files (category example)', function(done) {
      array([
          create('items/01.yml', {category: 'a'}),
          create('items/02.yml', {category: 'b'}),
          create('items/03.yml', {category: 'c'}),
          create('items/04.yml', {category: 'b'}),
          create('items/05.yml', {category: 'b'}),
          create('items/06.yml', {category: 'c'}),
          create('items/07.yml', {category: 'a'}),
          create('items/08.yml', {category: 'd'}),
          create('items/09.yml', {category: 'c'}),
          create('items/10.yml', {category: 'c'}),
      ])
        .pipe(minisite({
          inject: function(data, options) {
            var group = groupBy(data.collections['']['items'], function(item) {
              return item.category;
            });
            var categories = [];
            for (var category in group) {
              categories.push(create('items/category/' + category + '.yml', {
                category: category,
                count: group[category].length,
              }));
            }
            return categories;
          },
        }))
        .pipe(assert.length(14))
        .pipe(assert.nth(10, function(file) {
          expect(file.data.category).to.equal('a');
          expect(file.data.count).to.equal(2);
          expect(file.path).to.equal('/root/base/items/category/a/index.html');
        }))
        .pipe(assert.nth(11, function(file) {
          expect(file.data.category).to.equal('b');
          expect(file.data.count).to.equal(3);
          expect(file.path).to.equal('/root/base/items/category/b/index.html');
        }))
        .pipe(assert.nth(12, function(file) {
          expect(file.data.category).to.equal('c');
          expect(file.data.count).to.equal(4);
          expect(file.path).to.equal('/root/base/items/category/c/index.html');
        }))
        .pipe(assert.nth(13, function(file) {
          expect(file.data.category).to.equal('d');
          expect(file.data.count).to.equal(1);
          expect(file.path).to.equal('/root/base/items/category/d/index.html');
        }))
        .pipe(assert.end(done));
    });

    it('should inject files (date example)', function(done) {
      array([
          create('items/01.yml', {date: '2014-10-10'}),
          create('items/02.yml', {date: '2015-07-15'}),
          create('items/03.yml', {date: '2015-07-20'}),
          create('items/04.yml', {date: '2015-07-25'}),
          create('items/05.yml', {date: '2015-07-30'}),
          create('items/06.yml', {date: '2015-09-10'}),
          create('items/07.yml', {date: '2015-09-20'}),
          create('items/08.yml', {date: '2015-09-30'}),
          create('items/09.yml', {date: '2015-10-10'}),
          create('items/10.yml', {date: '2015-10-25'}),
      ])
        .pipe(minisite({
          inject: function(data, options) {
            var group = groupBy(data.collections['']['items'], function(item) {
              return item.date.substr(0, 7);
            });
            var months = [];
            for (var month in group) {
              months.push(create('items/date/' + month + '.yml', {
                year: parseInt(month.substr(0, 4)),
                month: parseInt(month.substr(5)),
                count: group[month].length,
              }));
            }
            return months;
          },
        }))
        .pipe(assert.length(14))
        .pipe(assert.nth(10, function(file) {
          expect(file.data.year).to.equal(2014);
          expect(file.data.month).to.equal(10);
          expect(file.data.count).to.equal(1);
          expect(file.path).to.equal('/root/base/items/date/2014-10/index.html');
        }))
        .pipe(assert.nth(11, function(file) {
          expect(file.data.year).to.equal(2015);
          expect(file.data.month).to.equal(7);
          expect(file.data.count).to.equal(4);
          expect(file.path).to.equal('/root/base/items/date/2015-07/index.html');
        }))
        .pipe(assert.nth(12, function(file) {
          expect(file.data.year).to.equal(2015);
          expect(file.data.month).to.equal(9);
          expect(file.data.count).to.equal(3);
          expect(file.path).to.equal('/root/base/items/date/2015-09/index.html');
        }))
        .pipe(assert.nth(13, function(file) {
          expect(file.data.year).to.equal(2015);
          expect(file.data.month).to.equal(10);
          expect(file.data.count).to.equal(2);
          expect(file.path).to.equal('/root/base/items/date/2015-10/index.html');
        }))
        .pipe(assert.end(done));
    });

    it('should inject files multiple times', function(done) {
      array([
          create('index.yml'),
          create('items/01.yml', {keyword: 'a'}),
          create('items/02.yml', {keyword: 'b'}),
          create('items/03.yml', {keyword: 'c'}),
          create('items/04.yml', {keyword: 'd'}),
          create('items/05.yml', {keyword: 'd'}),
          create('items/06.yml', {keyword: 'd'}),
          create('items/07.yml', {keyword: 'b'}),
          create('items/08.yml', {keyword: 'c'}),
          create('items/09.yml', {keyword: 'a'}),
          create('items/10.yml', {keyword: 'c'}),
          create('pages/01.yml', {keyword: 'a'}),
          create('pages/02.yml', {keyword: 'c'}),
          create('pages/03.yml', {keyword: 'd'}),
          create('pages/04.yml', {keyword: 'c'}),
          create('pages/05.yml', {keyword: 'b'}),
      ])
        .pipe(minisite({
          inject: [
            function(data, options) {
              var items = data.pages[''].filter(function(item) {
                return 'keyword' in item;
              });
              var group = groupBy(items, function(item) {
                return item.keyword;
              });
              var keywords = [];
              for (var keyword in group) {
                keywords.push(create('keyword/' + keyword + '.yml', {
                  keyword: keyword,
                  count: group[keyword].length,
                }));
              }
              return keywords;
            },
            function(data, options) {
              return chunk(data.collections['']['keyword'], 3).map(function(_, i) {
                return create(
                  i === 0 ? 'keyword/index.yml' : 'keyword/page/' + (i + 1) + '.yml',
                  {offset: i * 3}
                );
              });
            },
          ],
        }))
        .pipe(assert.length(22))
        .pipe(assert.nth(16, function(file) {
          expect(file.data.keyword).to.equal('a');
          expect(file.path).to.equal('/root/base/keyword/a/index.html');
        }))
        .pipe(assert.nth(20, function(file) {
          expect(file.data.offset).to.equal(0);
          expect(file.path).to.equal('/root/base/keyword/index.html');
        }))
        .pipe(assert.nth(21, function(file) {
          expect(file.data.offset).to.equal(3);
          expect(file.path).to.equal('/root/base/keyword/page/2/index.html');
        }))
        .pipe(assert.end(done));
    });

  });

});
