'use strict';

const File        = require('gulp-util').File;
const PluginError = require('gulp-util').PluginError;
const array       = require('stream-array');
const assert      = require('stream-assert');
const chunk       = require('lodash.chunk');
const expect      = require('chai').expect;
const groupBy     = require('lodash.groupby');
const yaml        = require('js-yaml');

const Resource       = require('../src/resource');
const engineNunjucks = require('../engines/nunjucks');
const minisite       = require('../src/minisite');

const create = (filename, attr, body) => {
  const contents = [];

  if (attr && body !== undefined) {
    contents.push('---', yaml.safeDump(attr), '---', body);
  } else if (attr) {
    contents.push(yaml.safeDump(attr));
  } else if (body !== undefined) {
    contents.push(body);
  }
  const content = contents.join('\n');

  return new File({
    cwd:      '/root/',
    base:     '/root/base',
    path:     '/root/base/' + filename,
    contents: new Buffer(content),
  });
};

describe('gulp-minisite', () => {

  // filename/filepath transformer
  // =============================

  describe('filename/filepath transformer (basic)', () => {

    it('should transform document into HTML', done => {
      array([create('hello.yml', {})])
        .pipe(minisite())
        .pipe(assert.length(1))
        .pipe(assert.first(file => {
          expect(file.path).to.equal('/root/base/hello/index.html');
        }))
        .pipe(assert.end(done));
    });

    it('should not transform file if it is not a document', done => {
      array([create('hello.txt', null, 'Hello')])
        .pipe(minisite())
        .pipe(assert.length(1))
        .pipe(assert.first(file => {
          expect(file.path).to.equal('/root/base/hello.txt');
          expect(file.contents.toString().trim()).to.equal('Hello');
        }))
        .pipe(assert.end(done));
    });

    it('should strip front matter', done => {
      array([create('hello.md', {title: 'hello'}, 'body')])
        .pipe(minisite({documentTypes: ['md']}))
        .pipe(assert.length(1))
        .pipe(assert.first(file => {
          expect(file.contents.toString().trim()).to.equal('body');
        }))
        .pipe(assert.end(done));
    });

    it('should proceed multiple files', done => {
      array([
        create('hello.yml', {}),
        create('world.yml', {}),
      ])
        .pipe(minisite())
        .pipe(assert.length(2))
        .pipe(assert.first(file => {
          expect(file.path).to.equal('/root/base/hello/index.html');
        }))
        .pipe(assert.second(file => {
          expect(file.path).to.equal('/root/base/world/index.html');
        }))
        .pipe(assert.end(done));
    });

    it('should throw PluginError if two files have the same path', done => {
      array([
        create('hello.json', {}),
        create('hello.yml', {}),
      ])
        .pipe(minisite())
        .on('error', e => {
          expect(e).to.be.an.instanceof(PluginError);
          expect(e.message).to.have.string('same path');
          expect(e.message).to.have.string('hello.json');
          expect(e.message).to.have.string('hello.yml');
          done();
        });
    });

    it('should throw PluginError on YAML syntax error', done => {
      array([create('hello.yml', null, 'x:\nx')])
        .pipe(minisite())
        .on('error', e => {
          expect(e).to.be.an.instanceof(PluginError);
          done();
        });
    });

    it('should treat YAML as document', done => {
      array([create('hello.yml', {
        title: 'Hello',
        description: 'Hello World',
      })])
        .pipe(minisite())
        .pipe(assert.length(1))
        .pipe(assert.first(file => {
          expect(file.path).to.equal('/root/base/hello/index.html');
          expect(file.data.title).to.equal('Hello');
          expect(file.data.description).to.equal('Hello World');
        }))
        .pipe(assert.end(done));
    });

    it('should treat JSON as document', done => {
      array([create('hello.json', null, '{"title":"Hello","description":"Hello World"}')])
        .pipe(minisite())
        .pipe(assert.length(1))
        .pipe(assert.first(file => {
          expect(file.path).to.equal('/root/base/hello/index.html');
          expect(file.data.title).to.equal('Hello');
          expect(file.data.description).to.equal('Hello World');
        }))
        .pipe(assert.end(done));
    });

    it('should accept empty YAML', done => {
      array([create('hello.yml', null, '')])
        .pipe(minisite())
        .pipe(assert.length(1))
        .pipe(assert.first(file => {
          expect(file.path).to.equal('/root/base/hello/index.html');
          expect(file.data).to.not.be.undefined;
        }))
        .pipe(assert.end(done));
    });

    it('should not treat YAML as document if documentTypes is null', done => {
      array([create('hello.yml', {
        title: 'Hello',
        description: 'Hello World',
      })])
        .pipe(minisite({documentTypes: null}))
        .pipe(assert.length(1))
        .pipe(assert.first(file => {
          expect(file.data.document).to.be.false;
          const attr = yaml.safeLoad(file.contents.toString());
          expect(attr.title).to.equal('Hello');
          expect(attr.description).to.equal('Hello World');
        }))
        .pipe(assert.end(done));
    });

    it('should give document consistent resource id', done => {
      array([
        create('foo.yml', {}),
        create('bar/baz.yml', {}),
      ])
        .pipe(minisite())
        .pipe(assert.length(2))
        .pipe(assert.first(file => {
          expect(file.data.resourceId).to.equal('foo');
        }))
        .pipe(assert.second(file => {
          expect(file.data.resourceId).to.equal('bar/baz');
        }))
        .pipe(assert.end(done));
    });

    it('should strip order part from filename', done => {
      array([create('#01.hello.yml', {})])
        .pipe(minisite())
        .pipe(assert.length(1))
        .pipe(assert.first(file => {
          expect(file.path).to.equal('/root/base/hello/index.html');
        }))
        .pipe(assert.end(done));
    });

    it('should not allow document to override reserved property', cb => {
      array([create('foo.yml', {resourceId: 'id'})])
        .pipe(minisite())
        .pipe(assert.length(1))
        .pipe(assert.first(file => {
          expect(file.data.resourceId).to.not.equal('id');
          expect(file.data.resourceId).to.equal('foo');
          expect(file.data.data.resourceId).to.equal('id');
        }))
        .pipe(assert.end(cb));
    });

  });

  // locale
  // ------

  describe('filename/filepath transformer (locale)', () => {

    it('should prefix locale to path', done => {
      array([create('hello.ja.yml', {})])
        .pipe(minisite({locales: ['ja']}))
        .pipe(assert.length(1))
        .pipe(assert.first(file => {
          expect(file.path).to.equal('/root/base/ja/hello/index.html');
        }))
        .pipe(assert.end(done));
    });

    it('should prefix locale to path even if it is not a document', done => {
      array([create('hello.ja.txt', null, '')])
        .pipe(minisite({locales: ['ja']}))
        .pipe(assert.length(1))
        .pipe(assert.first(file => {
          expect(file.path).to.equal('/root/base/ja/hello.txt');
        }))
        .pipe(assert.end(done));
    });

    it('should not prefix locale to path if it is default locale', done => {
      array([create('hello.ja.yml', {})])
        .pipe(minisite({locales: ['ja'], defaultLocale: 'ja'}))
        .pipe(assert.length(1))
        .pipe(assert.first(file => {
          expect(file.path).to.equal('/root/base/hello/index.html');
        }))
        .pipe(assert.end(done));
    });

    it('should assign default locale to document if it is specified', done => {
      array([create('hello.yml', {})])
        .pipe(minisite({locales: ['ja'], defaultLocale: 'ja'}))
        .pipe(assert.length(1))
        .pipe(assert.first(file => {
          expect(file.data.locale).to.equal('ja');
        }))
        .pipe(assert.end(done));
    });

    it('should not assign any locale to document if default locale is not specified', done => {
      array([create('hello.yml', {})])
        .pipe(minisite({locales: ['ja']}))
        .pipe(assert.length(1))
        .pipe(assert.first(file => {
          expect(file.data.locale).to.not.be.ok;
          expect(file.path).to.equal('/root/base/hello/index.html');
        }))
        .pipe(assert.end(done));
    });

    it('should ignore unknown locale', done => {
      array([create('hello.ja.yml', {})])
        .pipe(minisite({locales: ['en']}))
        .pipe(assert.length(1))
        .pipe(assert.first(file => {
          expect(file.path).to.equal('/root/base/hello.ja/index.html');
        }))
        .pipe(assert.end(done));
    });

    it('should give documents the same resource id if only a locale differs', done => {
      array([
        create('foo.yml', {}),
        create('bar/baz.yml', {}),
        create('foo.ja.yml', {}),
        create('bar/baz.ja.yml', {}),
      ])
        .pipe(minisite({locales: ['en', 'ja'], defaultLocale: 'en'}))
        .pipe(assert.length(4))
        .pipe(assert.first(file => {
          expect(file.data.resourceId).to.equal('foo');
        }))
        .pipe(assert.second(file => {
          expect(file.data.resourceId).to.equal('bar/baz');
        }))
        .pipe(assert.nth(2, file => {
          expect(file.data.resourceId).to.equal('foo');
        }))
        .pipe(assert.nth(3, file => {
          expect(file.data.resourceId).to.equal('bar/baz');
        }))
        .pipe(assert.end(done));
    });

  });

  // hidden
  // ======

  describe('filename/filepath transformer (hidden)', () => {
    it('should not output files for hidden documents', cb => {
      array([create('.foo.yml', {})])
        .pipe(minisite())
        .pipe(assert.length(0))
        .pipe(assert.end(cb));
    });

    it('should have access to hidden documents', cb => {
      array([
        create('items.yml', {}),
        create('items/.foo.yml', {childItem: true}),
        create('items/.bar.yml', {childItem: true}),
        create('items/.baz.yml', {childItem: true}),
      ])
        .pipe(minisite())
        .pipe(assert.length(1))
        .pipe(assert.first(file => {
          expect(file.data.slug).to.equal('items');
          expect(file.data.collection).to.have.lengthOf(3);
          expect(file.data.collection[0].childItem).to.be.true;
        }))
        .pipe(assert.end(cb));
    });

    it('should accept order part after hidden dot', cb => {
      array([
        create('items.yml', {}),
        create('items/.#001.foo.yml', {title: 'FOO'}),
        create('items/.#002.bar.yml', {title: 'BAR'}),
        create('items/.#003.baz.yml', {title: 'BAZ'}),
      ])
        .pipe(minisite())
        .pipe(assert.length(1))
        .pipe(assert.first(file => {
          expect(file.data.collection[0].title).to.equal('FOO');
          expect(file.data.collection[1].title).to.equal('BAR');
          expect(file.data.collection[2].title).to.equal('BAZ');
        }))
        .pipe(assert.end(cb));
    });
  });

  // template engine
  // ===============

  describe('template engine', () => {

    it('should render content by default', done => {
      array([create('hello.yml', {
        template: 'hello.njk',
        title: 'Hello',
        description: 'World',
      })])
        .pipe(minisite({
          render: engineNunjucks({path: 'test/tmpl-basic'}),
        }))
        .pipe(assert.length(1))
        .pipe(assert.first(file => {
          expect(file.contents.toString().trim()).to.equal('Hello - World');
        }))
        .pipe(assert.end(done));
    });

    it('should render content with custom engine', done => {
      array([create('hello.yml', {
        template: true,
        title: 'Hello',
        description: 'World',
      })])
        .pipe(minisite({
          render: context => {
            if (!context.page.template) {
              return context.page.body;
            }
            const nunjucks = require('nunjucks');
            nunjucks.configure({noCache: true});
            return nunjucks.renderString('{{ page.title }} - {{ page.description }}', context);
          },
        }))
        .pipe(assert.length(1))
        .pipe(assert.first(file => {
          expect(file.contents.toString().trim()).to.equal('Hello - World');
        }))
        .pipe(assert.end(done));
    });

    it('should inherit template', done => {
      array([create('hello.yml', {
        template: 'pages/hello.njk',
        title: 'Hello',
      })])
        .pipe(minisite({
          render: engineNunjucks({path: 'test/tmpl-inheritance'}),
        }))
        .pipe(assert.length(1))
        .pipe(assert.first(file => {
          expect(file.contents.toString().trim()).to.equal('Root - Hello');
        }))
        .pipe(assert.end(done));
    });

    it('should include template', done => {
      array([create('hello.yml', {
        template: 'pages/hello.njk',
        title: 'Hello',
      })])
        .pipe(minisite({
          render: engineNunjucks({path: 'test/tmpl-include'}),
        }))
        .pipe(assert.length(1))
        .pipe(assert.first(file => {
          expect(file.contents.toString().trim()).to.equal('Hello - Partial');
        }))
        .pipe(assert.end(done));
    });

    it('should have markdown filter by default', done => {
      array([create('hello.md', {
        template: 'hello.njk',
      }, 'Hello **World**')])
        .pipe(minisite({
          render: engineNunjucks({path: 'test/tmpl-markdown'}),
          documentTypes: ['md'],
        }))
        .pipe(assert.length(1))
        .pipe(assert.first(file => {
          expect(file.contents.toString().trim().replace(/[\n\t]+/g, '')).to.equal('<p>Hello <strong>World</strong></p>');
        }))
        .pipe(assert.end(done));
    });

    it('should make markdown filter not to throw error even if empty string, null, or undefined is passed', done => {
      array([create('hello.yml', {
        template: 'hello.njk',
        emptyString: '',
        nullValue: null,
      })])
        .pipe(minisite({
          render: engineNunjucks({path: 'test/tmpl-markdown-null'}),
        }))
        .pipe(assert.length(1))
        .pipe(assert.end(done));
    });

    it('should render content asynchronously', done => {
      array([create('hello.yml', {
        template: 'hello.njk',
        title: 'Hello',
        description: 'World',
      })])
        .pipe(minisite({
          render: context => {
            return new Promise((resolve, reject) => {
              setTimeout(() => {
                const render = engineNunjucks({path: 'test/tmpl-basic'});
                resolve(render(context));
              }, 500);
            });
          },
        }))
        .pipe(assert.length(1))
        .pipe(assert.first(file => {
          expect(file.contents.toString().trim()).to.equal('Hello - World');
        }))
        .pipe(assert.end(done));
    });

  });

  // template variable: site
  // =======================

  describe('template variable: site', () => {

    it('should be the object passed to minisite()', done => {
      array([create('hello.yml', {title: 'Hello', template: true})])
        .pipe(minisite({
          site: {name: 'Site'},
          render: context => {
            if (!context.page.template) {
              return context.page.body;
            }
            expect(context.site.name).to.equal('Site');
            return context.page.title;
          },
        }))
        .pipe(assert.length(1))
        .pipe(assert.first(file => {
          expect(file.contents.toString()).to.equal('Hello');
        }))
        .pipe(assert.end(done));
    });

    it('should be assigned to locale specific objects if it has the exact same locales with options.locales', done => {
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
          render: context => {
            if (!context.page.template) {
              return context.page.body;
            }
            expect(context.site).to.not.have.property('');
            expect(context.site).to.not.have.property('en');
            expect(context.site).to.not.have.property('ja');
            ({
              '': () => {
                expect(context.site.name).to.equal('No locale');
              },
              en: () => {
                expect(context.site.name).to.equal('En');
              },
              ja: () => {
                expect(context.site.name).to.equal('Ja');
              },
            })[context.page.locale || '']();
            return context.page.title;
          },
        }))
        .pipe(assert.length(3))
        .pipe(assert.first(file => {
          expect(file.contents.toString()).to.equal('Hello');
        }))
        .pipe(assert.second(file => {
          expect(file.contents.toString()).to.equal('Hello En');
        }))
        .pipe(assert.nth(2, file => {
          expect(file.contents.toString()).to.equal('Hello Ja');
        }))
        .pipe(assert.end(done));
    });

    it('should be the object passed to minisite() if it doesn’t have the exact same locales with options.locales', done => {
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
          render: context => {
            if (!context.page.template) {
              return context.page.body;
            }
            expect(context.site.name).to.equal('Site');
            expect(context.site[''].name).to.equal('No locale');
            expect(context.site.en.name).to.equal('En');
            expect(context.site.ja.name).to.equal('Ja');
            return context.page.title;
          },
        }))
        .pipe(assert.length(3))
        .pipe(assert.first(file => {
          expect(file.contents.toString()).to.equal('Hello');
        }))
        .pipe(assert.second(file => {
          expect(file.contents.toString()).to.equal('Hello En');
        }))
        .pipe(assert.nth(2, file => {
          expect(file.contents.toString()).to.equal('Hello Ja');
        }))
        .pipe(assert.end(done));
    });

    it('should be reached to global site variable via global.site', done => {
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
          render: context => {
            if (!context.page.template) {
              return context.page.body;
            }
            expect(context.global[''].site.name).to.equal('No locale');
            expect(context.global['en'].site.name).to.equal('En');
            expect(context.global['ja'].site.name).to.equal('Ja');
            return context.page.title;
          },
        }))
        .pipe(assert.length(3))
        .pipe(assert.first(file => {
          expect(file.contents.toString()).to.equal('Hello');
        }))
        .pipe(assert.end(done));
    });

  });

  // template variable: page
  // =======================

  describe('template variable: page', () => {

    it('should have shallow attribute access', done => {
      array([create('hello.yml', {title: 'Hello', myData: 'World'})])
        .pipe(minisite())
        .pipe(assert.length(1))
        .pipe(assert.first(file => {
          expect(file.data.title).to.equal('Hello');
          expect(file.data.myData).to.equal('World');
        }))
        .pipe(assert.end(done));
    });

    it('should have order property', cb => {
      array([
        create('foo.yml', {}),
        create('#1.bar.yml', {}),
      ])
        .pipe(minisite())
        .pipe(assert.length(2))
        .pipe(assert.first(file => {
          expect(file.data.order).to.be.null;
        }))
        .pipe(assert.second(file => {
          expect(file.data.order).to.not.be.null;
          expect(file.data.order).to.equal('1');
        }))
        .pipe(assert.end(cb));
    });

    it('should have hidden property', cb => {
      array([
        create('items.yml', {}),
        create('items/.foo.yml', {}),
      ])
        .pipe(minisite())
        .pipe(assert.length(1))
        .pipe(assert.first(file => {
          expect(file.data.hidden).to.be.a('boolean');
          expect(file.data.hidden).to.be.false;
          expect(file.data.collection[0].hidden).to.be.a('boolean');
          expect(file.data.collection[0].hidden).to.be.true;
        }))
        .pipe(assert.end(cb));
    });

    it('should have slug property', cb => {
      array([
        create('foo.yml', {}),
        create('#1.bar.yml', {}),
      ])
        .pipe(minisite())
        .pipe(assert.length(2))
        .pipe(assert.first(file => {
          expect(file.data.slug).to.equal('foo');
        }))
        .pipe(assert.second(file => {
          expect(file.data.slug).to.equal('bar');
        }))
        .pipe(assert.end(cb));
    });

    it('should have locale property', cb => {
      array([
        create('foo.yml', {}),
        create('bar.en.yml', {}),
        create('baz.ja.yml', {}),
      ])
        .pipe(minisite({locales: ['en', 'ja']}))
        .pipe(assert.length(3))
        .pipe(assert.first(file => {
          expect(file.data.locale).to.equal('');
        }))
        .pipe(assert.second(file => {
          expect(file.data.locale).to.equal('en');
        }))
        .pipe(assert.nth(2, file => {
          expect(file.data.locale).to.equal('ja');
        }))
        .pipe(assert.end(cb));
    });

    it('should have document property', cb => {
      array([
        create('foo.yml', {}),
        create('bar.txt', {}),
      ])
        .pipe(minisite())
        .pipe(assert.length(2))
        .pipe(assert.first(file => {
          expect(file.data.document).to.be.true;
        }))
        .pipe(assert.second(file => {
          expect(file.data.document).to.be.false;
        }))
        .pipe(assert.end(cb));
    });

    it('should have dirnames property', cb => {
      array([
        create('foo.yml', {}),
        create('foo/bar.yml', {}),
        create('foo/bar/baz.yml', {}),
      ])
        .pipe(minisite())
        .pipe(assert.length(3))
        .pipe(assert.first(file => {
          expect(file.data.dirnames).to.eql(['foo']);
        }))
        .pipe(assert.second(file => {
          expect(file.data.dirnames).to.eql(['foo', 'bar']);
        }))
        .pipe(assert.nth(2, file => {
          expect(file.data.dirnames).to.eql(['foo', 'bar', 'baz']);
        }))
        .pipe(assert.end(cb));
    });

    it('should have path property', cb => {
      array([
        create('index.yml', {}),
        create('foo.yml', {}),
        create('foo/bar.yml', {}),
        create('foo/bar/baz.yml', {}),
      ])
        .pipe(minisite())
        .pipe(assert.length(4))
        .pipe(assert.first(file => {
          expect(file.data.path).to.equal('/');
        }))
        .pipe(assert.second(file => {
          expect(file.data.path).to.equal('/foo/');
        }))
        .pipe(assert.nth(2, file => {
          expect(file.data.path).to.equal('/foo/bar/');
        }))
        .pipe(assert.nth(3, file => {
          expect(file.data.path).to.equal('/foo/bar/baz/');
        }))
        .pipe(assert.end(cb));
    });

    it('should have filepath property', cb => {
      array([
        create('foo.yml', {}),
        create('foo/bar.yml', {}),
        create('foo/bar/baz.yml', {}),
      ])
        .pipe(minisite())
        .pipe(assert.length(3))
        .pipe(assert.first(file => {
          expect(file.data.filepath).to.equal('/root/base/foo/index.html');
        }))
        .pipe(assert.second(file => {
          expect(file.data.filepath).to.equal('/root/base/foo/bar/index.html');
        }))
        .pipe(assert.nth(2, file => {
          expect(file.data.filepath).to.equal('/root/base/foo/bar/baz/index.html');
        }))
        .pipe(assert.end(cb));
    });

    it('should have resourceId property', cb => {
      array([
        create('foo.yml', {}),
        create('foo/bar.yml', {}),
        create('foo/bar/baz.yml', {}),
      ])
        .pipe(minisite())
        .pipe(assert.length(3))
        .pipe(assert.first(file => {
          expect(file.data.resourceId).to.equal('foo');
        }))
        .pipe(assert.second(file => {
          expect(file.data.resourceId).to.equal('foo/bar');
        }))
        .pipe(assert.nth(2, file => {
          expect(file.data.resourceId).to.equal('foo/bar/baz');
        }))
        .pipe(assert.end(cb));
    });

    it('should have collectionId property', cb => {
      array([
        create('foo.yml', {}),
        create('foo/bar.yml', {}),
        create('foo/bar/baz.yml', {}),
      ])
        .pipe(minisite())
        .pipe(assert.length(3))
        .pipe(assert.first(file => {
          expect(file.data.collectionId).to.equal('');
        }))
        .pipe(assert.second(file => {
          expect(file.data.collectionId).to.equal('foo');
        }))
        .pipe(assert.nth(2, file => {
          expect(file.data.collectionId).to.equal('foo/bar');
        }))
        .pipe(assert.end(cb));
    });

    it('should have data property', cb => {
      array([
        create('foo.yml', {title: 'Foo'}),
        create('bar.yml', {}),
        create('baz.yml', 'Baz'),
      ])
        .pipe(minisite())
        .pipe(assert.length(3))
        .pipe(assert.first(file => {
          expect(file.data.data).to.eql({title: 'Foo'});
        }))
        .pipe(assert.second(file => {
          expect(file.data.data).to.eql({});
        }))
        .pipe(assert.nth(2, file => {
          expect(file.data.data).to.equal('Baz');
        }))
        .pipe(assert.end(cb));
    });

    it('should have body property', cb => {
      array([
        create('foo.yml', {}),
        create('bar.md', {}, 'Bar'),
      ])
        .pipe(minisite({documentTypes: ['yml', 'md']}))
        .pipe(assert.length(2))
        .pipe(assert.first(file => {
          expect(file.data.body).to.equal('');
        }))
        .pipe(assert.second(file => {
          expect(file.data.body).to.equal('Bar');
        }))
        .pipe(assert.end(cb));
    });

  });

  // collection
  // ----------

  describe('template variable: page.collection', () => {

    it('should have collection related to index page', done => {
      array([
        create('items/index.yml', {}),
        create('items/#1.foo.yml', {title: 'FOO'}),
        create('items/#2.bar.yml', {title: 'BAR'}),
        create('items/#3.baz.yml', {title: 'BAZ'}),
      ])
        .pipe(minisite())
        .pipe(assert.length(4))
        .pipe(assert.first(file => {
          expect(file.data.collection).to.be.an('array');
          expect(file.data.collection).to.have.length(3);
          expect(file.data.collection[0].title).to.equal('FOO');
          expect(file.data.collection[1].title).to.equal('BAR');
          expect(file.data.collection[2].title).to.equal('BAZ');
        }))
        .pipe(assert.end(done));
    });

    it('should have collection related to index page (with locales)', done => {
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
        .pipe(assert.first(file => {
          expect(file.data.collection).to.be.an('array');
          expect(file.data.collection).to.have.length(3);
          expect(file.data.collection[0].title).to.equal('FOO');
          expect(file.data.collection[1].title).to.equal('BAR');
          expect(file.data.collection[2].title).to.equal('BAZ');
        }))
        .pipe(assert.nth(4, file => {
          expect(file.data.collection).to.be.an('array');
          expect(file.data.collection).to.have.length(3);
          expect(file.data.collection[0].title).to.equal('FOO J');
          expect(file.data.collection[1].title).to.equal('BAR J');
          expect(file.data.collection[2].title).to.equal('BAZ J');
        }))
        .pipe(assert.end(done));
    });

    it('should have collection related to page even if it is not an index', done => {
      array([
        create('items/foo.yml', {title: 'FOO'}),
        create('items/foo/001.yml', {title: 'FOO 001'}),
        create('items/foo/002.yml', {title: 'FOO 002'}),
        create('items/foo/003.yml', {title: 'FOO 003'}),
      ])
        .pipe(minisite())
        .pipe(assert.length(4))
        .pipe(assert.first(file => {
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

  describe('template variable: page.locales', () => {

    it('should have references to the other locale pages representing the same resource', done => {
      array([
        create('hello.en.yml', {title: 'Hello En'}),
        create('hello.ja.yml', {title: 'Hello Ja'}),
        create('hello.de.yml', {title: 'Hello De'}),
      ])
        .pipe(minisite({locales: ['en', 'ja', 'de']}))
        .pipe(assert.length(3))
        .pipe(assert.first(file => {
          expect(file.data.title).to.equal('Hello En');
          expect(file.data.locales.en.title).to.equal('Hello En');
          expect(file.data.locales.ja.title).to.equal('Hello Ja');
          expect(file.data.locales.de.title).to.equal('Hello De');
        }))
        .pipe(assert.second(file => {
          expect(file.data.title).to.equal('Hello Ja');
          expect(file.data.locales.en.title).to.equal('Hello En');
          expect(file.data.locales.ja.title).to.equal('Hello Ja');
          expect(file.data.locales.de.title).to.equal('Hello De');
        }))
        .pipe(assert.nth(2, file => {
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

  describe('template variable: page.prev, page.next', () => {

    it('should link to next document in the same collection', done => {
      array([
        create('items/001.yml', {title: '1'}),
        create('items/002.yml', {title: '2'}),
        create('items/003.yml', {title: '3'}),
      ])
        .pipe(minisite())
        .pipe(assert.length(3))
        .pipe(assert.first(file => {
          expect(file.data.next).to.exist;
          expect(file.data.next.title).to.equal('2');
        }))
        .pipe(assert.second(file => {
          expect(file.data.next).to.exist;
          expect(file.data.next.title).to.equal('3');
        }))
        .pipe(assert.nth(2, file => {
          expect(file.data.next).to.be.null;
        }))
        .pipe(assert.end(done));
    });

    it('should link to prev document in the same collection', done => {
      array([
        create('items/001.yml', {title: '1'}),
        create('items/002.yml', {title: '2'}),
        create('items/003.yml', {title: '3'}),
      ])
        .pipe(minisite())
        .pipe(assert.length(3))
        .pipe(assert.first(file => {
          expect(file.data.prev).to.be.null;
        }))
        .pipe(assert.second(file => {
          expect(file.data.prev).to.exist;
          expect(file.data.prev.title).to.equal('1');
        }))
        .pipe(assert.nth(2, file => {
          expect(file.data.prev).to.exist;
          expect(file.data.prev.title).to.equal('2');
        }))
        .pipe(assert.end(done));
    });

  });

  // template variable: pages
  // ========================

  describe('template variable: pages', () => {

    it('should contain all pages', done => {
      array([
        create('foo.yml', {title: 'FOO', template: true}),
        create('bar.yml', {title: 'BAR'}),
        create('items/index.yml', {}),
        create('items/baz.yml', {title: 'BAZ'}),
        create('items/qux.yml', {title: 'QUX'}),
      ])
        .pipe(minisite({render: context => {
          if (!context.page.template) {
            return context.page.body;
          }
          expect(context.pages).to.have.length(5);
          return context.page.title;
        }}))
        .pipe(assert.length(5))
        .pipe(assert.first(file => {
          expect(file.contents.toString()).to.equal('FOO');
        }))
        .pipe(assert.end(done));
    });

    it('should contain all pages (with locales)', done => {
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
          render: context => {
            if (!context.page.template) {
              return context.page.body;
            }
            expect(context.pages).to.have.length(5);
            expect(context.global['en'].pages).to.have.length(5);
            expect(context.global['ja'].pages).to.have.length(5);
            return context.page.title;
          },
        }))
        .pipe(assert.length(10))
        .pipe(assert.first(file => {
          expect(file.contents.toString()).to.equal('FOO');
        }))
        .pipe(assert.end(done));
    });

  });

  // template variable: references
  // =============================

  describe('template variable: references', () => {

    it('should refer to page by resource id', done => {
      array([
        create('foo.yml', {template: true, title: 'FOO'}),
        create('bar/baz.yml', {title: 'BAZ'}),
      ])
        .pipe(minisite({render: context => {
          if (!context.page.template) {
            return context.page.body;
          }
          expect(context.references['foo'].title).to.equal('FOO');
          expect(context.references['bar/baz'].title).to.equal('BAZ');
          return context.page.title;
        }}))
        .pipe(assert.length(2))
        .pipe(assert.first(file => {
          expect(file.contents.toString()).to.equal('FOO');
        }))
        .pipe(assert.end(done));
    });

    it('should refer to page by resource id (with locales)', done => {
      array([
        create('foo.yml', {template: true, title: 'FOO'}),
        create('bar/baz.yml', {title: 'BAZ'}),
        create('foo.ja.yml', {title: 'FOO J'}),
        create('bar/baz.ja.yml', {title: 'BAZ J'}),
      ])
        .pipe(minisite({
          locales: ['en', 'ja'],
          defaultLocale: 'en',
          render: context => {
            if (!context.page.template) {
              return context.page.body;
            }
            expect(context.references['foo'].title).to.equal('FOO');
            expect(context.global['en'].references['foo'].title).to.equal('FOO');
            expect(context.global['en'].references['bar/baz'].title).to.equal('BAZ');
            expect(context.global['ja'].references['foo'].title).to.equal('FOO J');
            expect(context.global['ja'].references['bar/baz'].title).to.equal('BAZ J');
            return context.page.title;
          },
        }))
        .pipe(assert.length(4))
        .pipe(assert.first(file => {
          expect(file.contents.toString()).to.equal('FOO');
        }))
        .pipe(assert.end(done));
    });

  });

  // template variable: collections
  // ==============================

  describe('template variable: collections', () => {

    it('should refer to collection of pages by collection id', done => {
      array([
        create('items/foo.yml', {title: 'FOO', template: true}),
        create('items/bar.yml', {title: 'BAR'}),
        create('items/baz.yml', {title: 'BAZ'}),
        create('products/category/foo.yml', {title: 'FOO'}),
        create('products/category/bar.yml', {title: 'BAR'}),
      ])
        .pipe(minisite({render: context => {
          if (!context.page.template) {
            return context.page.body;
          }
          expect(context.collections['items']).to.be.an('array');
          expect(context.collections['items']).to.have.length(3);
          expect(context.collections['products/category']).to.be.an('array');
          expect(context.collections['products/category']).to.have.length(2);
          return context.page.title;
        }}))
        .pipe(assert.length(5))
        .pipe(assert.first(file => {
          expect(file.contents.toString()).to.equal('FOO');
        }))
        .pipe(assert.end(done));
    });

    it('should refer to collection of pages by collection id (with locales)', done => {
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
          render: context => {
            if (!context.page.template) {
              return context.page.body;
            }
            expect(context.collections['items']).to.be.an('array');
            expect(context.global['en'].collections['items']).to.be.an('array');
            expect(context.global['en'].collections['items']).to.have.length(3);
            expect(context.global['ja'].collections['items']).to.be.an('array');
            expect(context.global['ja'].collections['items']).to.have.length(3);
            return context.page.title;
          },
        }))
        .pipe(assert.length(6))
        .pipe(assert.first(file => {
          expect(file.contents.toString()).to.equal('FOO');
        }))
        .pipe(assert.end(done));
    });

    it('should sort documents in collection by order part of filename', done => {
      array([
        create('items/#2.bar.yml', {title: 'BAR', template: true}),
        create('items/#3.baz.yml', {title: 'BAZ'}),
        create('items/#1.foo.yml', {title: 'FOO'}),
      ])
        .pipe(minisite({render: context => {
          if (!context.page.template) {
            return context.page.body;
          }
          expect(context.collections['items']).to.be.an('array');
          expect(context.collections['items']).to.have.length(3);
          expect(context.collections['items'][0].title).to.equal('FOO');
          expect(context.collections['items'][1].title).to.equal('BAR');
          expect(context.collections['items'][2].title).to.equal('BAZ');
          return context.page.title;
        }}))
        .pipe(assert.length(3))
        .pipe(assert.first(file => {
          expect(file.data.title).to.equal('BAR');
        }))
        .pipe(assert.end(done));
    });

  });

  // file injection
  // ==============

  describe('file injection', () => {

    it('should inject files (pagination example)', done => {
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
          inject: (global, options) => {
            return chunk(global[''].collections['items'], 3).map((_, i) => {
              return create(
                i === 0 ? 'items/index.yml' : 'items/page/' + (i + 1) + '.yml',
                {offset: i * 3}
              );
            });
          },
        }))
        .pipe(assert.length(14))
        .pipe(assert.nth(10, file => {
          expect(file.data.offset).to.equal(0);
          expect(file.path).to.equal('/root/base/items/index.html');
        }))
        .pipe(assert.nth(11, file => {
          expect(file.data.offset).to.equal(3);
          expect(file.path).to.equal('/root/base/items/page/2/index.html');
        }))
        .pipe(assert.nth(12, file => {
          expect(file.data.offset).to.equal(6);
          expect(file.path).to.equal('/root/base/items/page/3/index.html');
        }))
        .pipe(assert.nth(13, file => {
          expect(file.data.offset).to.equal(9);
          expect(file.path).to.equal('/root/base/items/page/4/index.html');
        }))
        .pipe(assert.end(done));
    });

    it('should inject files (category example)', done => {
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
          inject: (global, options) => {
            const group = groupBy(global[''].collections['items'], item => {
              return item.category;
            });
            const categories = [];
            for (const category in group) {
              categories.push(create('items/category/' + category + '.yml', {
                category: category,
                count: group[category].length,
              }));
            }
            return categories;
          },
        }))
        .pipe(assert.length(14))
        .pipe(assert.nth(10, file => {
          expect(file.data.category).to.equal('a');
          expect(file.data.count).to.equal(2);
          expect(file.path).to.equal('/root/base/items/category/a/index.html');
        }))
        .pipe(assert.nth(11, file => {
          expect(file.data.category).to.equal('b');
          expect(file.data.count).to.equal(3);
          expect(file.path).to.equal('/root/base/items/category/b/index.html');
        }))
        .pipe(assert.nth(12, file => {
          expect(file.data.category).to.equal('c');
          expect(file.data.count).to.equal(4);
          expect(file.path).to.equal('/root/base/items/category/c/index.html');
        }))
        .pipe(assert.nth(13, file => {
          expect(file.data.category).to.equal('d');
          expect(file.data.count).to.equal(1);
          expect(file.path).to.equal('/root/base/items/category/d/index.html');
        }))
        .pipe(assert.end(done));
    });

    it('should inject files (date example)', done => {
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
          inject: (global, options) => {
            const group = groupBy(global[''].collections['items'], item => {
              return item.date.substr(0, 7);
            });
            const months = [];
            for (const month in group) {
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
        .pipe(assert.nth(10, file => {
          expect(file.data.year).to.equal(2014);
          expect(file.data.month).to.equal(10);
          expect(file.data.count).to.equal(1);
          expect(file.path).to.equal('/root/base/items/date/2014-10/index.html');
        }))
        .pipe(assert.nth(11, file => {
          expect(file.data.year).to.equal(2015);
          expect(file.data.month).to.equal(7);
          expect(file.data.count).to.equal(4);
          expect(file.path).to.equal('/root/base/items/date/2015-07/index.html');
        }))
        .pipe(assert.nth(12, file => {
          expect(file.data.year).to.equal(2015);
          expect(file.data.month).to.equal(9);
          expect(file.data.count).to.equal(3);
          expect(file.path).to.equal('/root/base/items/date/2015-09/index.html');
        }))
        .pipe(assert.nth(13, file => {
          expect(file.data.year).to.equal(2015);
          expect(file.data.month).to.equal(10);
          expect(file.data.count).to.equal(2);
          expect(file.path).to.equal('/root/base/items/date/2015-10/index.html');
        }))
        .pipe(assert.end(done));
    });

    it('should inject files multiple times', done => {
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
            (global, options) => {
              const items = global[''].pages.filter(item => {
                return 'keyword' in item;
              });
              const group = groupBy(items, item => {
                return item.keyword;
              });
              const keywords = [];
              for (const keyword in group) {
                keywords.push(create('keyword/' + keyword + '.yml', {
                  keyword: keyword,
                  count: group[keyword].length,
                }));
              }
              return keywords;
            },
            (global, options) => {
              return chunk(global[''].collections['keyword'], 3).map((_, i) => {
                return create(
                  i === 0 ? 'keyword/index.yml' : 'keyword/page/' + (i + 1) + '.yml',
                  {offset: i * 3}
                );
              });
            },
          ],
        }))
        .pipe(assert.length(22))
        .pipe(assert.nth(16, file => {
          expect(file.data.keyword).to.equal('a');
          expect(file.path).to.equal('/root/base/keyword/a/index.html');
        }))
        .pipe(assert.nth(20, file => {
          expect(file.data.offset).to.equal(0);
          expect(file.path).to.equal('/root/base/keyword/index.html');
        }))
        .pipe(assert.nth(21, file => {
          expect(file.data.offset).to.equal(3);
          expect(file.path).to.equal('/root/base/keyword/page/2/index.html');
        }))
        .pipe(assert.end(done));
    });

    it('should inject files asynchronously', done => {
      array([create('index.yml')])
        .pipe(minisite({
          inject: [
            (global, options) => {
              return new Promise((resolve, reject) => {
                setTimeout(() => {
                  resolve([create('hello.yml')]);
                }, 500);
              });
            },
            (global, options) => {
              return new Promise((resolve, reject) => {
                setTimeout(() => {
                  resolve([create('world.yml')]);
                }, 500);
              });
            },
          ],
        }))
        .pipe(assert.length(3))
        .pipe(assert.first(file => {
          expect(file.path).to.equal('/root/base/index.html');
        }))
        .pipe(assert.nth(1, file => {
          expect(file.path).to.equal('/root/base/hello/index.html');
        }))
        .pipe(assert.nth(2, file => {
          expect(file.path).to.equal('/root/base/world/index.html');
        }))
        .pipe(assert.end(done));
    });

    it('should accept a single file object', done => {
      array([create('foo.yml')])
        .pipe(minisite({
          inject: () => create('bar.yml', {title: 'Bar'}),
        }))
        .pipe(assert.length(2))
        .pipe(assert.second(file => {
          expect(file.data.title).to.equal('Bar');
          expect(file.data.path).to.equal('/bar/');
        }))
        .pipe(assert.end(done));
    });

    it('should accept a plain object', done => {
      array([create('foo.yml')])
        .pipe(minisite({
          inject: () => ({path: 'bar.yml', contents: 'title: Bar'}),
        }))
        .pipe(assert.length(2))
        .pipe(assert.second(file => {
          expect(file.data.title).to.equal('Bar');
          expect(file.data.path).to.equal('/bar/');
        }))
        .pipe(assert.end(done));
    });

    it('should reject an invalid object to throw PluginError', done => {
      array([create('foo.yml')])
        .pipe(minisite({
          inject: () => 'invalid value',
        }))
        .on('error', e => {
          expect(e).to.be.an.instanceof(PluginError);
          done();
        });
    });

  });

  describe('custom model', () => {

    it('should accept a subclass of Resource', done => {
      const symbol = Symbol();
      class MyResource extends Resource {
        constructor(file, options) {
          super(file, options);
          this.bar = 'Bar';
          this[symbol] = 'Symbol';
        }
        boldTitle() {
          return `** ${this.title} **`;
        }
        get italicTitle() {
          return `_ ${this.title} _`;
        }
      }
      array([create('foo.yml', {title: 'Foo'})])
        .pipe(minisite({model: MyResource}))
        .pipe(assert.length(1))
        .pipe(assert.first(file => {
          expect(file.data.bar).to.equal('Bar');
          expect(file.data[symbol]).to.equal('Symbol');
          expect(file.data.boldTitle()).to.equal('** Foo **');
          expect(file.data.italicTitle).to.equal('_ Foo _');
        }))
        .pipe(assert.end(done));
    });

    it('should accept a function', done => {
      const symbol = Symbol();
      const model = (file, options) => {
        const resource = new Resource(file, options);
        resource.bar = 'Bar';
        resource[symbol] = 'Symbol';
        resource.boldTitle = function() {
          return `** ${this.title} **`;
        };
        Object.defineProperty(resource, 'italicTitle', {
          get: function() { return `_ ${this.title} _` },
        });
        return resource;
      };
      array([create('foo.yml', {title: 'Foo'})])
        .pipe(minisite({model: model}))
        .pipe(assert.length(1))
        .pipe(assert.first(file => {
          expect(file.data.bar).to.equal('Bar');
          expect(file.data[symbol]).to.equal('Symbol');
          expect(file.data.boldTitle()).to.equal('** Foo **');
          expect(file.data.italicTitle).to.equal('_ Foo _');
        }))
        .pipe(assert.end(done));
    });

    it('should accept a function which returns a Promise', done => {
      const symbol = Symbol();
      const model = (file, options) => {
        return new Promise((resolve, reject) => {
          setTimeout(() => {
            const resource = new Resource(file, options);
            resource.bar = 'Bar';
            resource[symbol] = 'Symbol';
            resource.boldTitle = function() {
              return `** ${this.title} **`;
            };
            Object.defineProperty(resource, 'italicTitle', {
              get: function() { return `_ ${this.title} _` },
            });
            resolve(resource);
          }, 500);
        });
      };
      array([create('foo.yml', {title: 'Foo'})])
        .pipe(minisite({model: model}))
        .pipe(assert.length(1))
        .pipe(assert.first(file => {
          expect(file.data.bar).to.equal('Bar');
          expect(file.data[symbol]).to.equal('Symbol');
          expect(file.data.boldTitle()).to.equal('** Foo **');
          expect(file.data.italicTitle).to.equal('_ Foo _');
        }))
        .pipe(assert.end(done));
    });

    it('should accept an object', done => {
      const symbol = Symbol();
      const model = {
        bar: 'Bar',
        [symbol]: 'Symbol',
        boldTitle() {
          return `** ${this.title} **`;
        },
        get italicTitle() {
          return `_ ${this.title} _`;
        },
      };
      array([create('foo.yml', {title: 'Foo'})])
        .pipe(minisite({model: model}))
        .pipe(assert.length(1))
        .pipe(assert.first(file => {
          expect(file.data.bar).to.equal('Bar');
          expect(file.data[symbol]).to.equal('Symbol');
          expect(file.data.boldTitle()).to.equal('** Foo **');
          expect(file.data.italicTitle).to.equal('_ Foo _');
        }))
        .pipe(assert.end(done));
    });

    it('should reject invalid model to throw PluginError', done => {
      array([create('foo.yml', {title: 'Foo'})])
        .pipe(minisite({model: 'model'}))
        .on('error', e => {
          expect(e).to.be.an.instanceof(PluginError);
          done();
        });
    });

  });

  describe('modules', () => {

    it('should have minisite.Resource', () => {
      expect(minisite.Resource).to.equal(Resource);
    });

    it('should have minisite.engines.nunjucks', () => {
      expect(minisite.engines.nunjucks).to.equal(engineNunjucks);
    });

  });

});
